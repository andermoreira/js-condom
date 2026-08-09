import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachDiversityToCaseResults,
  DiversityRunnerError,
  enumerateUnorderedSeedPairs,
  runDiversityForGroup,
} from '../../src/diversity/diversity-runner.js';
import { normalizeAst, normalizeTokens } from '../../src/diversity/normalize.js';
import * as similarity from '../../src/diversity/similarity.js';
import {
  computeAstSimilarity,
  computeTokenSimilarity,
  formatMetricId,
} from '../../src/diversity/similarity.js';

function buildManifest(overrides = {}) {
  return {
    seeds: ['seed-a', 'seed-b', 'seed-c'],
    diversityMetrics: {
      token: { algorithm: 'jaccard', version: '1', range: [0, 1] },
      ast: { algorithm: 'tree-edit', version: '1', range: [0, 1] },
      comparisonPolicy: 'all-seed-pairs-within-case-and-candidate',
    },
    sampling: {
      seedsPerCase: 3,
    },
    ...overrides,
  };
}

function buildCaseResult({ caseId, subjectId, seed, status = 'valid' }) {
  return {
    experimentId: 'diversity-test',
    caseId,
    subjectId,
    seed,
    status,
    semantic: { equivalent: true, diagnostics: [] },
    recovery: [],
    artifacts: {},
    logs: [],
  };
}

const BASE_SOURCE = 'function add(first, second) {\n  return first + second;\n}\n';
const COSMETIC_SOURCE = 'function add( alpha , beta ) { return alpha + beta; }';
const STRUCTURAL_SOURCE = 'function multiply(left, right) {\n  return left * right;\n}\n';

test('formatMetricId matches manifest metric identifiers', () => {
  const manifest = buildManifest();
  assert.equal(formatMetricId(manifest.diversityMetrics.token), 'jaccard@1');
  assert.equal(formatMetricId(manifest.diversityMetrics.ast), 'tree-edit@1');
});

test('similarity module does not export line-based metrics', () => {
  assert.equal('computeLineSimilarity' in similarity, false);
  assert.equal('linePercentSimilarity' in similarity, false);
  assert.equal('diffLines' in similarity, false);
});

test('normalization resists cosmetic whitespace and identifier noise', () => {
  const baseTokens = normalizeTokens(BASE_SOURCE);
  const cosmeticTokens = normalizeTokens(COSMETIC_SOURCE);
  const baseAst = normalizeAst(BASE_SOURCE);
  const cosmeticAst = normalizeAst(COSMETIC_SOURCE);

  assert.deepEqual(cosmeticTokens, baseTokens);
  assert.deepEqual(cosmeticAst, baseAst);
});

test('cosmetic variants score near-identical similarity on token and AST metrics', () => {
  const manifest = buildManifest();
  const tokenSimilarity = computeTokenSimilarity(BASE_SOURCE, COSMETIC_SOURCE, manifest.diversityMetrics.token);
  const astSimilarity = computeAstSimilarity(BASE_SOURCE, COSMETIC_SOURCE, manifest.diversityMetrics.ast);

  assert.equal(tokenSimilarity, 1);
  assert.equal(astSimilarity, 1);
});

test('structurally different sources score below identical sources', () => {
  const manifest = buildManifest();
  const identicalToken = computeTokenSimilarity(BASE_SOURCE, BASE_SOURCE, manifest.diversityMetrics.token);
  const differentToken = computeTokenSimilarity(BASE_SOURCE, STRUCTURAL_SOURCE, manifest.diversityMetrics.token);
  const identicalAst = computeAstSimilarity(BASE_SOURCE, BASE_SOURCE, manifest.diversityMetrics.ast);
  const differentAst = computeAstSimilarity(BASE_SOURCE, STRUCTURAL_SOURCE, manifest.diversityMetrics.ast);

  assert.equal(identicalToken, 1);
  assert.equal(identicalAst, 1);
  assert.ok(differentToken < identicalToken);
  assert.ok(differentAst < identicalAst);
});

test('similarity handles empty, identical and one-sided empty inputs', () => {
  const manifest = buildManifest();

  assert.equal(computeTokenSimilarity('', '', manifest.diversityMetrics.token), 1);
  assert.equal(computeAstSimilarity('', '', manifest.diversityMetrics.ast), 1);
  assert.equal(computeTokenSimilarity('', BASE_SOURCE, manifest.diversityMetrics.token), 0);
  assert.equal(computeAstSimilarity('', BASE_SOURCE, manifest.diversityMetrics.ast), 0);
  assert.equal(computeTokenSimilarity(BASE_SOURCE, BASE_SOURCE, manifest.diversityMetrics.token), 1);
  assert.equal(computeAstSimilarity(BASE_SOURCE, BASE_SOURCE, manifest.diversityMetrics.ast), 1);
});

test('enumerateUnorderedSeedPairs returns exactly C(n,2) unique pairs', () => {
  const pairs = enumerateUnorderedSeedPairs(['seed-c', 'seed-a', 'seed-b']);
  assert.deepEqual(pairs, [
    { baseSeed: 'seed-a', comparisonSeed: 'seed-b' },
    { baseSeed: 'seed-a', comparisonSeed: 'seed-c' },
    { baseSeed: 'seed-b', comparisonSeed: 'seed-c' },
  ]);
});

test('runDiversityForGroup preserves one comparison per unordered seed pair', () => {
  const manifest = buildManifest();
  const diversityBySeed = runDiversityForGroup({
    manifest,
    caseId: 'case-1',
    subjectId: 'oss-baseline',
    seedSources: new Map([
      ['seed-a', `${BASE_SOURCE}// seed-a`],
      ['seed-b', `${BASE_SOURCE}// seed-b`],
      ['seed-c', `${BASE_SOURCE}// seed-c`],
    ]),
  });

  assert.equal(diversityBySeed.get('seed-a').length, 2);
  assert.equal(diversityBySeed.get('seed-b').length, 1);
  assert.equal(diversityBySeed.get('seed-c').length, 0);

  const allComparisons = [...diversityBySeed.values()].flat();
  assert.equal(allComparisons.length, 3);
  assert.deepEqual(
    allComparisons.map((entry) => entry.comparisonSeed).sort(),
    ['seed-b', 'seed-c', 'seed-c'],
  );

  for (const entry of allComparisons) {
    assert.equal(entry.tokenMetricId, 'jaccard@1');
    assert.equal(entry.astMetricId, 'tree-edit@1');
    assert.ok(entry.normalizedTokenSimilarity >= 0 && entry.normalizedTokenSimilarity <= 1);
    assert.ok(entry.normalizedAstSimilarity >= 0 && entry.normalizedAstSimilarity <= 1);
    assert.equal(Number.isFinite(entry.normalizedTokenSimilarity), true);
    assert.equal(Number.isFinite(entry.normalizedAstSimilarity), true);
  }
});

test('attachDiversityToCaseResults skips unprotected-control and annotates candidates', () => {
  const manifest = buildManifest({ sampling: { seedsPerCase: 2 }, seeds: ['seed-a', 'seed-b'] });
  const caseResults = [
    buildCaseResult({ caseId: 'case-1', subjectId: 'unprotected-control', seed: null }),
    buildCaseResult({ caseId: 'case-1', subjectId: 'oss-baseline', seed: 'seed-a' }),
    buildCaseResult({ caseId: 'case-1', subjectId: 'oss-baseline', seed: 'seed-b' }),
  ];

  const enriched = attachDiversityToCaseResults({
    manifest,
    caseResults,
    getSource: (caseId, subjectId, seed) => {
      if (subjectId === 'unprotected-control') {
        return BASE_SOURCE;
      }
      return seed === 'seed-a' ? BASE_SOURCE : COSMETIC_SOURCE;
    },
  });

  assert.equal('diversity' in enriched[0], false);
  assert.equal(enriched[1].diversity.length, 1);
  assert.equal(enriched[1].diversity[0].comparisonSeed, 'seed-b');
  assert.equal(enriched[2].diversity.length, 0);
});

test('attachDiversityToCaseResults rejects missing manifest seeds and missing sources', () => {
  const manifest = buildManifest();
  const groupedCaseResults = [
    buildCaseResult({ caseId: 'case-1', subjectId: 'oss-baseline', seed: 'seed-a' }),
    buildCaseResult({ caseId: 'case-1', subjectId: 'oss-baseline', seed: 'seed-b' }),
    buildCaseResult({ caseId: 'case-1', subjectId: 'oss-baseline', seed: 'seed-c' }),
  ];

  assert.throws(
    () =>
      attachDiversityToCaseResults({
        manifest: buildManifest({ seeds: ['seed-a', 'seed-b'] }),
        caseResults: groupedCaseResults,
        getSource: () => BASE_SOURCE,
      }),
    (error) => error instanceof DiversityRunnerError && error.code === 'missing_manifest_seed',
  );

  assert.throws(
    () =>
      attachDiversityToCaseResults({
        manifest,
        caseResults: groupedCaseResults,
        getSource: (caseId, subjectId, seed) => (seed === 'seed-c' ? undefined : BASE_SOURCE),
      }),
    (error) => error instanceof DiversityRunnerError && error.code === 'missing_seed_source',
  );
});

test('runDiversityForGroup rejects cross-scope comparisons', () => {
  const manifest = buildManifest({ sampling: { seedsPerCase: 2 }, seeds: ['seed-a', 'seed-b'] });

  assert.throws(
    () =>
      runDiversityForGroup({
        manifest,
        caseId: 'case-1',
        subjectId: 'oss-baseline',
        groupCaseId: 'case-2',
        groupSubjectId: 'oss-baseline',
        seedSources: new Map([
          ['seed-a', BASE_SOURCE],
          ['seed-b', COSMETIC_SOURCE],
        ]),
      }),
    (error) => error instanceof DiversityRunnerError && error.code === 'cross_scope_comparison',
  );
});
