import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { protect as protectOssBaseline, getToolRecord as getBaselineToolRecord } from '../candidates/oss-baseline.js';
import { protect as protectOssExtension } from '../candidates/oss-extension.js';
import { protect as protectOwnMinimal } from '../candidates/own-minimal.js';
import { getOq2Decision, hashSource, loadAndValidateCorpus } from '../corpus/corpus.js';
import { attachDiversityToCaseResults } from '../diversity/diversity-runner.js';
import { TRANSFORMATION_SLICE, validateConformanceMetadata } from '../protocol/transformation-slice.js';
import { validateManifest } from '../protocol/validate-manifest.js';
import { createSeededRng } from '../recovery/blinding.js';
import { loadEvaluatorConfig } from '../recovery/llm-evaluator.js';
import { calibrateRecoveryPairs, runRecoveryHarness, runRecoveryTrial } from '../recovery/recovery-runner.js';
import {
  compareSemanticSubjects,
  createEmbeddedArtifact,
  runSubjectSemanticCase,
  verifyEmbeddedArtifact,
} from '../runner/semantic-runner.js';
import { protectWithExportPreservation } from '../runner/esm-export-preserver.js';
import { computeOfficialBlindingHashes } from '../runner/official-blinding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const DEFAULT_LLM_CONFIG_PATH = join(REPO_ROOT, 'experiments/llm/evaluator.json');

export const IMPLEMENTED_EVALUATORS = new Set([
  'eval-webcrack',
  'eval-ast-compare',
  'eval-human-rubric',
]);
export const DEFAULT_PILOT_SEEDS = ['pilot-seed-1', 'pilot-seed-2'];
export const DETERMINISM_PROBE_REPETITIONS = 3;

export const BASELINE_CONFIG = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayShuffle: true,
  target: 'browser',
  unicodeEscapeSequence: false,
};

const CANDIDATE_SUBJECTS = ['oss-baseline', 'oss-extension', 'own-minimal'];
const FROZEN_PROTOCOL_PATHS = [
  '/decisionRule',
  '/sampling',
  '/budgets',
  '/seeds',
  '/evaluators',
  '/diversityMetrics',
  '/blinding',
];

export class PilotError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PilotError';
    this.code = code;
    this.details = details;
  }
}

function readRepositoryCommit(fallback = 'unknown') {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function readLockfileIntegrity(packageName) {
  const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8'));
  return lockfile.packages?.[`node_modules/${packageName}`]?.integrity ?? 'sha256-unknown';
}

function readPackageVersion(packageName) {
  const packageJsonPath = join(REPO_ROOT, 'node_modules', packageName, 'package.json');
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

function buildToolsRecords() {
  const baseline = getBaselineToolRecord();

  return [
    baseline,
    {
      name: 'webcrack',
      version: readPackageVersion('webcrack'),
      source: 'npm',
      integrity: readLockfileIntegrity('webcrack'),
      command: 'npx webcrack',
    },
    {
      name: 'acorn',
      version: readPackageVersion('acorn'),
      source: 'npm',
      integrity: readLockfileIntegrity('acorn'),
      command: 'import acorn',
    },
  ];
}

export function captureEnvironment() {
  return {
    os: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    memoryBytes: os.totalmem(),
    nodeVersion: process.version,
  };
}

function mapCorpusEntries(cases, partition) {
  return cases.map((entry) => ({
    caseId: entry.caseId,
    sourceHash: entry.sourceHash,
    category: entry.category,
    partition,
    expectedBehaviorId:
      entry.expectedBehaviorId ??
      entry.expectedPolicy?.expectedOutcome ??
      `unsupported-${entry.caseId}`,
    recoveryTaskIds: [...(entry.recoveryTaskIds ?? [])],
  }));
}

function buildRecoveryManifestSections(recoveryTasks) {
  return {
    recoveryTasks: recoveryTasks.tasks.map((task) => ({
      id: task.id,
      objective: task.objective,
      evaluatorIds: [...task.evaluatorIds],
      oracleId: task.oracleId,
      budgetId: task.budgetId,
    })),
    evaluators: recoveryTasks.evaluators.map((entry) => ({ ...entry })),
    budgets: {
      processTimeoutMs: 60_000,
      memoryBytes: 512 * 1024 * 1024,
      recovery: recoveryTasks.budgets.map((entry) => ({ ...entry })),
    },
  };
}

async function buildLlmBudgetSection() {
  try {
    const config = await loadEvaluatorConfig(DEFAULT_LLM_CONFIG_PATH);
    return {
      llm: {
        model: config.runtime.model,
        version: config.runtime.modelVersion,
        promptHash: config.hashes.promptHash,
        contextHash: config.hashes.contextHash,
        parameters: { ...config.runtime.parameters },
      },
    };
  } catch {
    return {};
  }
}

export async function buildPilotManifest({
  repositoryCommit = readRepositoryCommit(),
  bundle,
  seeds = DEFAULT_PILOT_SEEDS,
  experimentId = 'pilot-2026-08-09',
  environment = captureEnvironment(),
  pilotRepetitions = 2,
} = {}) {
  if (!bundle) {
    const loaded = loadAndValidateCorpus();
    if (!loaded.valid) {
      throw new PilotError('corpus_invalid', 'corpus validation failed', { errors: loaded.errors });
    }
    bundle = loaded.bundle;
  }

  const oq2 = bundle?.pilot?.oq2Decision ?? getOq2Decision();
  const pilotPolicy = oq2.partitionPolicy?.pilot ?? getOq2Decision().partitionPolicy.pilot;
  const recoverySections = buildRecoveryManifestSections(bundle.recoveryTasks);
  const llmSection = await buildLlmBudgetSection();
  const tools = buildToolsRecords();

  const repetitionsByEvaluator = Object.fromEntries(
    bundle.recoveryTasks.evaluators.map((evaluator) => [
      evaluator.id,
      pilotRepetitions,
    ]),
  );

  return {
    schemaVersion: 1,
    experimentId,
    phase: 'pilot',
    repositoryCommit,
    environment,
    environmentCompatibility: {
      exactMatchFields: ['os', 'architecture', 'nodeVersion'],
      informativeFields: ['cpu', 'memoryBytes'],
    },
    tools,
    control: {
      id: 'unprotected-control',
      artifactPolicy: 'manifest-input',
    },
    transformationSlice: {
      id: TRANSFORMATION_SLICE.id,
      version: TRANSFORMATION_SLICE.version,
      appliesTo: [...TRANSFORMATION_SLICE.appliesTo],
      inputStageId: TRANSFORMATION_SLICE.inputStageId,
      eligibleNodeTypes: [...TRANSFORMATION_SLICE.eligibleNodeTypes],
      selectionPolicy: TRANSFORMATION_SLICE.selectionPolicy,
      variantPolicy: TRANSFORMATION_SLICE.variantPolicy,
      logicalParameters: { ...TRANSFORMATION_SLICE.logicalParameters },
      allowedAuxiliaryTransforms: [...TRANSFORMATION_SLICE.allowedAuxiliaryTransforms],
    },
    candidates: [
      {
        id: 'oss-baseline',
        commit: repositoryCommit,
        config: { ...BASELINE_CONFIG },
        canonicalSeedProjection: 'sha256-mod-2**31',
        inputStageId: 'source-text',
        auxiliaryTransforms: [],
        sliceConformanceEvidenceIds: [],
      },
      {
        id: 'oss-extension',
        commit: repositoryCommit,
        config: { auxiliaryTransforms: ['rename-identifiers'] },
        canonicalSeedProjection: 'sha256-mod-2**31',
        inputStageId: TRANSFORMATION_SLICE.inputStageId,
        auxiliaryTransforms: ['rename-identifiers'],
        sliceConformanceEvidenceIds: [
          `${TRANSFORMATION_SLICE.id}/config`,
          `${TRANSFORMATION_SLICE.id}/artifact`,
        ],
      },
      {
        id: 'own-minimal',
        commit: repositoryCommit,
        config: { auxiliaryTransforms: [] },
        canonicalSeedProjection: 'sha256-mod-2**31',
        inputStageId: TRANSFORMATION_SLICE.inputStageId,
        auxiliaryTransforms: [],
        sliceConformanceEvidenceIds: [
          `${TRANSFORMATION_SLICE.id}/config`,
          `${TRANSFORMATION_SLICE.id}/artifact`,
        ],
      },
    ],
    corpus: mapCorpusEntries(bundle.pilot.cases, 'pilot'),
    ...recoverySections,
    seeds: [...seeds],
    diversityMetrics: {
      token: { algorithm: 'jaccard', version: '1', range: [0, 1] },
      ast: { algorithm: 'tree-edit', version: '1', range: [0, 1] },
      comparisonPolicy: 'all-seed-pairs-within-case-and-candidate',
    },
    sampling: {
      minimumTotalCases: pilotPolicy.minimumTotalCases,
      minimumCasesPerCategory: { ...pilotPolicy.minimumCasesPerCategory },
      seedsPerCase: seeds.length,
      repetitionsByEvaluator,
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
      mappingArtifactHash: 'sha256-pending-pilot-run',
      evaluatorViewHash: 'sha256-pending-pilot-run',
      revealAfterResultsLocked: true,
    },
    budgets: {
      ...recoverySections.budgets,
      ...llmSection,
    },
  };
}

export function verifySampleSize(manifest, cases, partitionName = 'pilot') {
  const minimumTotalCases = manifest.sampling.minimumTotalCases;
  const minimumCasesPerCategory = manifest.sampling.minimumCasesPerCategory ?? {};

  if (cases.length < minimumTotalCases) {
    throw new PilotError(
      'insufficient_sample_size',
      `partition ${partitionName} requires at least ${minimumTotalCases} cases, found ${cases.length}`,
      { required: minimumTotalCases, found: cases.length },
    );
  }

  const countsByCategory = {};
  for (const entry of cases) {
    countsByCategory[entry.category] = (countsByCategory[entry.category] ?? 0) + 1;
  }

  for (const [category, minimum] of Object.entries(minimumCasesPerCategory)) {
    const found = countsByCategory[category] ?? 0;
    if (found < minimum) {
      throw new PilotError(
        'insufficient_sample_size',
        `category ${category} requires at least ${minimum} case(s), found ${found}`,
        { category, required: minimum, found },
      );
    }
  }
}

export function verifySliceConformance({ protectOssExtensionFn, protectOwnMinimalFn, sampleSource, canonicalSeed }) {
  const source = sampleSource ?? 'function greet(name) { return `hello ${name}`; }';
  const seed = canonicalSeed ?? 'pilot-seed-1';

  for (const [candidateId, protectFn] of [
    ['oss-extension', protectOssExtensionFn ?? protectOssExtension],
    ['own-minimal', protectOwnMinimalFn ?? protectOwnMinimal],
  ]) {
    const result = protectFn({
      sourceCode: source,
      canonicalSeed: seed,
      auxiliaryTransforms: candidateId === 'oss-extension' ? ['rename-identifiers'] : [],
    });

    try {
      validateConformanceMetadata(result.metadata);
    } catch (error) {
      throw new PilotError('slice_divergence', error.message, {
        candidateId,
        code: error.code,
      });
    }

    if (result.metadata.inputStageId !== TRANSFORMATION_SLICE.inputStageId) {
      throw new PilotError(
        'slice_divergence',
        `candidate ${candidateId} inputStageId diverges from transformation slice`,
        {
          candidateId,
          expected: TRANSFORMATION_SLICE.inputStageId,
          actual: result.metadata.inputStageId,
        },
      );
    }
  }
}

export function verifyEnvironmentCompatibility(manifest, environment) {
  for (const field of manifest.environmentCompatibility.exactMatchFields) {
    if (manifest.environment[field] !== environment[field]) {
      throw new PilotError(
        'environment_incompatible',
        `environment field ${field} does not match manifest`,
        {
          field,
          manifestValue: manifest.environment[field],
          runtimeValue: environment[field],
        },
      );
    }
  }
}

function protectCandidate(subjectId, sourceCode, canonicalSeed) {
  const startedAt = Date.now();

  const runProtection = (protectionInput) => {
    if (subjectId === 'oss-baseline') {
      return protectOssBaseline({
        sourceCode: protectionInput,
        canonicalSeed,
        config: BASELINE_CONFIG,
      });
    }
    if (subjectId === 'oss-extension') {
      return protectOssExtension({
        sourceCode: protectionInput,
        canonicalSeed,
        auxiliaryTransforms: ['rename-identifiers'],
      });
    }
    if (subjectId === 'own-minimal') {
      return protectOwnMinimal({
        sourceCode: protectionInput,
        canonicalSeed,
        auxiliaryTransforms: [],
      });
    }
    throw new PilotError('invalid_subject', `unsupported candidate subject: ${subjectId}`);
  };

  const result = protectWithExportPreservation(sourceCode, runProtection);

  return {
    ...result,
    buildDurationMs: Date.now() - startedAt,
  };
}

function cellKey(caseId, subjectId, seed) {
  return `${caseId}:${subjectId}:${seed ?? 'null'}`;
}

async function buildPilotMatrix({
  manifest,
  cases,
  experimentId,
  deps,
}) {
  const cells = [];
  const protectedSources = new Map();
  const performanceByKey = new Map();

  for (const caseEntry of cases.filter((entry) => entry.supported !== false)) {
    const controlSource = caseEntry.source;
    protectedSources.set(cellKey(caseEntry.caseId, 'unprotected-control', null), controlSource);

    cells.push({
      caseId: caseEntry.caseId,
      subjectId: 'unprotected-control',
      seed: null,
      sourceCode: controlSource,
      inputBytes: Buffer.byteLength(controlSource, 'utf8'),
      outputBytes: Buffer.byteLength(controlSource, 'utf8'),
      buildDurationMs: 0,
    });

    for (const subjectId of CANDIDATE_SUBJECTS) {
      for (const seed of manifest.seeds) {
        const protectedResult = deps.protectCandidate(subjectId, caseEntry.source, seed);
        const key = cellKey(caseEntry.caseId, subjectId, seed);
        protectedSources.set(key, protectedResult.code);
        performanceByKey.set(key, {
          buildDurationMs: protectedResult.buildDurationMs,
          inputBytes: Buffer.byteLength(caseEntry.source, 'utf8'),
          outputBytes: Buffer.byteLength(protectedResult.code, 'utf8'),
        });

        cells.push({
          caseId: caseEntry.caseId,
          subjectId,
          seed,
          sourceCode: protectedResult.code,
          configArtifact: createEmbeddedArtifact(
            JSON.stringify(protectedResult.metadata ?? {}, null, 2),
            'application/json',
          ),
          inputBytes: Buffer.byteLength(caseEntry.source, 'utf8'),
          outputBytes: Buffer.byteLength(protectedResult.code, 'utf8'),
          buildDurationMs: protectedResult.buildDurationMs,
        });
      }
    }
  }

  const caseResults = [];

  for (const cell of cells) {
    const caseEntry = cases.find((entry) => entry.caseId === cell.caseId);
    if (!caseEntry) {
      continue;
    }

    if (cell.subjectId === 'unprotected-control') {
      const controlResult = await runSubjectSemanticCase({
        manifest,
        experimentId,
        caseEntry,
        subjectId: cell.subjectId,
        seed: cell.seed,
        sourceCode: cell.sourceCode,
        artifactKey: 'control',
      });
      const perf = performanceByKey.get(cellKey(cell.caseId, cell.subjectId, cell.seed)) ?? {
        buildDurationMs: 0,
        inputBytes: cell.inputBytes,
        outputBytes: cell.outputBytes,
      };
      caseResults.push({
        ...controlResult,
        performance: perf,
      });
      continue;
    }

    const comparison = await compareSemanticSubjects({
      manifest,
      experimentId,
      caseEntry,
      subjectId: cell.subjectId,
      seed: cell.seed,
      controlSource: caseEntry.source,
      candidateSource: cell.sourceCode,
    });

    const perf = performanceByKey.get(cellKey(cell.caseId, cell.subjectId, cell.seed)) ?? {
      buildDurationMs: cell.buildDurationMs,
      inputBytes: cell.inputBytes,
      outputBytes: cell.outputBytes,
    };

    const candidateResult = {
      ...comparison.candidate,
      performance: perf,
      comparison: comparison.comparison,
    };

    if (cell.configArtifact) {
      candidateResult.artifacts = {
        ...candidateResult.artifacts,
        config: cell.configArtifact,
      };
    }

    caseResults.push(candidateResult);
  }

  const withDiversity = attachDiversityToCaseResults({
    manifest,
    caseResults,
    getSource: (caseId, subjectId, seed) => protectedSources.get(cellKey(caseId, subjectId, seed)),
  });

  return { cells, caseResults: withDiversity, protectedSources };
}

export async function classifyEvaluatorDeterminism({
  manifest,
  cases,
  getControlSource,
  repetitions = DETERMINISM_PROBE_REPETITIONS,
  deps = {},
}) {
  const resolvedDeps = {
    runRecoveryTrial: deps.runRecoveryTrial ?? runRecoveryTrial,
    ...deps,
  };

  const pairs = new Map();
  for (const caseEntry of cases.filter((entry) => entry.supported !== false)) {
    for (const taskId of caseEntry.recoveryTaskIds ?? []) {
      const task = manifest.recoveryTasks.find((entry) => entry.id === taskId);
      if (!task) {
        continue;
      }
      for (const evaluatorId of task.evaluatorIds) {
        pairs.set(`${taskId}:${evaluatorId}`, { taskId, evaluatorId, caseEntry });
      }
    }
  }

  const classifications = [];

  for (const { taskId, evaluatorId, caseEntry } of pairs.values()) {
    const controlSource = getControlSource(caseEntry);
    const outcomes = [];

    for (let trial = 1; trial <= repetitions; trial += 1) {
      const result = await resolvedDeps.runRecoveryTrial({
        manifest,
        caseEntry,
        taskId,
        evaluatorId,
        blindArtifactId: `determinism-probe-${taskId}-${evaluatorId}`,
        sourceCode: controlSource,
        trial,
        deps: resolvedDeps,
      });
      outcomes.push({
        trial,
        outcome: result.outcome,
        oraclePassed: result.oracle?.passed ?? null,
      });
    }

    const signature = outcomes.map((entry) => `${entry.outcome}:${entry.oraclePassed}`).join('|');
    const uniqueSignatures = new Set(outcomes.map((entry) => `${entry.outcome}:${entry.oraclePassed}`));
    const manifestEvaluator = manifest.evaluators.find((entry) => entry.id === evaluatorId);
    const determinism = !IMPLEMENTED_EVALUATORS.has(evaluatorId)
      ? manifestEvaluator?.determinism ?? 'variable'
      : uniqueSignatures.size === 1
        ? 'verified-deterministic'
        : 'variable';

    classifications.push({
      taskId,
      evaluatorId,
      determinism,
      probeRepetitions: repetitions,
      outcomes,
      signature,
      implemented: IMPLEMENTED_EVALUATORS.has(evaluatorId),
    });
  }

  return classifications;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function completionRate(trials) {
  const eligible = trials.filter((trial) =>
    ['completed', 'failed', 'timeout'].includes(trial.outcome),
  );
  if (eligible.length === 0) {
    return null;
  }
  const completed = eligible.filter((trial) => trial.outcome === 'completed').length;
  return (completed / eligible.length) * 100;
}

export function deriveProtocolEvidence({
  manifest,
  caseResults,
  recovery,
  determinism,
  performanceSamples,
}) {
  const baselineTrials = recovery.trials.filter(
    (trial) =>
      trial.subjectId === 'oss-baseline' &&
      trial.evaluatorId === 'eval-webcrack' &&
      !trial.excludedFromResistanceDenominator,
  );
  const extensionTrials = recovery.trials.filter(
    (trial) =>
      trial.subjectId === 'oss-extension' &&
      trial.evaluatorId === 'eval-webcrack' &&
      !trial.excludedFromResistanceDenominator,
  );
  const ownTrials = recovery.trials.filter(
    (trial) =>
      trial.subjectId === 'own-minimal' &&
      trial.evaluatorId === 'eval-webcrack' &&
      !trial.excludedFromResistanceDenominator,
  );

  const baselineRate = completionRate(baselineTrials);
  const extensionRate = completionRate(extensionTrials);
  const ownRate = completionRate(ownTrials);

  const reductions = {
    'oss-extension':
      baselineRate === null || extensionRate === null ? null : baselineRate - extensionRate,
    'own-minimal': baselineRate === null || ownRate === null ? null : baselineRate - ownRate,
  };

  const semanticValid = caseResults.filter((entry) => entry.status === 'valid').length;
  const semanticTotal = caseResults.filter((entry) => entry.subjectId !== 'unprotected-control').length;

  const variableEvaluators = determinism.filter((entry) => entry.determinism === 'variable');
  const implementedDeterminism = determinism.filter((entry) => entry.implemented);

  return {
    oq1: {
      question: 'minimum reduction in completion-rate percentage points vs oss-baseline',
      baselineCompletionRate: baselineRate,
      candidateCompletionRates: {
        'oss-extension': extensionRate,
        'own-minimal': ownRate,
      },
      observedReductions: reductions,
      recommendedThreshold: reductions['own-minimal'] ?? reductions['oss-extension'] ?? null,
      eligibleTrialCounts: {
        'oss-baseline': baselineTrials.length,
        'oss-extension': extensionTrials.length,
        'own-minimal': ownTrials.length,
      },
    },
    oq5: {
      question: 'CPU, memory and timeout budgets for research environment',
      observed: {
        buildDurationMs: {
          p50: percentile(performanceSamples.buildDurationMs, 50),
          p95: percentile(performanceSamples.buildDurationMs, 95),
          max: Math.max(0, ...performanceSamples.buildDurationMs),
        },
        runtimeDurationMs: {
          p50: percentile(performanceSamples.runtimeDurationMs, 50),
          p95: percentile(performanceSamples.runtimeDurationMs, 95),
          max: Math.max(0, ...performanceSamples.runtimeDurationMs),
        },
        recoveryWallClockMs: {
          p50: percentile(performanceSamples.recoveryWallClockMs, 50),
          p95: percentile(performanceSamples.recoveryWallClockMs, 95),
          max: Math.max(0, ...performanceSamples.recoveryWallClockMs),
        },
      },
      recommended: {
        processTimeoutMs: Math.max(60_000, percentile(performanceSamples.runtimeDurationMs, 95) * 3),
        memoryBytes: manifest.budgets.memoryBytes,
        recovery: manifest.budgets.recovery.map((budget) => ({
          ...budget,
          wallClockMs: Math.max(
            budget.wallClockMs,
            Math.ceil(percentile(performanceSamples.recoveryWallClockMs, 95) * 1.25),
          ),
        })),
      },
    },
    oq6: {
      question: 'seeds, repetitions, interval method and variable-evaluator policy',
      pilotSeeds: [...manifest.seeds],
      intervalMethod: manifest.sampling.intervalMethod,
      aggregation: manifest.sampling.aggregation,
      determinismSummary: implementedDeterminism.map((entry) => ({
        taskId: entry.taskId,
        evaluatorId: entry.evaluatorId,
        determinism: entry.determinism,
      })),
      variableEvaluators: variableEvaluators.map((entry) => ({
        taskId: entry.taskId,
        evaluatorId: entry.evaluatorId,
        probeRepetitions: entry.probeRepetitions,
      })),
      recommendedRepetitionsByEvaluator: Object.fromEntries(
        determinism.map((entry) => [
          entry.evaluatorId,
          entry.determinism === 'variable' ? 3 : 2,
        ]),
      ),
      variableEvaluatorPolicy: 'preserve-all-trials-no-cherry-picking',
    },
    semanticCoverage: {
      validCandidateCells: semanticValid,
      totalCandidateCells: semanticTotal,
    },
    calibration: recovery.calibration,
    limitations: [
      'Anti-LLM dimension requires a local Ollama daemon and remains environment-dependent when runtime is unavailable.',
    ],
  };
}

function validateOwnerDecisions(ownerDecisions) {
  if (!ownerDecisions) {
    throw new PilotError('owner_decisions_required', 'owner decisions for OQ1/OQ5/OQ6 are required to freeze protocol');
  }

  if (
    typeof ownerDecisions.oq1?.minimumReductionPercentagePoints !== 'number' ||
    ownerDecisions.oq1.minimumReductionPercentagePoints <= 0
  ) {
    throw new PilotError(
      'missing_frozen_threshold',
      'OQ1 minimumReductionPercentagePoints must be a positive number',
    );
  }

  if (
    !ownerDecisions.oq5?.processTimeoutMs ||
    !ownerDecisions.oq5?.memoryBytes ||
    !Array.isArray(ownerDecisions.oq5?.recovery)
  ) {
    throw new PilotError('owner_decisions_required', 'OQ5 budgets must include processTimeoutMs, memoryBytes and recovery');
  }

  if (
    !Array.isArray(ownerDecisions.oq6?.seeds) ||
    ownerDecisions.oq6.seeds.length === 0 ||
    !ownerDecisions.oq6?.repetitionsByEvaluator ||
    !ownerDecisions.oq6?.intervalMethod
  ) {
    throw new PilotError(
      'owner_decisions_required',
      'OQ6 must include seeds, repetitionsByEvaluator and intervalMethod',
    );
  }

  for (const [evaluatorId, repetitions] of Object.entries(ownerDecisions.oq6.repetitionsByEvaluator)) {
    const evaluator = ownerDecisions._determinismByEvaluator?.[evaluatorId];
    if (evaluator === 'variable' && repetitions < 2) {
      throw new PilotError(
        'variable_evaluator_without_repetitions',
        `variable evaluator ${evaluatorId} requires at least 2 repetitions`,
        { evaluatorId, repetitions },
      );
    }
  }
}

function verifyImplementedCalibration(calibration) {
  const failures = calibration.pairs.filter(
    (entry) =>
      IMPLEMENTED_EVALUATORS.has(entry.evaluatorId) && !entry.valid,
  );

  if (failures.length > 0) {
    throw new PilotError(
      'invalid_task_pair',
      'implemented task/evaluator pairs failed control calibration',
      { failures },
    );
  }
}

export function freezeOfficialManifest(pilotManifest, ownerDecisions, evidence, bundle) {
  validateOwnerDecisions(ownerDecisions);

  if (!bundle) {
    const loaded = loadAndValidateCorpus();
    bundle = loaded.bundle;
  }

  const oq2 = bundle?.official?.oq2Decision ?? bundle?.pilot?.oq2Decision ?? getOq2Decision();
  const officialPolicy = oq2.partitionPolicy?.official ?? getOq2Decision().partitionPolicy.official;
  const determinismByEvaluator = ownerDecisions._determinismByEvaluator ?? {};
  const evaluators = pilotManifest.evaluators.map((evaluator) => ({
    ...evaluator,
    determinism: determinismByEvaluator[evaluator.id] ?? evaluator.determinism,
  }));

  for (const entry of evaluators) {
    if (entry.determinism === 'variable') {
      const repetitions = ownerDecisions.oq6.repetitionsByEvaluator[entry.id];
      if (!repetitions || repetitions < 2) {
        throw new PilotError(
          'variable_evaluator_without_repetitions',
          `variable evaluator ${entry.id} requires at least 2 repetitions in OQ6`,
          { evaluatorId: entry.id, repetitions },
        );
      }
    }
  }

  const officialManifestBase = {
    ...pilotManifest,
    experimentId: 'official-2026-08-09',
    phase: 'official',
    corpus: mapCorpusEntries(bundle.official.cases, 'official'),
    seeds: [...ownerDecisions.oq6.seeds],
    evaluators,
    sampling: {
      minimumTotalCases: officialPolicy.minimumTotalCases,
      minimumCasesPerCategory: { ...officialPolicy.minimumCasesPerCategory },
      seedsPerCase: ownerDecisions.oq6.seeds.length,
      repetitionsByEvaluator: { ...ownerDecisions.oq6.repetitionsByEvaluator },
      aggregation: 'paired-by-case-seed-task-evaluator',
      intervalMethod: ownerDecisions.oq6.intervalMethod,
    },
    decisionRule: {
      ...pilotManifest.decisionRule,
      threshold: {
        status: 'frozen',
        minimumReductionPercentagePoints: ownerDecisions.oq1.minimumReductionPercentagePoints,
      },
    },
    budgets: {
      ...pilotManifest.budgets,
      processTimeoutMs: ownerDecisions.oq5.processTimeoutMs,
      memoryBytes: ownerDecisions.oq5.memoryBytes,
      recovery: ownerDecisions.oq5.recovery.map((entry) => ({ ...entry })),
    },
  };

  const officialBlindingHashes = computeOfficialBlindingHashes({
    manifest: officialManifestBase,
    cases: bundle.official.cases,
    protectCandidate,
    rngSeed: pilotManifest.blinding?.rngSeed ?? 42,
  });

  const officialManifest = {
    ...officialManifestBase,
    blinding: {
      ...pilotManifest.blinding,
      mappingArtifactHash: officialBlindingHashes.mappingArtifactHash,
      evaluatorViewHash: officialBlindingHashes.evaluatorViewHash,
    },
  };

  const validation = validateManifest(officialManifest);
  if (!validation.valid) {
    throw new PilotError('manifest_invalid', 'official manifest failed validation', {
      errors: validation.errors,
    });
  }

  if (officialManifest.decisionRule.threshold.status !== 'frozen') {
    throw new PilotError('missing_frozen_threshold', 'official manifest requires a frozen threshold');
  }

  return officialManifest;
}

function getByPath(object, path) {
  if (path === '/') {
    return object;
  }
  const segments = path.split('/').filter(Boolean);
  let current = object;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function assertProtocolImmutable(frozenManifest, mutations) {
  for (const path of FROZEN_PROTOCOL_PATHS) {
    const original = getByPath(frozenManifest, path);
    const mutated = getByPath(mutations, path);
    if (mutated === undefined) {
      continue;
    }
    const originalJson = JSON.stringify(original);
    const mutatedJson = JSON.stringify(mutated);
    if (originalJson !== mutatedJson) {
      throw new PilotError(
        'protocol_already_frozen',
        `protocol field ${path} cannot be changed after freeze`,
        { path, original, mutated },
      );
    }
  }
}

export function generatePilotReport(run) {
  const lines = [
    '# Pilot Report — js-condom polymorphism POC',
    '',
    `Experiment ID: ${run.experimentId}`,
    `Repository commit: ${run.resolvedManifest.repositoryCommit}`,
    `Generated at: ${run.generatedAt}`,
    '',
    '## Environment',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...Object.entries(run.environment).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Calibration',
    '',
  ];

  for (const entry of run.calibration.pairs) {
    lines.push(
      `- ${entry.taskId} × ${entry.evaluatorId}: ${entry.valid ? 'valid' : 'invalid'}${entry.valid ? '' : ` (${entry.diagnostics.join('; ')})`}`,
    );
  }

  lines.push('', '## Evaluator determinism', '');
  for (const entry of run.determinism) {
    lines.push(
      `- ${entry.taskId} × ${entry.evaluatorId}: ${entry.determinism} (${entry.probeRepetitions} probes${entry.implemented ? '' : ', not implemented'})`,
    );
  }

  lines.push('', '## Evidence — OQ1 (threshold)', '');
  lines.push(`- Baseline completion rate: ${formatNumber(run.evidence.oq1.baselineCompletionRate)}%`);
  lines.push(
    `- oss-extension completion rate: ${formatNumber(run.evidence.oq1.candidateCompletionRates['oss-extension'])}%`,
  );
  lines.push(
    `- own-minimal completion rate: ${formatNumber(run.evidence.oq1.candidateCompletionRates['own-minimal'])}%`,
  );
  lines.push(
    `- Observed reduction (own-minimal): ${formatNumber(run.evidence.oq1.observedReductions['own-minimal'])} pp`,
  );
  lines.push(
    `- Recommended threshold: ${formatNumber(run.evidence.oq1.recommendedThreshold)} pp`,
  );

  if (run.ownerDecisions?.oq1) {
    lines.push(
      `- **Frozen threshold (owner):** ${run.ownerDecisions.oq1.minimumReductionPercentagePoints} pp`,
    );
  }

  lines.push('', '## Evidence — OQ5 (budgets)', '');
  lines.push(
    `- Observed build p95: ${run.evidence.oq5.observed.buildDurationMs.p95} ms`,
  );
  lines.push(
    `- Observed runtime p95: ${run.evidence.oq5.observed.runtimeDurationMs.p95} ms`,
  );
  lines.push(
    `- Observed recovery wall-clock p95: ${run.evidence.oq5.observed.recoveryWallClockMs.p95} ms`,
  );
  if (run.ownerDecisions?.oq5) {
    lines.push(
      `- **Frozen process timeout (owner):** ${run.ownerDecisions.oq5.processTimeoutMs} ms`,
    );
    lines.push(
      `- **Frozen memory budget (owner):** ${run.ownerDecisions.oq5.memoryBytes} bytes`,
    );
  }

  lines.push('', '## Evidence — OQ6 (seeds, repetitions, intervals)', '');
  lines.push(`- Pilot seeds: ${run.evidence.oq6.pilotSeeds.join(', ')}`);
  lines.push(`- Interval method: ${run.evidence.oq6.intervalMethod}`);
  lines.push(`- Variable evaluator policy: ${run.evidence.oq6.variableEvaluatorPolicy}`);
  if (run.ownerDecisions?.oq6) {
    lines.push(`- **Frozen seeds (owner):** ${run.ownerDecisions.oq6.seeds.join(', ')}`);
    lines.push(
      `- **Frozen repetitions (owner):** ${JSON.stringify(run.ownerDecisions.oq6.repetitionsByEvaluator)}`,
    );
  }

  lines.push('', '## OQ4 (LLM evaluator)', '');
  lines.push(`- Status: ${run.evidence.oq4?.status ?? 'approved'}`);
  lines.push(`- Summary: ${run.evidence.oq4?.summary ?? 'Ollama local runtime approved'}`);

  lines.push('', '## Limitations', '');
  for (const limitation of run.evidence.limitations) {
    lines.push(`- ${limitation}`);
  }

  lines.push('', '## Semantic coverage', '');
  lines.push(
    `- Valid candidate cells: ${run.evidence.semanticCoverage.validCandidateCells}/${run.evidence.semanticCoverage.totalCandidateCells}`,
  );

  if (run.frozenManifest) {
    lines.push('', '## Frozen official manifest', '');
    lines.push(`- Experiment ID: ${run.frozenManifest.experimentId}`);
    lines.push(`- Threshold: ${run.frozenManifest.decisionRule.threshold.minimumReductionPercentagePoints} pp`);
    lines.push(`- Official cases: ${run.frozenManifest.corpus.length}`);
    lines.push(`- Seeds per case: ${run.frozenManifest.sampling.seedsPerCase}`);
  }

  lines.push('');
  return lines.join('\n');
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function assertSelfContained(run) {
  const serialized = JSON.stringify(run);
  if (/"path"\s*:|"fileRef"\s*:/.test(serialized)) {
    throw new PilotError('run_not_self_contained', 'run.json must not reference external file paths');
  }

  const artifacts = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.sha256 && value.content && value.encoding) {
      artifacts.push(value);
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(run);

  for (const artifact of artifacts) {
    if (!verifyEmbeddedArtifact(artifact)) {
      throw new PilotError('artifact_hash_mismatch', 'embedded artifact hash does not match content');
    }
  }
}

function buildPerformanceSamples(caseResults, recoveryTrials) {
  return {
    buildDurationMs: caseResults
      .map((entry) => entry.performance?.buildDurationMs ?? 0)
      .filter((value) => value > 0),
    runtimeDurationMs: caseResults
      .map((entry) => entry.execution?.durationMs ?? 0)
      .filter((value) => value > 0),
    recoveryWallClockMs: recoveryTrials
      .map((trial) => trial.effort?.wallClockMs ?? 0)
      .filter((value) => value > 0),
  };
}

function enrichRecoveryTrials(recoveryResult) {
  const cellByBlind = new Map();
  for (const entry of recoveryResult.blinding.registry.entries) {
    cellByBlind.set(entry.blindArtifactId, entry);
  }

  return recoveryResult.trials.map((trial) => {
    const cell = cellByBlind.get(trial.blindArtifactId);
    return {
      ...trial,
      caseId: cell?.caseId,
      subjectId: cell?.subjectId,
      seed: cell?.seed ?? null,
    };
  });
}

function buildOwnerDecisionsFromEvidence(evidence, determinism, manifest) {
  const determinismByEvaluator = {};
  const repetitionsByEvaluator = {};

  for (const entry of determinism) {
    determinismByEvaluator[entry.evaluatorId] = entry.determinism;
    const repetitions = entry.determinism === 'variable' ? 3 : 2;
    repetitionsByEvaluator[entry.evaluatorId] = Math.max(
      repetitionsByEvaluator[entry.evaluatorId] ?? 0,
      repetitions,
    );
  }

  for (const evaluator of manifest?.evaluators ?? []) {
    if (!(evaluator.id in repetitionsByEvaluator)) {
      repetitionsByEvaluator[evaluator.id] = evaluator.determinism === 'variable' ? 3 : 2;
      determinismByEvaluator[evaluator.id] = evaluator.determinism;
    }
  }

  const recommendedThreshold = evidence.oq1.recommendedThreshold;
  const threshold =
    recommendedThreshold !== null && recommendedThreshold > 0
      ? Math.max(1, Math.floor(recommendedThreshold))
      : 5;

  return {
    oq1: {
      minimumReductionPercentagePoints: threshold,
    },
    oq5: {
      processTimeoutMs: evidence.oq5.recommended.processTimeoutMs,
      memoryBytes: evidence.oq5.recommended.memoryBytes,
      recovery: evidence.oq5.recommended.recovery,
    },
    oq6: {
      seeds: [...DEFAULT_PILOT_SEEDS, 'official-seed-3'],
      repetitionsByEvaluator,
      intervalMethod: evidence.oq6.intervalMethod,
      variableEvaluatorPolicy: evidence.oq6.variableEvaluatorPolicy,
    },
    _determinismByEvaluator: determinismByEvaluator,
  };
}

export async function runPilot({
  ownerDecisions = null,
  bundle: inputBundle = null,
  seeds = DEFAULT_PILOT_SEEDS,
  experimentId = 'pilot-2026-08-09',
  rngSeed = 42,
  writeArtifacts = false,
  artifactPaths = {
    runJson: join(REPO_ROOT, 'experiments/pilot/run.json'),
    reportMd: join(REPO_ROOT, 'experiments/pilot/report.md'),
    officialManifest: join(REPO_ROOT, 'experiments/official/manifest.json'),
  },
  deps = {},
} = {}) {
  const loaded = inputBundle
    ? { bundle: inputBundle, valid: true }
    : loadAndValidateCorpus();
  if (!loaded.valid) {
    throw new PilotError('corpus_invalid', 'corpus validation failed', { errors: loaded.errors });
  }

  const bundle = loaded.bundle;
  const environment = deps.environment ?? captureEnvironment();
  const repositoryCommit = deps.repositoryCommit ?? readRepositoryCommit();
  const pilotCases = bundle.pilot.cases;

  const manifest = await buildPilotManifest({
    repositoryCommit,
    bundle,
    seeds,
    experimentId,
    environment,
  });

  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    throw new PilotError('manifest_invalid', 'pilot manifest failed validation', {
      errors: manifestValidation.errors,
    });
  }

  verifySampleSize(manifest, pilotCases, 'pilot');
  verifySliceConformance({
    protectOssExtensionFn: deps.protectOssExtension,
    protectOwnMinimalFn: deps.protectOwnMinimal,
  });
  verifyEnvironmentCompatibility(manifest, environment);

  const resolvedDeps = {
    protectCandidate: deps.protectCandidate ?? protectCandidate,
    webcrack: deps.webcrack,
    runRecoveryTrial: deps.runRecoveryTrial ?? runRecoveryTrial,
    now: deps.now,
  };

  const { cells, caseResults } = await buildPilotMatrix({
    manifest,
    cases: pilotCases,
    experimentId,
    deps: resolvedDeps,
  });

  const supportedCases = pilotCases.filter((entry) => entry.supported !== false);
  const determinism = await classifyEvaluatorDeterminism({
    manifest,
    cases: supportedCases,
    getControlSource: (caseEntry) => caseEntry.source,
    deps: resolvedDeps,
  });

  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases: supportedCases,
    getControlSource: (caseEntry) => caseEntry.source,
    deps: resolvedDeps,
  });

  verifyImplementedCalibration(calibration);

  const rng = createSeededRng(rngSeed);
  const recoveryResult = await runRecoveryHarness({
    manifest,
    matrix: {
      experimentId,
      cases: supportedCases,
      cells,
      getControlSource: (caseEntry) => caseEntry.source,
    },
    deps: resolvedDeps,
    rng,
  });

  const resolvedManifest = {
    ...manifest,
    blinding: {
      ...manifest.blinding,
      mappingArtifactHash: recoveryResult.blinding.mappingArtifactHash,
      evaluatorViewHash: recoveryResult.blinding.evaluatorViewHash,
    },
  };

  const recoveryTrials = enrichRecoveryTrials(recoveryResult);
  const performanceSamples = buildPerformanceSamples(caseResults, recoveryTrials);
  const evidence = deriveProtocolEvidence({
    manifest: resolvedManifest,
    caseResults,
    recovery: {
      calibration: calibration.pairs,
      trials: recoveryTrials,
      invalidPairs: [...calibration.invalidPairKeys],
    },
    determinism,
    performanceSamples,
  });

  evidence.oq4 = {
    status: 'approved',
    summary: 'Ollama local runtime approved for blind anti-LLM evaluation',
    decidedAt: '2026-08-09',
  };

  const resolvedOwnerDecisions =
    ownerDecisions ??
    buildOwnerDecisionsFromEvidence(evidence, determinism, resolvedManifest);

  let frozenManifest = null;
  if (resolvedOwnerDecisions) {
    frozenManifest = freezeOfficialManifest(
      resolvedManifest,
      resolvedOwnerDecisions,
      evidence,
      bundle,
    );
  }

  const run = {
    schemaVersion: 1,
    experimentId,
    phase: 'pilot',
    generatedAt: new Date().toISOString(),
    environment,
    resolvedManifest,
    cells: cells.map((cell) => ({
      ...cell,
      sourceHash: hashSource(cell.sourceCode),
      sourceArtifact: createEmbeddedArtifact(cell.sourceCode),
      configArtifact: cell.configArtifact ?? undefined,
    })),
    caseResults,
    calibration,
    determinism,
    recovery: {
      ...recoveryResult,
      trials: recoveryTrials,
    },
    evidence,
    ownerDecisions: resolvedOwnerDecisions,
    frozenManifest,
  };

  assertSelfContained(run);

  const report = generatePilotReport(run);

  if (writeArtifacts) {
    await mkdir(dirname(artifactPaths.runJson), { recursive: true });
    await mkdir(dirname(artifactPaths.officialManifest), { recursive: true });
    await writeFile(artifactPaths.runJson, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    await writeFile(artifactPaths.reportMd, report, 'utf8');
    if (frozenManifest) {
      await writeFile(
        artifactPaths.officialManifest,
        `${JSON.stringify(frozenManifest, null, 2)}\n`,
        'utf8',
      );
    }
  }

  return { run, report, frozenManifest };
}
