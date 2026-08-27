/**
 * @fileoverview Preservador de exportações ESM para o harness de execução e testes.
 *
 * Engines de ofuscação frequentemente encapsulam código em IIFEs ou renomeiam
 * identificadores no escopo raiz, o que pode quebrar declarações `export`.
 * Este utilitário:
 * 1. Extrai bindings exportados antes da ofuscação usando AST Acorn.
 * 2. Remove temporariamente as declarações `export` para permitir a transformação.
 * 3. Re-anexa as declarações `export { ... }` ao código protegido final.
 */

import * as acorn from 'acorn';

/**
 * Coleta os nomes dos identificadores locais que são exportados em um módulo ESM.
 *
 * @param {string} sourceCode - Código-fonte JavaScript em formato de módulo.
 * @returns {string[]} Lista de nomes de identificadores exportados.
 */
export function extractExportedBindings(sourceCode) {
  const program = acorn.parse(sourceCode, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });

  const bindings = [];

  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') {
      continue;
    }

    if (node.declaration) {
      collectDeclarationBindings(node.declaration, bindings);
      continue;
    }

    for (const specifier of node.specifiers ?? []) {
      const localName =
        specifier.local.type === 'Identifier' ? specifier.local.name : null;
      if (localName) {
        bindings.push(localName);
      }
    }
  }

  return bindings;
}


function collectDeclarationBindings(declaration, bindings) {
  if (
    declaration.type === 'FunctionDeclaration' ||
    declaration.type === 'ClassDeclaration'
  ) {
    if (declaration.id?.name) {
      bindings.push(declaration.id.name);
    }
    return;
  }

  if (declaration.type === 'VariableDeclaration') {
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === 'Identifier') {
        bindings.push(declarator.id.name);
      }
    }
  }
}

/**
 * Remove export keywords while preserving declarations and non-export statements.
 */
export function stripModuleExports(sourceCode) {
  const program = acorn.parse(sourceCode, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });

  const parts = [];
  let cursor = 0;

  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      parts.push(sourceCode.slice(cursor, node.start));

      if (node.declaration) {
        parts.push(sourceCode.slice(node.declaration.start, node.end));
      }

      cursor = node.end;
      continue;
    }

    parts.push(sourceCode.slice(cursor, node.start));
    parts.push(sourceCode.slice(node.start, node.end));
    cursor = node.end;
  }

  parts.push(sourceCode.slice(cursor));
  return parts.join('');
}

function bindingExistsInScript(sourceCode, bindingName) {
  const escaped = bindingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\bclass\\s+${escaped}\\b`),
    new RegExp(`\\b(?:async\\s+)?function\\*?\\s*${escaped}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\b`),
  ];

  return patterns.some((pattern) => pattern.test(sourceCode));
}

/**
 * Re-export named bindings that still exist after protection.
 * Appends `export { ... }` when inline export restoration is unreliable (e.g. obfuscated IIFE).
 */
export function restoreModuleExports(sourceCode, exportedBindings) {
  if (!exportedBindings?.length) {
    return sourceCode;
  }

  const available = exportedBindings.filter((name) =>
    bindingExistsInScript(sourceCode, name),
  );

  if (available.length === 0) {
    return sourceCode;
  }

  const trimmed = sourceCode.trimEnd();
  const exportStatement = `export { ${available.join(', ')} };`;

  if (trimmed.endsWith(exportStatement)) {
    return trimmed;
  }

  return `${trimmed}\n${exportStatement}\n`;
}

/**
 * Strip exports before protection and restore them on the protected output.
 */
export function protectWithExportPreservation(sourceCode, protectFn) {
  const exportedBindings = extractExportedBindings(sourceCode);
  const protectionInput =
    exportedBindings.length > 0 ? stripModuleExports(sourceCode) : sourceCode;
  const result = protectFn(protectionInput);
  const code =
    exportedBindings.length > 0
      ? restoreModuleExports(result.code, exportedBindings)
      : result.code;

  return {
    ...result,
    code,
  };
}
