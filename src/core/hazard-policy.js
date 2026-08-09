import * as acorn from 'acorn';
import { traverse } from 'estraverse';
import { createPublicError } from './errors.js';

export function detectSourceType(sourceCode) {
  return /\b(import|export)\b/.test(sourceCode) ? 'module' : 'script';
}

export function parseJavaScript(sourceCode) {
  try {
    return acorn.parse(sourceCode, {
      ecmaVersion: 'latest',
      sourceType: detectSourceType(sourceCode),
    });
  } catch (error) {
    throw createPublicError(
      'UNSUPPORTED_SYNTAX',
      'source code is not valid JavaScript',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

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

function isFunctionConstructorCallee(callee) {
  return callee.type === 'Identifier' && callee.name === 'Function';
}

function isFunctionToStringCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }

  const { callee } = node;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'toString'
  );
}

function rejectWithStatementInSource(sourceCode) {
  if (/\bwith\s*\(/.test(sourceCode)) {
    throw createPublicError(
      'UNSUPPORTED_SYNTAX',
      'with statement is not supported',
      { hazard: 'with-statement' },
    );
  }
}

export function analyzeSemanticHazards(sourceCode) {
  rejectWithStatementInSource(sourceCode);
  const ast = parseJavaScript(sourceCode);

  traverse(ast, {
    enter(node) {
      if (node.type === 'CallExpression' && isEvalCallee(node.callee)) {
        throw createPublicError(
          'UNSUPPORTED_SYNTAX',
          'eval is not supported',
          { hazard: 'direct-eval' },
        );
      }

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

export function validateProtectedSyntax(sourceCode) {
  try {
    acorn.parse(sourceCode, {
      ecmaVersion: 'latest',
      sourceType: detectSourceType(sourceCode),
    });
  } catch (error) {
    throw createPublicError(
      'OUTPUT_CONFLICT',
      'protected code is not valid JavaScript',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
