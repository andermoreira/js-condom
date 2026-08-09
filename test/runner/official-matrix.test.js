import assert from 'node:assert/strict';
import test from 'node:test';
import { freezeOfficialManifest, buildPilotManifest } from '../../src/analysis/pilot.js';
import { createBlindingRegistry, lockResults, revealMapping } from '../../src/recovery/blinding.js';
import { validateManifest } from '../../src/protocol/validate-manifest.js';
import { verifyEmbeddedArtifact } from '../../src/runner/semantic-runner.js';
import {
  AC17_CONCLUSIONS,
  assertManifestImmutable,
  computeResistanceAggregates,
  deriveConclusion,
  enumerateExpectedCells,
  generateOfficialReport,
  loadFrozenOfficialManifest,
  OfficialMatrixError,
  runOfficialMatrix,
  verifyMatrixCompleteness,
} from '../../src/runner/official-matrix.js';

const CLOSURE_SOURCE =
  'export function makeCounter(start = 0) {\n  let value = start;\n  return () => ++value;\n}\n';

function buildMinimalBundle() {
  const officialCase = {
    caseId: 'official-closures-001',
    category: 'closures',
    origin: 'synthetic',
    source: CLOSURE_SOURCE,
    sourceHash: 'sha256-2d38ad5b86a582682dfd59b3675a41224381c20fd116d5b2cb3c6a4e6b2b79de',
    supported: true,
    expectedBehaviorId: 'behavior-closure-counter',
    semanticOracle: {
      id: 'oracle-official-closures-001',
      mode: 'automated',
      description: 'Calling makeCounter(1) twice returns 2 then 3.',
    },
    recoveryTaskIds: ['task-recover-exports'],
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
      cases: [],
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

function buildOwnerDecisions() {
  return {
    oq1: { minimumReductionPercentagePoints: 5 },
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
      seeds: ['pilot-seed-1'],
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
  };
}

async function buildFrozenManifest(bundle) {
  const pilotManifest = await buildPilotManifest({
    repositoryCommit: 'test-commit',
    bundle,
    seeds: ['pilot-seed-1'],
    environment: {
      os: 'darwin',
      architecture: 'arm64',
      cpu: 'test',
      memoryBytes: 1,
      nodeVersion: 'v22.0.0',
    },
  });

  return freezeOfficialManifest(pilotManifest, buildOwnerDecisions(), {}, bundle);
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

test('loadFrozenOfficialManifest validates official manifest from repo', () => {
  const { manifest } = loadFrozenOfficialManifest('experiments/official/manifest.json');
  assert.equal(manifest.phase, 'official');
  assert.equal(manifest.decisionRule.threshold.status, 'frozen');
});

test('assertManifestImmutable rejects manifest mutation', async () => {
  const bundle = buildMinimalBundle();
  const frozen = await buildFrozenManifest(bundle);
  const snapshot = JSON.stringify(frozen);

  assert.throws(
    () => assertManifestImmutable(snapshot, { ...frozen, experimentId: 'mutated' }),
    (error) => error instanceof OfficialMatrixError && error.code === 'manifest_mutated',
  );
});

test('verifyMatrixCompleteness rejects missing cells', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildFrozenManifest(bundle);
  const cases = bundle.official.cases;
  const expected = enumerateExpectedCells(manifest, cases);

  assert.throws(
    () => verifyMatrixCompleteness(manifest, [], cases),
    (error) => error instanceof OfficialMatrixError && error.code === 'matrix_incomplete',
  );

  assert.equal(expected.length, 4);
});

test('revealMapping is blocked before lock and succeeds after lock', () => {
  const registry = createBlindingRegistry({
    artifacts: [
      {
        caseId: 'official-closures-001',
        subjectId: 'oss-baseline',
        seed: 'pilot-seed-1',
        sourceCode: CLOSURE_SOURCE,
        recoveryTaskIds: ['task-recover-exports'],
      },
    ],
  });

  assert.throws(() => revealMapping(registry), /mapping_reveal_blocked/);
  lockResults(registry);
  const revealed = revealMapping(registry);
  assert.ok(revealed.mapping);
  assert.ok(revealed.hash.startsWith('sha256-'));
});

test('computeResistanceAggregates traces aggregates to trial ids', () => {
  const results = {
    supportedCaseCount: 1,
    matrixCompleteness: { expectedCount: 4, actualCount: 4 },
    caseResults: [
      {
        caseId: 'official-closures-001',
        subjectId: 'oss-baseline',
        seed: 'pilot-seed-1',
        status: 'valid',
        performance: { buildDurationMs: 10 },
        diversity: [],
      },
    ],
    recovery: {
      trials: [
        {
          blindArtifactId: 'artifact-1',
          taskId: 'task-recover-exports',
          evaluatorId: 'eval-webcrack',
          trial: 1,
          outcome: 'completed',
          subjectId: 'oss-baseline',
          caseId: 'official-closures-001',
          seed: 'pilot-seed-1',
          excludedFromResistanceDenominator: false,
          effort: { wallClockMs: 100 },
        },
        {
          blindArtifactId: 'artifact-2',
          taskId: 'task-recover-exports',
          evaluatorId: 'eval-webcrack',
          trial: 1,
          outcome: 'failed',
          subjectId: 'own-minimal',
          caseId: 'official-closures-001',
          seed: 'pilot-seed-1',
          excludedFromResistanceDenominator: false,
          effort: { wallClockMs: 80 },
        },
      ],
    },
  };

  const manifest = {
    decisionRule: { primaryEndpoint: 'completion-rate-within-budget' },
    sampling: { minimumTotalCases: 1 },
    corpus: [{ caseId: 'official-closures-001', category: 'closures' }],
  };

  const aggregates = computeResistanceAggregates(results, manifest);
  assert.equal(aggregates.baselineCompletionRate, 100);
  assert.equal(aggregates.candidates['own-minimal'].completionRate, 0);
  assert.equal(aggregates.candidates['own-minimal'].trialIds.length, 1);
  assert.ok(aggregates.secondaryCosts.trialIds.length === 1);
});

test('deriveConclusion returns exactly one AC17 option per scenario', () => {
  const manifest = {
    decisionRule: { threshold: { minimumReductionPercentagePoints: 5 } },
    sampling: { minimumTotalCases: 1 },
    corpus: [{ caseId: 'official-closures-001', category: 'closures' }],
  };
  const insufficient = deriveConclusion(
    {
      caseResults: [{ subjectId: 'own-minimal', status: 'semantic_mismatch' }],
      recovery: { trials: [] },
      supportedCaseCount: 1,
    },
    { candidates: {} },
    manifest,
  );
  assert.equal(insufficient.id, 'evidencia-insuficiente');

  const engine = deriveConclusion(
    {
      caseResults: [{ subjectId: 'own-minimal', status: 'valid' }],
      recovery: { trials: [] },
      supportedCaseCount: 1,
    },
    {
      candidates: {
        'own-minimal': { pairedReductionInterval: { lower: 6, upper: 10, mean: 8 } },
      },
    },
    manifest,
  );
  assert.equal(engine.id, 'evidencia-justifica-engine-propria');

  const simpler = deriveConclusion(
    {
      caseResults: [{ subjectId: 'own-minimal', status: 'valid' }],
      recovery: { trials: [] },
      supportedCaseCount: 1,
    },
    {
      candidates: {
        'own-minimal': { pairedReductionInterval: { lower: 1, upper: 3, mean: 2 } },
      },
    },
    manifest,
  );
  assert.equal(simpler.id, 'evidencia-favorece-alternativa-mais-simples');
});

test('runOfficialMatrix produces self-contained results and derived report', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildFrozenManifest(bundle);
  const validation = validateManifest(manifest);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const { results, report } = await runOfficialMatrix({
    bundle,
    manifest,
    deps: {
      environment: manifest.environment,
      repositoryCommit: 'test-commit',
      webcrack: mockWebcrack,
      protectCandidate: (subjectId, sourceCode) => ({
        code: sourceCode,
        metadata: { candidateId: subjectId },
        buildDurationMs: 5,
      }),
      runRecoveryTrial: async () =>
        completedTrial({
          blindArtifactId: 'probe',
          taskId: 'task-recover-exports',
          evaluatorId: 'eval-webcrack',
          trial: 1,
        }),
    },
  });

  assert.equal(results.phase, 'official');
  assert.ok(AC17_CONCLUSIONS.includes(results.conclusion.id));
  assert.ok(results.blinding.revealed.mapping);
  assert.equal(results.blinding.preEvaluation.revealed, false);

  const serialized = JSON.stringify(results);
  assert.doesNotMatch(serialized, /"path"\s*:/);
  assert.doesNotMatch(serialized, /"fileRef"\s*:/);

  for (const cell of results.cells) {
    assert.equal(verifyEmbeddedArtifact(cell.sourceArtifact), true);
  }

  assert.match(report, /Conclusion \(AC17\)/);
  assert.match(report, /Baseline OSS justification \(AC20\)/);
  assert.match(report, /Anti-LLM dimension/);
  assert.match(report, /Primary endpoint/);
  assert.ok(report.includes(results.conclusion.id));
});

test('generateOfficialReport covers AC16 dimensions from results JSON', async () => {
  const bundle = buildMinimalBundle();
  const manifest = await buildFrozenManifest(bundle);

  const results = {
    experimentId: 'official-test',
    generatedAt: '2026-08-09T00:00:00.000Z',
    environment: manifest.environment,
    manifestSnapshot: manifest,
    matrixCompleteness: { expectedCount: 4, actualCount: 4 },
    supportedCaseCount: 1,
    calibration: {
      pairs: [{ taskId: 'task-recover-exports', evaluatorId: 'eval-webcrack', valid: true, diagnostics: [] }],
    },
    semanticCoverage: { validCandidateCells: 3, totalCandidateCells: 3 },
    blinding: {
      preEvaluation: {
        mappingArtifactHash: 'sha256-test',
        evaluatorViewHash: 'sha256-test',
        revealed: false,
      },
      revealed: true,
      manifestHashMismatch: true,
    },
    antiLlm: { status: 'inconclusive', summary: 'not integrated' },
    aggregates: {
      baselineCompletionRate: 50,
      candidates: {
        'oss-extension': {
          completionRate: 25,
          reductionPercentagePoints: 25,
          pairedReductionInterval: { lower: 10, upper: 30, mean: 20 },
          trialIds: [{ baselineTrialId: 'a', candidateTrialId: 'b' }],
        },
        'own-minimal': {
          completionRate: 0,
          reductionPercentagePoints: 50,
          pairedReductionInterval: { lower: 40, upper: 60, mean: 50 },
          trialIds: [{ baselineTrialId: 'a', candidateTrialId: 'c' }],
        },
      },
      byCase: {
        'official-closures-001:own-minimal:pilot-seed-1': {
          performance: { buildDurationMs: 12 },
          diversity: [],
        },
      },
      byCategory: { closures: { completionRate: 25, trialIds: ['trial-1'] } },
      secondaryCosts: {
        wallClockMs: { p50: 100, p95: 200 },
        trialIds: ['trial-1'],
      },
    },
    conclusion: {
      id: 'evidencia-justifica-engine-propria',
      rationale: ['test rationale'],
    },
    baselineJustification: ['javascript-obfuscator baseline justified'],
    limitations: ['test limitation'],
  };

  const report = generateOfficialReport(results);
  assert.match(report, /Semantic coverage/);
  assert.match(report, /Secondary costs/);
  assert.match(report, /Category aggregates/);
  assert.match(report, /javascript-obfuscator/);
  assert.match(report, /test limitation/);
});
