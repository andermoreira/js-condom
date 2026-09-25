/**
 * @fileoverview Política de detecção de construções perigosas (Hazard Policy) para o js-condom.
 *
 * Analisa a AST do código de entrada para identificar construções JavaScript
 * semanticamente incompatíveis com ofuscação (ex: eval direto, construtor Function,
 * WithStatement, e dependência de Function.prototype.toString).
 */

import * as acorn from 'acorn';
import { traverse } from 'estraverse';
import { createPublicError } from './errors.js';

const PARSE_OPTIONS = Object.freeze({
  ecmaVersion: 'latest',
  allowHashBang: true,
});

const MODULE_SYNTAX_TYPES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'ExportAllDeclaration',
]);

/**
 * @param {string} sourceCode
 * @param {'module' | 'script'} sourceType
 * @returns {{ ok: true, ast: import('acorn').Node } | { ok: false, error: unknown }}
 */
function tryParse(sourceCode, sourceType) {
  try {
    return {
      ok: true,
      ast: acorn.parse(sourceCode, { ...PARSE_OPTIONS, sourceType }),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function hasModuleSyntax(ast) {
  return ast.body.some((node) => MODULE_SYNTAX_TYPES.has(node.type));
}

/**
 * Detecta se o código-fonte deve ser tratado como um módulo ECMAScript (ESM)
 * ou um script tradicional (CJS/Global).
 *
 * A decisão usa o parse, não uma busca textual: comentários e strings que
 * contêm "import" ou "export" não mudam o sourceType.
 *
 * @param {string} sourceCode - Código-fonte JavaScript.
 * @returns {'module' | 'script'}
 */
export function detectSourceType(sourceCode) {
  const asModule = tryParse(sourceCode, 'module');
  const asScript = tryParse(sourceCode, 'script');

  if (asModule.ok && asScript.ok) {
    return hasModuleSyntax(asModule.ast) ? 'module' : 'script';
  }

  if (asModule.ok) {
    return 'module';
  }

  if (asScript.ok) {
    return 'script';
  }

  const moduleMessage = asModule.error instanceof Error ? asModule.error.message : '';
  if (moduleMessage.includes("'with' in strict mode")) {
    return 'module';
  }

  return 'script';
}

/**
 * Realiza o parsing seguro do código JavaScript utilizando o Acorn.
 * Lança UNSUPPORTED_SYNTAX caso a sintaxe seja inválida.
 *
 * @param {string} sourceCode - Código-fonte a ser parseado.
 * @returns {import('acorn').Node} AST gerada pelo Acorn.
 */
export function parseJavaScript(sourceCode) {
  const sourceType = detectSourceType(sourceCode);

  try {
    return acorn.parse(sourceCode, {
      ...PARSE_OPTIONS,
      sourceType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Tratamento especial para 'with' em strict mode (ESM)
    if (message.includes("'with' in strict mode")) {
      throw createPublicError(
        'UNSUPPORTED_SYNTAX',
        'with statement is not supported',
        { hazard: 'with-statement' },
      );
    }

    throw createPublicError(
      'UNSUPPORTED_SYNTAX',
      'source code is not valid JavaScript',
      { cause: message },
    );
  }
}

/**
 * Verifica se o callee de uma chamada é uma invocação direta ou membro de eval().
 *
 * @param {import('acorn').Node} callee - Nó callee da expressão.
 * @returns {boolean}
 */
function isEvalCallee(callee) {
  if (callee.type === 'Identifier' && callee.name === 'eval') {
    return true;
  }

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'eval'
  ) {
    return true;
  }

  return false;
}

/**
 * Verifica se a chamada/instanciação invoca o construtor Function dinâmico.
 *
 * @param {import('acorn').Node} callee - Nó callee.
 * @returns {boolean}
 */
function isFunctionConstructorCallee(callee) {
  return callee.type === 'Identifier' && callee.name === 'Function';
}

/**
 * Receptores cujo toString é o de valor (número, string, objeto literal), não o de função.
 *
 * @param {import('acorn').Node} node
 * @returns {boolean}
 */
function isNonFunctionToStringReceiver(node) {
  switch (node.type) {
    case 'Literal':
    case 'TemplateLiteral':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
    case 'ConditionalExpression':
      return true;
    case 'NewExpression':
      return !isFunctionConstructorCallee(node.callee);
    default:
      return false;
  }
}

/**
 * `Function.prototype.toString.call/apply/bind(...)`.
 *
 * @param {import('acorn').Node} node
 * @returns {boolean}
 */
function isFunctionPrototypeToStringCall(node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
    return false;
  }

  const { callee } = node;
  if (
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    !['call', 'apply', 'bind'].includes(callee.property.name)
  ) {
    return false;
  }

  const toStringMember = callee.object;
  if (
    toStringMember.type !== 'MemberExpression' ||
    toStringMember.computed ||
    toStringMember.property.type !== 'Identifier' ||
    toStringMember.property.name !== 'toString'
  ) {
    return false;
  }

  const prototypeMember = toStringMember.object;
  return (
    prototypeMember.type === 'MemberExpression' &&
    !prototypeMember.computed &&
    prototypeMember.object.type === 'Identifier' &&
    prototypeMember.object.name === 'Function' &&
    prototypeMember.property.type === 'Identifier' &&
    prototypeMember.property.name === 'prototype'
  );
}

/**
 * Verifica se a chamada depende da representação textual de uma função.
 *
 * @param {import('acorn').Node} node - Nó CallExpression.
 * @returns {boolean}
 */
function isFunctionToStringCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }

  if (isFunctionPrototypeToStringCall(node)) {
    return true;
  }

  const { callee } = node;
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'toString'
  ) {
    return false;
  }

  return !isNonFunctionToStringReceiver(callee.object);
}

/**
 * Analisa a AST do código de entrada em busca de riscos semânticos e padrões proibidos.
 * Rejeita qualquer código contendo eval, Function constructor, with ou toString() reflexivo.
 *
 * @param {string} sourceCode - Código-fonte JavaScript a ser verificado.
 * @throws {import('./errors.js').JsCondomError} Lança erro público estruturado caso encontre perigo.
 */
export function analyzeSemanticHazards(sourceCode) {
  const ast = parseJavaScript(sourceCode);

  traverse(ast, {
    enter(node) {
      // 1. Rejeição de WithStatement (quando parseado em modo script)
      if (node.type === 'WithStatement') {
        throw createPublicError(
          'UNSUPPORTED_SYNTAX',
          'with statement is not supported',
          { hazard: 'with-statement' },
        );
      }

      // 2. Rejeição de eval direto ou global
      if (node.type === 'CallExpression' && isEvalCallee(node.callee)) {
        throw createPublicError(
          'UNSUPPORTED_SYNTAX',
          'eval is not supported',
          { hazard: 'direct-eval' },
        );
      }

      // 3. Rejeição do construtor Function (new Function(...) ou Function(...))
      if (
        (node.type === 'NewExpression' || node.type === 'CallExpression') &&
        isFunctionConstructorCallee(node.callee)
      ) {
        throw createPublicError(
          'SEMANTIC_HAZARD',
          'Function constructor is not supported',
          { hazard: 'function-constructor' },
        );
      }

      // 4. Rejeição de dependência de .toString() em funções
      if (isFunctionToStringCall(node)) {
        throw createPublicError(
          'SEMANTIC_HAZARD',
          'function text representation dependency is not supported',
          { hazard: 'function-prototype-tostring' },
        );
      }
    },
  });
}

/**
 * Valida se o código de saída produzido pela ofuscação possui sintaxe JavaScript válida.
 *
 * @param {string} sourceCode - Código protegido resultante.
 * @throws {import('./errors.js').JsCondomError} Lança erro caso a sintaxe seja inválida.
 */
export function validateProtectedSyntax(sourceCode) {
  try {
    acorn.parse(sourceCode, {
      ...PARSE_OPTIONS,
      sourceType: detectSourceType(sourceCode),
    });
  } catch (error) {
    throw createPublicError(
      'PROTECTION_FAILED',
      'protected code is not valid JavaScript',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

