import { normalizeAst, normalizeTokens } from './normalize.js';

const SUPPORTED_TOKEN_METRICS = new Set(['jaccard@1']);
const SUPPORTED_AST_METRICS = new Set(['tree-edit@1']);

export class SimilarityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SimilarityError';
    this.code = code;
    this.details = details;
  }
}

export function formatMetricId({ algorithm, version }) {
  return `${algorithm}@${version}`;
}

function assertSupportedMetric(metric, supported) {
  const metricId = formatMetricId(metric);
  if (!supported.has(metricId)) {
    throw new SimilarityError('unsupported_metric', `unsupported diversity metric: ${metricId}`, {
      metricId,
    });
  }
  return metricId;
}

function clampSimilarity(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function jaccardSimilarity(left, right) {
  if (left.length === 0 && right.length === 0) {
    return 1;
  }
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  if (union === 0) {
    return 1;
  }

  return clampSimilarity(intersection / union);
}

function treeSize(node) {
  if (node === null || node === undefined) {
    return 0;
  }

  if (Array.isArray(node)) {
    return node.reduce((total, child) => total + treeSize(child), 0);
  }

  if (typeof node !== 'object') {
    return 1;
  }

  let size = 1;
  for (const value of Object.values(node)) {
    size += treeSize(value);
  }
  return size;
}

function treeEditDistance(left, right) {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : treeSize(right);
  }
  if (right === null || right === undefined) {
    return treeSize(left);
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let row = 0; row < rows; row += 1) {
      matrix[row][0] = row;
    }
    for (let col = 0; col < cols; col += 1) {
      matrix[0][col] = col;
    }

    for (let row = 1; row < rows; row += 1) {
      for (let col = 1; col < cols; col += 1) {
        const substitutionCost =
          JSON.stringify(left[row - 1]) === JSON.stringify(right[col - 1]) ? 0 : 1;
        matrix[row][col] = Math.min(
          matrix[row - 1][col] + 1,
          matrix[row][col - 1] + 1,
          matrix[row - 1][col - 1] + substitutionCost,
        );
      }
    }

    return matrix[rows - 1][cols - 1];
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return 1 + treeEditDistance(left, null) + treeEditDistance(null, right);
  }

  if (typeof left !== 'object' || typeof right !== 'object') {
    return left === right ? 0 : 1;
  }

  if (left.type !== right.type) {
    return 1 + treeEditDistance(left, null) + treeEditDistance(null, right);
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  const keys = [...new Set([...leftKeys, ...rightKeys])];
  let distance = 0;

  for (const key of keys) {
    if (!(key in left)) {
      distance += treeSize(right[key]);
      continue;
    }
    if (!(key in right)) {
      distance += treeSize(left[key]);
      continue;
    }
    distance += treeEditDistance(left[key], right[key]);
  }

  return distance;
}

function treeSimilarity(left, right) {
  if (left === null && right === null) {
    return 1;
  }
  if (left === null || right === null) {
    return 0;
  }

  const leftSize = treeSize(left);
  const rightSize = treeSize(right);
  const maxSize = Math.max(leftSize, rightSize);

  if (maxSize === 0) {
    return 1;
  }

  const distance = treeEditDistance(left, right);
  return clampSimilarity(1 - distance / maxSize);
}

export function computeTokenSimilarity(sourceA, sourceB, metric) {
  assertSupportedMetric(metric, SUPPORTED_TOKEN_METRICS);

  const tokensA = normalizeTokens(sourceA);
  const tokensB = normalizeTokens(sourceB);

  if (tokensA.length === 0 && tokensB.length === 0) {
    return 1;
  }

  if (JSON.stringify(tokensA) === JSON.stringify(tokensB)) {
    return 1;
  }

  return jaccardSimilarity(tokensA, tokensB);
}

export function computeAstSimilarity(sourceA, sourceB, metric) {
  assertSupportedMetric(metric, SUPPORTED_AST_METRICS);

  const astA = normalizeAst(sourceA);
  const astB = normalizeAst(sourceB);

  if (astA === null && astB === null) {
    return 1;
  }

  if (JSON.stringify(astA) === JSON.stringify(astB)) {
    return 1;
  }

  return treeSimilarity(astA, astB);
}
