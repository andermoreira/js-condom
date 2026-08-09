import assert from 'node:assert/strict';
import test from 'node:test';
import { validateManifest } from '../../src/protocol/validate-manifest.js';

const SHARED_SLICE = {
  id: 'structural-variant-v1',
  version: '1.0.0',
  appliesTo: ['oss-extension', 'own-minimal'],
  inputStageId: 'parsed-ast',
  eligibleNodeTypes: ['FunctionDeclaration'],
  selectionPolicy: 'uniform-random',
  variantPolicy: 'seeded-variant',
  logicalParameters: { intensity: 1 },
  allowedAuxiliaryTransforms: ['rename-identifiers'],
};

function buildValidPilotManifest(overrides = {}) {
  const manifest = {
    schemaVersion: 1,
    experimentId: 'pilot-2026-08-09',
    phase: 'pilot',
    repositoryCommit: 'abc123',
    environment: {
      os: 'darwin',
      architecture: 'arm64',
      cpu: 'Apple M1',
      memoryBytes: 17179869184,
      nodeVersion: '22.14.0',
    },
    environmentCompatibility: {
      exactMatchFields: ['os', 'architecture', 'nodeVersion'],
      informativeFields: ['cpu', 'memoryBytes'],
    },
    tools: [
      {
        name: 'javascript-obfuscator',
        version: '4.1.0',
        source: 'npm',
        integrity: 'sha256-placeholder',
        command: 'npx javascript-obfuscator',
      },
    ],
    control: {
      id: 'unprotected-control',
      artifactPolicy: 'manifest-input',
    },
    transformationSlice: { ...SHARED_SLICE },
    candidates: [
      {
        id: 'oss-baseline',
        commit: 'baseline-commit',
        config: { seed: 'canonical' },
        canonicalSeedProjection: 'canonical',
        inputStageId: 'source-text',
        auxiliaryTransforms: [],
        sliceConformanceEvidenceIds: [],
      },
      {
        id: 'oss-extension',
        commit: 'extension-commit',
        config: { seed: 'canonical' },
        canonicalSeedProjection: 'canonical',
        inputStageId: 'parsed-ast',
        auxiliaryTransforms: ['rename-identifiers'],
        sliceConformanceEvidenceIds: ['evidence-1'],
      },
      {
        id: 'own-minimal',
        commit: 'own-commit',
        config: { seed: 'canonical' },
        canonicalSeedProjection: 'canonical',
        inputStageId: 'parsed-ast',
        auxiliaryTransforms: [],
        sliceConformanceEvidenceIds: ['evidence-2'],
      },
    ],
    corpus: [
      {
        caseId: 'case-1',
        sourceHash: 'sha256-case-1',
        category: 'closures',
        partition: 'pilot',
        expectedBehaviorId: 'behavior-1',
        recoveryTaskIds: ['task-webcrack'],
      },
    ],
    recoveryTasks: [
      {
        id: 'task-webcrack',
        objective: 'recover source structure',
        evaluatorIds: ['eval-webcrack'],
        oracleId: 'oracle-structural',
        budgetId: 'budget-webcrack',
      },
    ],
    evaluators: [
      {
        id: 'eval-webcrack',
        kind: 'automated',
        toolName: 'webcrack',
        oracleMode: 'automated',
        determinism: 'verified-deterministic',
      },
    ],
    seeds: ['seed-a', 'seed-b'],
    diversityMetrics: {
      token: { algorithm: 'jaccard', version: '1', range: [0, 1] },
      ast: { algorithm: 'tree-edit', version: '1', range: [0, 1] },
      comparisonPolicy: 'all-seed-pairs-within-case-and-candidate',
    },
    sampling: {
      minimumTotalCases: 1,
      minimumCasesPerCategory: { closures: 1 },
      seedsPerCase: 2,
      repetitionsByEvaluator: { 'eval-webcrack': 3 },
      aggregation: 'paired-by-case-seed-task-evaluator',
      intervalMethod: 'bootstrap-percentile',
    },
    decisionRule: {
      primaryEndpoint: 'completion-rate-within-budget',
      effect: 'absolute-percentage-point-reduction-vs-oss-baseline',
      secondaryEndpoints: ['cost-to-success'],
      threshold: { status: 'pending-pilot' },
      materialityRule: 'interval-lower-bound-meets-threshold',
      primaryTimeoutTreatment: 'not-completed-within-budget',
      secondaryCostTimeoutTreatment: 'right-censored-at-budget',
    },
    blinding: {
      artifactLabelScheme: 'random-opaque-id',
      randomizeEvaluationOrder: true,
      mappingArtifactHash: 'sha256-mapping',
      evaluatorViewHash: 'sha256-evaluator-view',
      revealAfterResultsLocked: true,
    },
    budgets: {
      processTimeoutMs: 60000,
      memoryBytes: 536870912,
      recovery: [
        {
          id: 'budget-webcrack',
          evaluatorId: 'eval-webcrack',
          wallClockMs: 30000,
          maxAttempts: 3,
          maxToolInvocations: 10,
        },
      ],
    },
  };

  return deepMerge(manifest, overrides);
}

function buildValidOfficialManifest(overrides = {}) {
  return buildValidPilotManifest({
    experimentId: 'official-2026-08-09',
    phase: 'official',
    corpus: [
      {
        caseId: 'case-1',
        sourceHash: 'sha256-case-1',
        category: 'closures',
        partition: 'official',
        expectedBehaviorId: 'behavior-1',
        recoveryTaskIds: ['task-webcrack'],
      },
    ],
    decisionRule: {
      primaryEndpoint: 'completion-rate-within-budget',
      effect: 'absolute-percentage-point-reduction-vs-oss-baseline',
      secondaryEndpoints: ['cost-to-success'],
      threshold: {
        status: 'frozen',
        minimumReductionPercentagePoints: 15,
      },
      materialityRule: 'interval-lower-bound-meets-threshold',
      primaryTimeoutTreatment: 'not-completed-within-budget',
      secondaryCostTimeoutTreatment: 'right-censored-at-budget',
    },
    ...overrides,
  });
}

function deepMerge(base, overrides) {
  if (overrides === undefined) {
    return base;
  }

  if (Array.isArray(overrides)) {
    return overrides.map((item, index) => {
      if (Array.isArray(base[index])) {
        return deepMerge(base[index], item);
      }
      if (isPlainObject(base[index]) && isPlainObject(item)) {
        return deepMerge(base[index], item);
      }
      return item;
    });
  }

  if (!isPlainObject(overrides)) {
    return overrides;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertInvalid(manifest, expectedPathFragment) {
  const result = validateManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.path.includes(expectedPathFragment)),
    `expected error at ${expectedPathFragment}, got: ${JSON.stringify(result.errors)}`,
  );
}

test('accepts a valid pilot manifest', () => {
  const result = validateManifest(buildValidPilotManifest());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('accepts a valid official manifest with frozen threshold', () => {
  const result = validateManifest(buildValidOfficialManifest());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('rejects official manifest with pending-pilot threshold', () => {
  assertInvalid(buildValidOfficialManifest({
    decisionRule: {
      primaryEndpoint: 'completion-rate-within-budget',
      effect: 'absolute-percentage-point-reduction-vs-oss-baseline',
      secondaryEndpoints: ['cost-to-success'],
      threshold: { status: 'pending-pilot' },
      materialityRule: 'interval-lower-bound-meets-threshold',
      primaryTimeoutTreatment: 'not-completed-within-budget',
      secondaryCostTimeoutTreatment: 'right-censored-at-budget',
    },
  }), 'decisionRule/threshold');
});

test('rejects unprotected-control listed as candidate', () => {
  const manifest = buildValidPilotManifest();
  manifest.candidates.push({
    id: 'unprotected-control',
    commit: 'control-commit',
    config: {},
    canonicalSeedProjection: 'canonical',
    inputStageId: 'source-text',
    auxiliaryTransforms: [],
    sliceConformanceEvidenceIds: [],
  });

  assertInvalid(manifest, '/candidates');
});

test('rejects fourth architectural candidate', () => {
  const manifest = buildValidPilotManifest();
  manifest.candidates.push({
    id: 'oss-baseline',
    commit: 'duplicate',
    config: {},
    canonicalSeedProjection: 'canonical',
    inputStageId: 'source-text',
    auxiliaryTransforms: [],
    sliceConformanceEvidenceIds: [],
  });

  assertInvalid(manifest, '/candidates');
});

test('rejects broken recovery task reference from corpus', () => {
  const manifest = buildValidPilotManifest();
  manifest.corpus[0].recoveryTaskIds = ['missing-task'];

  assertInvalid(manifest, '/corpus/0/recoveryTaskIds');
});

test('rejects broken evaluator reference from recovery task', () => {
  const manifest = buildValidPilotManifest();
  manifest.recoveryTasks[0].evaluatorIds = ['missing-evaluator'];

  assertInvalid(manifest, '/recoveryTasks/0/evaluatorIds');
});

test('rejects broken budget reference from recovery task', () => {
  const manifest = buildValidPilotManifest();
  manifest.recoveryTasks[0].budgetId = 'missing-budget';

  assertInvalid(manifest, '/recoveryTasks/0/budgetId');
});

test('rejects divergent inputStageId between custom candidates', () => {
  const manifest = buildValidPilotManifest();
  manifest.candidates.find((candidate) => candidate.id === 'own-minimal').inputStageId =
    'different-stage';

  assertInvalid(manifest, '/candidates/own-minimal/inputStageId');
});

test('rejects inconsistent sampling seedsPerCase', () => {
  const manifest = buildValidPilotManifest();
  manifest.sampling.seedsPerCase = 1;

  assertInvalid(manifest, '/sampling/seedsPerCase');
});

test('rejects evaluator in repetitionsByEvaluator without recovery budget', () => {
  const manifest = buildValidPilotManifest();
  manifest.sampling.repetitionsByEvaluator = { 'eval-missing-budget': 2 };
  manifest.evaluators.push({
    id: 'eval-missing-budget',
    kind: 'automated',
    oracleMode: 'automated',
    determinism: 'verified-deterministic',
  });

  assertInvalid(manifest, '/sampling/repetitionsByEvaluator/eval-missing-budget');
});

test('rejects incorrect OQ7 exactMatchFields classification', () => {
  const manifest = buildValidPilotManifest({
    environmentCompatibility: {
      exactMatchFields: ['os', 'architecture'],
      informativeFields: ['cpu', 'memoryBytes', 'nodeVersion'],
    },
  });

  assertInvalid(manifest, '/environmentCompatibility/exactMatchFields');
});

test('rejects overlapping environment field classification', () => {
  const manifest = buildValidPilotManifest({
    environmentCompatibility: {
      exactMatchFields: ['os', 'architecture', 'nodeVersion', 'cpu'],
      informativeFields: ['cpu', 'memoryBytes'],
    },
  });

  assertInvalid(manifest, '/environmentCompatibility');
});

test('rejects auxiliary transform outside slice allowlist', () => {
  const manifest = buildValidPilotManifest();
  manifest.candidates.find((candidate) => candidate.id === 'oss-extension').auxiliaryTransforms =
    ['undeclared-transform'];

  assertInvalid(manifest, '/candidates/oss-extension/auxiliaryTransforms');
});
