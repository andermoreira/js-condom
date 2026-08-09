import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PilotError,
  assertProtocolImmutable,
  buildPilotManifest,
  captureEnvironment,
  classifyEvaluatorDeterminism,
  deriveProtocolEvidence,
  freezeOfficialManifest,
  generatePilotReport,
  runPilot,
  verifyEnvironmentCompatibility,
  verifySampleSize,
  verifySliceConformance,
} from '../../src/analysis/pilot.js';
import { validateManifest } from '../../src/protocol/validate-manifest.js';
import { verifyEmbeddedArtifact } from '../../src/runner/semantic-runner.js';

const CLOSURE_SOURCE =
  'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n';

function buildMinimalBundle() {
  const pilotCase = {
    caseId: 'pilot-closures-001',
    category: 'closures',
    origin: 'synthetic',
    source: CLOSURE_SOURCE,
    sourceHash: 'sha256-2d38ad5b86a582682dfd59b3675a41224381c20fd116d5b2cb3c6a4e6b2b79de',
    supported: true,
    expectedBehaviorId: 'behavior-closure-counter',
    semanticOracle: {
      id: 'oracle-pilot-closures-001',
      mode: 'automated',
      description: 'Calling makeCounter(1) twice returns 2 then 3.',
    },
    recoveryTaskIds: ['task-recover-exports'],
  };

  const officialCase = {
    ...pilotCase,
    caseId: 'official-closures-001',
    semanticOracle: {
      id: 'oracle-official-closures-001',
      mode: 'automated',
      description: 'Calling makeCounter(1) twice returns 2 then 3.',
    },
  };

  return {
    pilot: {
      schemaVersion: 1,
      partition: 'pilot',
      oq2Decision: {
        owner: '@andersonalves',
        decidedAt: '2026-08-09',
        allowedOrigins: ['synthetic', 'open-source-mit'],
        partitionsDisjoint: true,
        minimumTotalCases: 33,
        partitionPolicy: {
          pilot: { minimumTotalCases: 1, minimumCasesPerCategory: 1 },
          official: { minimumTotalCases: 1, minimumCasesPerCategory: 1 },
        },
        minimumCasesPerCategory: { closures: 1 },
      },
      cases: [pilotCase],
    },
    official: {
      schemaVersion: 1,
      partition: 'official',
      oq2Decision: {
        owner: '@andersonalves',
        decidedAt: '2026-08-09',
        allowedOrigins: ['synthetic', 'open-source-mit'],
        partitionsDisjoint: true,
        minimumTotalCases: 33,
        partitionPolicy: {
          pilot: { minimumTotalCases: 1, minimumCasesPerCategory: 1 },
          official: { minimumTotalCases: 1, minimumCasesPerCategory: 1 },
        },
        minimumCasesPerCategory: { closures: 1 },
      },
      cases: [officialCase],
    },
    recoveryTasks: {
      schemaVersion: 1,
      evaluators: [
        {
          id: 'eval-webcrack',
          kind: 'automated',
          toolName: 'webcrack',
          oracleMode: 'automated',
          determinism: 'verified-deterministic',
        },
        {
          id: 'eval-human-rubric',
          kind: 'human',
          oracleMode: 'human-rubric',
          determinism: 'variable',
        },
      ],
      budgets: [
        {
          id: 'budget-webcrack',
          evaluatorId: 'eval-webcrack',
          wallClockMs: 30_000,
          maxAttempts: 2,
          maxToolInvocations: 3,
        },
        {
          id: 'budget-human-rubric',
          evaluatorId: 'eval-human-rubric',
          wallClockMs: 600_000,
          maxAttempts: 1,
          maxToolInvocations: 0,
        },
      ],
      completionOracles: [
        {
          id: 'oracle-exports-recovered',
          mode: 'automated',
          description: 'Recovered artifact exports equivalent bindings.',
        },
      ],
      tasks: [
        {
          id: 'task-recover-exports',
          objective: 'Recover exported bindings with equivalent module behavior.',
          evaluatorIds: ['eval-webcrack'],
          budgetId: 'budget-webcrack',
          oracleId: 'oracle-exports-recovered',
        },
      ],
    },
  };
}

function buildOwnerDecisions(overrides = {}) {
  return {
    oq1: { minimumReductionPercentagePoints: 10 },
    oq5: {
      processTimeoutMs: 60_000,
      memoryBytes: 512 * 1024 * 1024,
      recovery: [
        {
          id: 'budget-webcrack',
          evaluatorId: 'eval-webcrack',
          wallClockMs: 30_000,
          maxAttempts: 3,
          maxToolInvocations: 10,
        },
        {
          id: 'budget-human-rubric',
          evaluatorId: 'eval-human-rubric',
          wallClockMs: 600_000,
          maxAttempts: 1,
          maxToolInvocations: 0,
        },
      ],
    },
    oq6: {
      seeds: ['pilot-seed-1', 'pilot-seed-2', 'official-seed-3'],
      repetitionsByEvaluator: {
        'eval-webcrack': 2,
        'eval-human-rubric': 3,
      },
      intervalMethod: 'bootstrap-percentile',
      variableEvaluatorPolicy: 'preserve-all-trials-no-cherry-picking',
    },
    _determinismByEvaluator: {
      'eval-webcrack': 'verified-deterministic',
      'eval-human-rubric': 'variable',
    },
    ...overrides,
  };
}

function mockWebcrack(sourceCode) {
  return Promise.resolve({ code: sourceCode });
}

function completedTrial(overrides = {}) {
  return {
    outcome: 'completed',
    oracle: { id: 'oracle-exports-recovered', passed: true, mode: 'automated' },
    effort: { wallClockMs: 120, attempts: 1, toolInvocations: 1 },
    diagnostics: [],
    recoveredCode: CLOSURE_SOURCE,
    ...overrides,
  };
}

test('buildPilotManifest produces a valid pilot manifest', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({
    repositoryCommit: 'test-commit',
    bundle,
    environment: {
      os: 'darwin',
      architecture: 'arm64',
      cpu: 'test',
      memoryBytes: 1,
      nodeVersion: 'v22.0.0',
    },
  });

  const result = validateManifest(manifest);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(manifest.phase, 'pilot');
  assert.equal(manifest.decisionRule.threshold.status, 'pending-pilot');
  assert.equal(manifest.corpus.length, 1);
});

test('verifySampleSize rejects insufficient partition size', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });

  assert.throws(
    () => verifySampleSize(manifest, [], 'pilot'),
    (error) => error instanceof PilotError && error.code === 'insufficient_sample_size',
  );
});

test('verifySliceConformance rejects divergent custom candidates', () => {
  assert.throws(
    () =>
      verifySliceConformance({
        protectOwnMinimalFn: () => ({
          metadata: {
            candidateId: 'own-minimal',
            inputStageId: 'wrong-stage',
            sliceId: 'structural-variant-v1',
            sliceVersion: '1.0.0',
            logicalParameters: { intensity: 1 },
            auxiliaryTransforms: [],
            appliedAuxiliaryTransforms: [],
            eligibleNodeTypes: ['FunctionDeclaration'],
            appliedNodeTypes: [],
          },
        }),
      }),
    (error) => error instanceof PilotError && error.code === 'slice_divergence',
  );
});

test('verifyEnvironmentCompatibility rejects exact-match drift', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({
    repositoryCommit: 'test-commit',
    bundle,
    environment: {
      os: 'darwin',
      architecture: 'arm64',
      cpu: 'test',
      memoryBytes: 1,
      nodeVersion: 'v22.0.0',
    },
  });

  assert.throws(
    () =>
      verifyEnvironmentCompatibility(manifest, {
        os: 'linux',
        architecture: 'arm64',
        cpu: 'other',
        memoryBytes: 2,
        nodeVersion: 'v22.0.0',
      }),
    (error) => error instanceof PilotError && error.code === 'environment_incompatible',
  );
});

test('classifyEvaluatorDeterminism marks stable evaluators as verified-deterministic', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });
  const caseEntry = bundle.pilot.cases[0];

  const classifications = await classifyEvaluatorDeterminism({
    manifest,
    cases: [caseEntry],
    getControlSource: () => CLOSURE_SOURCE,
    repetitions: 2,
    deps: {
      runRecoveryTrial: async () =>
        completedTrial({
          blindArtifactId: 'probe',
          taskId: 'task-recover-exports',
          evaluatorId: 'eval-webcrack',
          trial: 1,
        }),
    },
  });

  assert.equal(classifications.length, 1);
  assert.equal(classifications[0].determinism, 'verified-deterministic');
});

test('freezeOfficialManifest requires owner decisions and frozen threshold', async () => {
  const bundle = buildMinimalBundle();
  const pilotManifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });

  assert.throws(
    () => freezeOfficialManifest(pilotManifest, null, {}, bundle),
    (error) => error instanceof PilotError && error.code === 'owner_decisions_required',
  );

  assert.throws(
    () =>
      freezeOfficialManifest(
        pilotManifest,
        buildOwnerDecisions({
          oq1: { minimumReductionPercentagePoints: 0 },
        }),
        {},
        bundle,
      ),
    (error) => error instanceof PilotError && error.code === 'missing_frozen_threshold',
  );
});

test('freezeOfficialManifest rejects variable evaluator without repetitions', async () => {
  const bundle = buildMinimalBundle();
  const pilotManifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });

  assert.throws(
    () =>
      freezeOfficialManifest(
        pilotManifest,
        buildOwnerDecisions({
          oq6: {
            seeds: ['pilot-seed-1', 'pilot-seed-2'],
            repetitionsByEvaluator: {
              'eval-webcrack': 2,
              'eval-human-rubric': 1,
            },
            intervalMethod: 'bootstrap-percentile',
          },
          _determinismByEvaluator: {
            'eval-webcrack': 'verified-deterministic',
            'eval-human-rubric': 'variable',
          },
        }),
        {},
        bundle,
      ),
    (error) =>
      error instanceof PilotError && error.code === 'variable_evaluator_without_repetitions',
  );
});

test('assertProtocolImmutable blocks post-freeze protocol mutation', async () => {
  const bundle = buildMinimalBundle();
  const pilotManifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });
  const frozen = freezeOfficialManifest(
    pilotManifest,
    buildOwnerDecisions(),
    { oq1: {}, oq5: {}, oq6: {} },
    bundle,
  );

  assert.throws(
    () =>
      assertProtocolImmutable(frozen, {
        decisionRule: {
          ...frozen.decisionRule,
          threshold: { status: 'frozen', minimumReductionPercentagePoints: 99 },
        },
      }),
    (error) => error instanceof PilotError && error.code === 'protocol_already_frozen',
  );
});

test('deriveProtocolEvidence aggregates OQ1/OQ5/OQ6 metrics', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });

  const evidence = deriveProtocolEvidence({
    manifest,
    caseResults: [
      {
        subjectId: 'oss-baseline',
        status: 'valid',
        performance: { buildDurationMs: 100 },
        execution: { durationMs: 50 },
      },
    ],
    recovery: {
      calibration: [],
      trials: [
        {
          subjectId: 'oss-baseline',
          evaluatorId: 'eval-webcrack',
          outcome: 'completed',
          excludedFromResistanceDenominator: false,
          effort: { wallClockMs: 200 },
        },
        {
          subjectId: 'own-minimal',
          evaluatorId: 'eval-webcrack',
          outcome: 'failed',
          excludedFromResistanceDenominator: false,
          effort: { wallClockMs: 150 },
        },
      ],
      invalidPairs: [],
    },
    determinism: [
      {
        taskId: 'task-recover-exports',
        evaluatorId: 'eval-webcrack',
        determinism: 'verified-deterministic',
        implemented: true,
      },
    ],
    performanceSamples: {
      buildDurationMs: [100],
      runtimeDurationMs: [50],
      recoveryWallClockMs: [200, 150],
    },
  });

  assert.equal(evidence.oq1.baselineCompletionRate, 100);
  assert.equal(evidence.oq1.candidateCompletionRates['own-minimal'], 0);
  assert.equal(evidence.oq5.observed.buildDurationMs.p95, 100);
  assert.equal(evidence.oq6.intervalMethod, 'bootstrap-percentile');
});

test('runPilot produces self-contained run output and frozen manifest with mocks', async () => {
  const bundle = buildMinimalBundle();
  const environment = captureEnvironment();

  const { run, report, frozenManifest } = await runPilot({
    bundle,
    seeds: ['pilot-seed-1'],
    experimentId: 'pilot-test',
    ownerDecisions: buildOwnerDecisions({
      oq6: {
        seeds: ['pilot-seed-1', 'official-seed-2'],
        repetitionsByEvaluator: {
          'eval-webcrack': 2,
          'eval-human-rubric': 3,
        },
        intervalMethod: 'bootstrap-percentile',
        variableEvaluatorPolicy: 'preserve-all-trials-no-cherry-picking',
      },
    }),
    deps: {
      environment,
      repositoryCommit: 'test-commit',
      webcrack: mockWebcrack,
      protectCandidate: (subjectId, sourceCode) => ({
        code: sourceCode,
        metadata: { candidateId: subjectId },
        buildDurationMs: 5,
      }),
    },
  });

  assert.equal(run.experimentId, 'pilot-test');
  assert.ok(run.evidence.oq1);
  assert.ok(run.evidence.oq5);
  assert.ok(run.evidence.oq6);
  assert.match(report, /OQ1/);
  assert.match(report, /Frozen threshold/);
  assert.equal(frozenManifest.phase, 'official');
  assert.equal(frozenManifest.decisionRule.threshold.status, 'frozen');

  const serialized = JSON.stringify(run);
  assert.doesNotMatch(serialized, /"path"\s*:/);
  assert.doesNotMatch(serialized, /"fileRef"\s*:/);

  for (const cell of run.cells) {
    assert.equal(verifyEmbeddedArtifact(cell.sourceArtifact), true);
  }

  const validation = validateManifest(frozenManifest);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('runPilot rejects implemented calibration failures', async () => {
  const bundle = buildMinimalBundle();
  const environment = captureEnvironment();

  await assert.rejects(
    () =>
      runPilot({
        bundle,
        seeds: ['pilot-seed-1'],
        ownerDecisions: buildOwnerDecisions(),
        deps: {
          environment,
          repositoryCommit: 'test-commit',
          webcrack: async () => ({ code: 'export function broken() { return null; }' }),
          protectCandidate: (subjectId, sourceCode) => ({
            code: sourceCode,
            metadata: { candidateId: subjectId },
            buildDurationMs: 1,
          }),
        },
      }),
    (error) => error instanceof PilotError && error.code === 'invalid_task_pair',
  );
});

test('generatePilotReport includes limitations and owner decisions', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildPilotManifest({ repositoryCommit: 'test-commit', bundle });
  const ownerDecisions = buildOwnerDecisions();
  const frozenManifest = freezeOfficialManifest(
    manifest,
    ownerDecisions,
    {
      oq1: { recommendedThreshold: 12 },
      oq5: { recommended: { processTimeoutMs: 60_000 } },
      oq6: { pilotSeeds: ['pilot-seed-1'], intervalMethod: 'bootstrap-percentile', variableEvaluatorPolicy: 'preserve-all-trials-no-cherry-picking' },
      limitations: ['test limitation'],
      semanticCoverage: { validCandidateCells: 1, totalCandidateCells: 1 },
    },
    bundle,
  );

  const report = generatePilotReport({
    experimentId: 'pilot-test',
    resolvedManifest: manifest,
    generatedAt: '2026-08-09T00:00:00.000Z',
    environment: manifest.environment,
    calibration: { pairs: [{ taskId: 'task-recover-exports', evaluatorId: 'eval-webcrack', valid: true, diagnostics: [] }] },
    determinism: [
      {
        taskId: 'task-recover-exports',
        evaluatorId: 'eval-webcrack',
        determinism: 'verified-deterministic',
        probeRepetitions: 3,
        implemented: true,
      },
    ],
    evidence: {
      oq1: {
        baselineCompletionRate: 50,
        candidateCompletionRates: { 'oss-extension': 25, 'own-minimal': 10 },
        observedReductions: { 'own-minimal': 40 },
        recommendedThreshold: 40,
      },
      oq5: {
        observed: {
          buildDurationMs: { p95: 100 },
          runtimeDurationMs: { p95: 40 },
          recoveryWallClockMs: { p95: 200 },
        },
      },
      oq6: {
        pilotSeeds: ['pilot-seed-1'],
        intervalMethod: 'bootstrap-percentile',
        variableEvaluatorPolicy: 'preserve-all-trials-no-cherry-picking',
      },
      oq4: { status: 'approved', summary: 'Ollama approved' },
      limitations: ['test limitation'],
      semanticCoverage: { validCandidateCells: 1, totalCandidateCells: 1 },
    },
    ownerDecisions,
    frozenManifest,
  });

  assert.match(report, /test limitation/);
  assert.match(report, /10 pp/);
  assert.match(report, /official-2026-08-09/);
});
