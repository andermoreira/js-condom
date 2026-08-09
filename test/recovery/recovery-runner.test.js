import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCorpus } from '../../src/corpus/corpus.js';
import {
  buildEvaluatorView,
  createBlindingRegistry,
  createSeededRng,
  lockResults,
  revealMapping,
  shuffleEvaluationQueue,
} from '../../src/recovery/blinding.js';
import {
  calibrateRecoveryPairs,
  runRecoveryHarness,
  runRecoveryTrial,
} from '../../src/recovery/recovery-runner.js';
import { verifyEmbeddedArtifact } from '../../src/runner/semantic-runner.js';

const CLOSURE_SOURCE =
  'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n';

function buildManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    experimentId: 'recovery-test',
    phase: 'pilot',
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      recovery: [
        {
          id: 'budget-webcrack',
          evaluatorId: 'eval-webcrack',
          wallClockMs: 5_000,
          maxAttempts: 2,
          maxToolInvocations: 3,
        },
      ],
    },
    recoveryTasks: [
      {
        id: 'task-recover-exports',
        objective: 'Recover exported bindings with equivalent module behavior.',
        evaluatorIds: ['eval-webcrack'],
        oracleId: 'oracle-exports-recovered',
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
    sampling: {
      repetitionsByEvaluator: {
        'eval-webcrack': 2,
      },
    },
    blinding: {
      artifactLabelScheme: 'random-opaque-id',
      randomizeEvaluationOrder: true,
      mappingArtifactHash: 'sha256-placeholder',
      evaluatorViewHash: 'sha256-placeholder',
      revealAfterResultsLocked: true,
    },
    ...overrides,
  };
}

function buildCase() {
  return {
    caseId: 'pilot-closures-001',
    category: 'closures',
    supported: true,
    expectedBehaviorId: 'behavior-closure-counter',
    recoveryTaskIds: ['task-recover-exports'],
    source: CLOSURE_SOURCE,
  };
}

function mockWebcrack(sourceCode) {
  return Promise.resolve({ code: sourceCode });
}

test('evaluator view excludes candidate, seed and engine identifiers', () => {
  const registry = createBlindingRegistry({
    artifacts: [
      {
        caseId: 'pilot-closures-001',
        subjectId: 'oss-baseline',
        seed: 'pilot-seed-1',
        sourceCode: CLOSURE_SOURCE,
        recoveryTaskIds: ['task-recover-exports'],
      },
    ],
    rng: createSeededRng(42),
  });

  const view = buildEvaluatorView(registry, [
    {
      id: 'task-recover-exports',
      objective: 'Recover exported bindings with equivalent module behavior.',
    },
  ]);

  const serialized = JSON.stringify(view.queue);
  assert.doesNotMatch(serialized, /oss-baseline/);
  assert.doesNotMatch(serialized, /pilot-seed-1/);
  assert.doesNotMatch(serialized, /webcrack/);
  assert.doesNotMatch(serialized, /subjectId/);
  assert.doesNotMatch(serialized, /seed/);
  assert.ok(view.queue[0].blindArtifactId.startsWith('artifact-'));
});

test('revealMapping is blocked before results are locked', () => {
  const registry = createBlindingRegistry({
    artifacts: [
      {
        caseId: 'pilot-closures-001',
        subjectId: 'unprotected-control',
        seed: null,
        sourceCode: CLOSURE_SOURCE,
        recoveryTaskIds: ['task-recover-exports'],
      },
    ],
  });

  assert.throws(() => revealMapping(registry), /mapping_reveal_blocked/);
  lockResults(registry);
  const revealed = revealMapping(registry);
  assert.equal(revealed.mapping[registry.entries[0].blindArtifactId].subjectId, 'unprotected-control');
});

test('shuffleEvaluationQueue randomizes order with seeded rng', () => {
  const queue = [
    { blindArtifactId: 'artifact-1', taskId: 'task-a' },
    { blindArtifactId: 'artifact-2', taskId: 'task-b' },
    { blindArtifactId: 'artifact-3', taskId: 'task-c' },
    { blindArtifactId: 'artifact-4', taskId: 'task-d' },
  ];

  const shuffled = shuffleEvaluationQueue(queue, createSeededRng(99));
  assert.notDeepEqual(
    shuffled.map((entry) => entry.blindArtifactId),
    queue.map((entry) => entry.blindArtifactId),
  );
});

test('calibration passes for webcrack on unprotected control', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();

  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases: [caseEntry],
    getControlSource: () => CLOSURE_SOURCE,
    deps: { webcrack: mockWebcrack },
  });

  assert.equal(calibration.pairs.length, 1);
  assert.equal(calibration.pairs[0].valid, true);
  assert.equal(calibration.invalidPairs.length, 0);
});

test('invalid calibration pair is visible and excluded from resistance denominator', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();

  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases: [caseEntry],
    getControlSource: () => CLOSURE_SOURCE,
    deps: {
      webcrack: async () => ({ code: 'export function broken() { return 0; }' }),
    },
  });

  assert.equal(calibration.pairs[0].valid, false);
  assert.deepEqual(calibration.invalidPairs, ['task-recover-exports:eval-webcrack']);

  const harness = await runRecoveryHarness({
    manifest,
    matrix: {
      experimentId: 'recovery-test',
      cases: [caseEntry],
      getControlSource: () => CLOSURE_SOURCE,
      cells: [
        {
          caseId: caseEntry.caseId,
          subjectId: 'unprotected-control',
          seed: null,
          sourceCode: CLOSURE_SOURCE,
        },
        {
          caseId: caseEntry.caseId,
          subjectId: 'oss-baseline',
          seed: 'pilot-seed-1',
          sourceCode: CLOSURE_SOURCE,
        },
      ],
    },
    deps: { webcrack: async () => ({ code: 'export function broken() { return 0; }' }) },
    rng: createSeededRng(7),
  });

  const protectedTrial = harness.trials.find((trial) => trial.excludedFromResistanceDenominator);
  assert.ok(protectedTrial);
  assert.equal(protectedTrial.excludedFromResistanceDenominator, true);
  const controlTrial = harness.trials.find(
    (trial) => trial.blindArtifactId.includes('artifact-') && !trial.excludedFromResistanceDenominator,
  );
  assert.ok(controlTrial);
});

test('recovery trial preserves outcome, oracle, effort and recovered artifact hash', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();
  const registry = createBlindingRegistry({
    artifacts: [
      {
        caseId: caseEntry.caseId,
        subjectId: 'unprotected-control',
        seed: null,
        sourceCode: CLOSURE_SOURCE,
        recoveryTaskIds: ['task-recover-exports'],
      },
    ],
    rng: createSeededRng(1),
  });

  const trial = await runRecoveryTrial({
    manifest,
    caseEntry,
    taskId: 'task-recover-exports',
    evaluatorId: 'eval-webcrack',
    blindArtifactId: registry.entries[0].blindArtifactId,
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    deps: { webcrack: mockWebcrack },
  });

  assert.equal(trial.outcome, 'completed');
  assert.equal(trial.oracle.passed, true);
  assert.equal(trial.oracle.id, 'oracle-exports-recovered');
  assert.ok(trial.effort.wallClockMs >= 0);
  assert.equal(trial.effort.attempts, 1);
  assert.equal(trial.effort.toolInvocations, 1);
  assert.ok(trial.recoveredArtifact);
  assert.equal(verifyEmbeddedArtifact(trial.recoveredArtifact), true);
  assert.ok(Array.isArray(trial.diagnostics));
});

test('harness preserves all repetitions without cherry-picking', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();

  const harness = await runRecoveryHarness({
    manifest,
    matrix: {
      experimentId: 'recovery-test',
      cases: [caseEntry],
      getControlSource: () => CLOSURE_SOURCE,
      cells: [
        {
          caseId: caseEntry.caseId,
          subjectId: 'unprotected-control',
          seed: null,
          sourceCode: CLOSURE_SOURCE,
        },
      ],
    },
    deps: { webcrack: mockWebcrack },
    rng: createSeededRng(3),
  });

  const controlTrials = harness.trials.filter(
    (trial) => trial.blindArtifactId && trial.evaluatorId === 'eval-webcrack',
  );
  assert.equal(controlTrials.length, 2);
  assert.deepEqual(
    controlTrials.map((trial) => trial.trial).sort(),
    [1, 2],
  );
});

test('timeout outcome is censored at budget wall clock', async () => {
  const manifest = buildManifest({
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      recovery: [
        {
          id: 'budget-webcrack',
          evaluatorId: 'eval-webcrack',
          wallClockMs: 25,
          maxAttempts: 1,
          maxToolInvocations: 1,
        },
      ],
    },
  });
  const caseEntry = buildCase();
  let now = 0;
  const deps = {
    now: () => now,
    webcrack: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ code: CLOSURE_SOURCE }), 100);
      }),
  };

  const trial = await runRecoveryTrial({
    manifest,
    caseEntry,
    taskId: 'task-recover-exports',
    evaluatorId: 'eval-webcrack',
    blindArtifactId: 'artifact-timeout',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    deps,
  });

  assert.equal(trial.outcome, 'timeout');
  assert.equal(trial.effort.wallClockMs, 25);
  assert.ok(trial.diagnostics.some((entry) => entry.includes('wall-clock budget')));
});

test('webcrack crash is classified as tool_error', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();

  const trial = await runRecoveryTrial({
    manifest,
    caseEntry,
    taskId: 'task-recover-exports',
    evaluatorId: 'eval-webcrack',
    blindArtifactId: 'artifact-tool-error',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    deps: {
      webcrack: async () => {
        throw new Error('webcrack crashed');
      },
    },
  });

  assert.equal(trial.outcome, 'tool_error');
  assert.equal(trial.oracle.passed, null);
  assert.notEqual(trial.outcome, 'failed');
  assert.ok(trial.diagnostics.some((entry) => entry.includes('webcrack crashed')));
});

test('oracle failure is classified as failed distinct from completed', async () => {
  const manifest = buildManifest();
  const caseEntry = buildCase();

  const trial = await runRecoveryTrial({
    manifest,
    caseEntry,
    taskId: 'task-recover-exports',
    evaluatorId: 'eval-webcrack',
    blindArtifactId: 'artifact-failed',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
    deps: {
      webcrack: async () => ({
        code: 'export function makeCounter() { return () => 0; }',
      }),
    },
  });

  assert.equal(trial.outcome, 'failed');
  assert.equal(trial.oracle.passed, false);
  assert.notEqual(trial.outcome, 'completed');
  assert.ok(trial.diagnostics.length > 0);
});

test('pilot corpus control calibration passes offline for webcrack task', async () => {
  const bundle = loadCorpus();
  const manifest = buildManifest({
    sampling: {
      repetitionsByEvaluator: {
        'eval-webcrack': 1,
      },
    },
  });

  const pilotCase = bundle.pilot.cases.find((entry) => entry.caseId === 'pilot-closures-001');
  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases: [pilotCase],
    getControlSource: (caseEntry) => caseEntry.source,
    deps: { webcrack: mockWebcrack },
  });

  const webcrackPair = calibration.pairs.find(
    (entry) => entry.evaluatorId === 'eval-webcrack',
  );
  assert.equal(webcrackPair?.valid, true);
});

test('human-rubric evaluator calibrates on control source via oracle', async () => {
  const manifest = buildManifest({
    recoveryTasks: [
      {
        id: 'task-explain-behavior',
        objective: 'Human explanation task.',
        evaluatorIds: ['eval-human-rubric'],
        oracleId: 'oracle-behavior-human',
        budgetId: 'budget-human-rubric',
      },
    ],
    evaluators: [
      {
        id: 'eval-human-rubric',
        kind: 'human',
        oracleMode: 'human-rubric',
        determinism: 'variable',
      },
    ],
    budgets: {
      processTimeoutMs: 5_000,
      memoryBytes: 256 * 1024 * 1024,
      recovery: [
        {
          id: 'budget-human-rubric',
          evaluatorId: 'eval-human-rubric',
          wallClockMs: 1_000,
          maxAttempts: 1,
          maxToolInvocations: 0,
        },
      ],
    },
  });

  const trial = await runRecoveryTrial({
    manifest,
    caseEntry: {
      caseId: 'pilot-closures-001',
      supported: true,
      expectedBehaviorId: 'behavior-closure-counter',
      recoveryTaskIds: ['task-explain-behavior'],
    },
    taskId: 'task-explain-behavior',
    evaluatorId: 'eval-human-rubric',
    blindArtifactId: 'artifact-human',
    sourceCode: CLOSURE_SOURCE,
    trial: 1,
  });

  assert.equal(trial.outcome, 'completed');
  assert.equal(trial.oracle.passed, true);
  assert.equal(trial.oracle.mode, 'human-rubric');
});
