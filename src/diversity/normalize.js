import * as acorn from 'acorn';
import { detectSourceType } from '../core/hazard-policy.js';

export const NORMALIZATION_VERSION = '1';

export const TOKEN_NORMALIZATION_POLICY = Object.freeze({
  version: NORMALIZATION_VERSION,
  strips: Object.freeze(['whitespace', 'identifiers', 'literals']),
});

export const AST_NORMALIZATION_POLICY = Object.freeze({
  version: NORMALIZATION_VERSION,
  strips: Object.freeze(['whitespace', 'identifiers', 'literals']),
});

const LITERAL_TYPE_BY_VALUE = [
  ['bigint', 'BigInt'],
  ['boolean', 'Bool'],
  ['number', 'Num'],
  ['string', 'Str'],
  ['object', 'Null'],
  ['undefined', 'Undefined'],
];

function parseSource(sourceCode, parser = acorn) {
  const sourceType = detectSourceType(sourceCode);
  return parser.parse(sourceCode, {
    ecmaVersion: 'latest',
    allowHashBang: true,
    sourceType,
    locations: false,
  });
}

function literalPlaceholder(node) {
  // Acorn marks regex literals on the node; their value is a RegExp (or null when unsupported).
  if (node.regex) {
    return 'Regex';
  }
  const { value } = node;
  if (value === null) {
    return 'Null';
  }

  for (const [kind, placeholder] of LITERAL_TYPE_BY_VALUE) {
    if (typeof value === kind) {
      return placeholder;
    }
  }

  return 'Lit';
}

function normalizeIdentifierToken() {
  return 'Id';
}

function collectNormalizedTokens(node, tokens) {
  if (node === null || node === undefined) {
    return;
  }

  if (typeof node === 'string') {
    tokens.push(`Sym:${node}`);
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectNormalizedTokens(child, tokens);
    }
    return;
  }

  switch (node.type) {
    case 'Identifier':
      tokens.push(normalizeIdentifierToken());
      return;
    case 'Literal':
      tokens.push(literalPlaceholder(node));
      return;
    case 'PrivateIdentifier':
      tokens.push('PrivateId');
      return;
    case 'TemplateElement':
      tokens.push(node.value?.cooked === null ? 'TplNull' : 'Tpl');
      return;
    default:
      tokens.push(node.type);
      break;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'type') {
      continue;
    }
    collectNormalizedTokens(value, tokens);
  }
}

function normalizeAstNode(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child) => normalizeAstNode(child));
  }

  switch (node.type) {
    case 'Identifier':
      return { type: 'Identifier', name: 'Id' };
    case 'PrivateIdentifier':
      return { type: 'PrivateIdentifier', name: 'PrivateId' };
    case 'Literal': {
      const normalized = {
        type: 'Literal',
        valueType: literalPlaceholder(node),
      };
      if (node.regex) {
        normalized.regex = true;
      }
      return normalized;
    }
    case 'TemplateElement':
      return {
        type: 'TemplateElement',
        valueType: node.value?.cooked === null ? 'TplNull' : 'Tpl',
        tail: Boolean(node.tail),
      };
    default: {
      const normalized = { type: node.type };
      for (const [key, value] of Object.entries(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'raw') {
          continue;
        }
        if (typeof value === 'string') {
          normalized[key] = value;
          continue;
        }
        normalized[key] = normalizeAstNode(value);
      }
      return normalized;
    }
  }
}

export function normalizeTokens(sourceCode, { parser } = {}) {
  if (sourceCode.length === 0) {
    return [];
  }

  const ast = parseSource(sourceCode, parser);
  const tokens = [];
  collectNormalizedTokens(ast, tokens);
  return tokens;
}

export function normalizeAst(sourceCode, { parser } = {}) {
  if (sourceCode.length === 0) {
    return null;
  }

  const ast = parseSource(sourceCode, parser);
  return normalizeAstNode(ast);
}
