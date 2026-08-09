import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { protect as protectOssBaseline } from '../candidates/oss-baseline.js';
import { protect as protectOssExtension } from '../candidates/oss-extension.js';
import { protect as protectOwnMinimal } from '../candidates/own-minimal.js';
import { hashSource, loadAndValidateCorpus } from '../corpus/corpus.js';
import { attachDiversityToCaseResults } from '../diversity/diversity-runner.js';
import { validateManifest } from '../protocol/validate-manifest.js';
import {
  buildEvaluatorView,
  buildMappingArtifact,
  createBlindingRegistry,
  createSeededRng,
  revealMapping,
} from '../recovery/blinding.js';
import { calibrateRecoveryPairs, runRecoveryHarness, runRecoveryTrial } from '../recovery/recovery-runner.js';
import { loadEvaluatorConfig, runLlmRecoveryTrial } from '../recovery/llm-evaluator.js';
import {
  BASELINE_CONFIG,
  captureEnvironment,
  PilotError,
  verifyEnvironmentCompatibility,
  verifySampleSize,
  verifySliceConformance,
} from '../analysis/pilot.js';
import {
  protectWithExportPreservation,
} from './esm-export-preserver.js';
import {
  compareSemanticSubjects,
  createEmbeddedArtifact,
  runSubjectSemanticCase,
  verifyEmbeddedArtifact,
} from './semantic-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../../');

export const OfficialMatrixError = PilotError;

export const AC17_CONCLUSIONS = [
  'evidencia-favorece-alternativa-mais-simples',
  'evidencia-justifica-engine-propria',
  'evidencia-insuficiente',
];

const CANDIDATE_SUBJECTS = ['oss-baseline', 'oss-extension', 'own-minimal'];
const PRIMARY_EVALUATOR_ID = 'eval-webcrack';
const BOOTSTRAP_SAMPLES = 1000;

function readRepositoryCommit(fallback = 'unknown') {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function cellKey(caseId, subjectId, seed) {
  return `${caseId}:${subjectId}:${seed ?? 'null'}`;
}

function trialKey(trial) {
  return `${trial.blindArtifactId}:${trial.taskId}:${trial.evaluatorId}:${trial.trial}`;
}

export function protectCandidate(subjectId, sourceCode, canonicalSeed) {
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
    throw new OfficialMatrixError('invalid_subject', `unsupported candidate subject: ${subjectId}`);
  };

  const result = protectWithExportPreservation(sourceCode, runProtection);

  return {
    ...result,
    buildDurationMs: Date.now() - startedAt,
  };
}

export function loadFrozenOfficialManifest(manifestPath) {
  const absolutePath = manifestPath.startsWith('/') ? manifestPath : join(REPO_ROOT, manifestPath);
  const raw = readFileSync(absolutePath, 'utf8');
  const manifest = JSON.parse(raw);
  const validation = validateManifest(manifest);

  if (!validation.valid) {
    throw new OfficialMatrixError('manifest_invalid', 'official manifest failed validation', {
      errors: validation.errors,
    });
  }

  if (manifest.phase !== 'official') {
    throw new OfficialMatrixError('manifest_invalid', 'manifest phase must be official', {
      phase: manifest.phase,
    });
  }

  if (manifest.decisionRule?.threshold?.status !== 'frozen') {
    throw new OfficialMatrixError('missing_frozen_threshold', 'official manifest requires a frozen threshold');
  }

  return { manifest, snapshot: JSON.stringify(manifest) };
}

export function assertManifestImmutable(originalSnapshot, currentManifest) {
  const currentJson = JSON.stringify(currentManifest);
  if (currentJson !== originalSnapshot.trim()) {
    throw new OfficialMatrixError('manifest_mutated', 'frozen manifest was modified during official matrix run');
  }
}

export function resolveOfficialCases(bundle, manifest) {
  const casesById = new Map(bundle.official.cases.map((entry) => [entry.caseId, entry]));
  const resolved = [];

  for (const corpusEntry of manifest.corpus) {
    const caseEntry = casesById.get(corpusEntry.caseId);
    if (!caseEntry) {
      throw new OfficialMatrixError('corpus_mismatch', `manifest corpus case not found: ${corpusEntry.caseId}`);
    }

    if (caseEntry.sourceHash !== corpusEntry.sourceHash) {
      throw new OfficialMatrixError('corpus_hash_mismatch', `sourceHash mismatch for ${corpusEntry.caseId}`, {
        caseId: corpusEntry.caseId,
        manifestHash: corpusEntry.sourceHash,
        corpusHash: caseEntry.sourceHash,
      });
    }

    resolved.push({
      ...caseEntry,
      category: corpusEntry.category,
      partition: corpusEntry.partition,
      expectedBehaviorId: corpusEntry.expectedBehaviorId,
      recoveryTaskIds: [...corpusEntry.recoveryTaskIds],
    });
  }

  return resolved;
}

export function enumerateExpectedCells(manifest, cases) {
  const expected = [];

  for (const caseEntry of cases.filter((entry) => entry.supported !== false)) {
    expected.push({
      caseId: caseEntry.caseId,
      subjectId: 'unprotected-control',
      seed: null,
    });

    for (const subjectId of CANDIDATE_SUBJECTS) {
      for (const seed of manifest.seeds) {
        expected.push({ caseId: caseEntry.caseId, subjectId, seed });
      }
    }
  }

  return expected;
}

export function verifyMatrixCompleteness(manifest, cells, cases) {
  const expected = enumerateExpectedCells(manifest, cases);
  const actualKeys = new Set(cells.map((cell) => cellKey(cell.caseId, cell.subjectId, cell.seed)));

  const missing = expected.filter(
    (entry) => !actualKeys.has(cellKey(entry.caseId, entry.subjectId, entry.seed)),
  );

  if (missing.length > 0) {
    throw new OfficialMatrixError('matrix_incomplete', 'official matrix is missing expected cells', {
      missing,
    });
  }

  return { expectedCount: expected.length, actualCount: cells.length };
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

function isResistanceTrial(trial) {
  return (
    trial.evaluatorId === PRIMARY_EVALUATOR_ID &&
    !trial.excludedFromResistanceDenominator &&
    trial.subjectId !== 'unprotected-control'
  );
}

function bootstrapReductionInterval(pairedReductions, samples = BOOTSTRAP_SAMPLES) {
  if (pairedReductions.length === 0) {
    return { lower: null, upper: null, mean: null };
  }

  const rng = createSeededRng(42);
  const bootstrapMeans = [];

  for (let sample = 0; sample < samples; sample += 1) {
    let sum = 0;
    for (let index = 0; index < pairedReductions.length; index += 1) {
      const pick = Math.floor(rng.random() * pairedReductions.length);
      sum += pairedReductions[pick];
    }
    bootstrapMeans.push(sum / pairedReductions.length);
  }

  return {
    lower: percentile(bootstrapMeans, 2.5),
    upper: percentile(bootstrapMeans, 97.5),
    mean: pairedReductions.reduce((acc, value) => acc + value, 0) / pairedReductions.length,
  };
}

function buildPairedReductions(trials, candidateId) {
  const baselineTrials = trials.filter(
    (trial) => trial.subjectId === 'oss-baseline' && isResistanceTrial(trial),
  );
  const candidateTrials = trials.filter(
    (trial) => trial.subjectId === candidateId && isResistanceTrial(trial),
  );

  const candidateByPair = new Map(
    candidateTrials.map((trial) => [
      `${trial.caseId}:${trial.seed ?? 'null'}:${trial.taskId}:${trial.evaluatorId}:${trial.trial}`,
      trial,
    ]),
  );

  const reductions = [];
  const trialIds = [];

  for (const baselineTrial of baselineTrials) {
    const pairKey = `${baselineTrial.caseId}:${baselineTrial.seed ?? 'null'}:${baselineTrial.taskId}:${baselineTrial.evaluatorId}:${baselineTrial.trial}`;
    const candidateTrial = candidateByPair.get(pairKey);
    if (!candidateTrial) {
      continue;
    }

    const baselineCompleted = baselineTrial.outcome === 'completed' ? 1 : 0;
    const candidateCompleted = candidateTrial.outcome === 'completed' ? 1 : 0;
    reductions.push((baselineCompleted - candidateCompleted) * 100);
    trialIds.push({
      baselineTrialId: trialKey(baselineTrial),
      candidateTrialId: trialKey(candidateTrial),
    });
  }

  return { reductions, trialIds };
}

export function computeResistanceAggregates(results, manifest) {
  const trials = results.recovery?.trials ?? [];
  const caseResults = results.caseResults ?? [];
  const categories = new Map(manifest.corpus.map((entry) => [entry.caseId, entry.category]));

  const baselineTrials = trials.filter(
    (trial) => trial.subjectId === 'oss-baseline' && isResistanceTrial(trial),
  );
  const baselineRate = completionRate(baselineTrials);

  const candidateAggregates = {};

  for (const candidateId of ['oss-extension', 'own-minimal']) {
    const candidateTrials = trials.filter(
      (trial) => trial.subjectId === candidateId && isResistanceTrial(trial),
    );
    const candidateRate = completionRate(candidateTrials);
    const { reductions, trialIds } = buildPairedReductions(trials, candidateId);
    const interval = bootstrapReductionInterval(reductions);

    candidateAggregates[candidateId] = {
      completionRate: candidateRate,
      reductionPercentagePoints:
        baselineRate === null || candidateRate === null ? null : baselineRate - candidateRate,
      pairedReductionInterval: interval,
      eligibleTrialCount: candidateTrials.length,
      trialIds,
    };
  }

  const byCase = {};
  for (const caseResult of caseResults) {
    if (caseResult.subjectId === 'unprotected-control') {
      continue;
    }

    const caseTrials = trials.filter(
      (trial) =>
        trial.caseId === caseResult.caseId &&
        trial.subjectId === caseResult.subjectId &&
        trial.seed === caseResult.seed &&
        isResistanceTrial(trial),
    );

    byCase[cellKey(caseResult.caseId, caseResult.subjectId, caseResult.seed)] = {
      caseId: caseResult.caseId,
      subjectId: caseResult.subjectId,
      seed: caseResult.seed,
      semanticStatus: caseResult.status,
      completionRate: completionRate(caseTrials),
      trialIds: caseTrials.map((trial) => trialKey(trial)),
      performance: caseResult.performance ?? null,
      diversity: caseResult.diversity ?? null,
    };
  }

  const byCategory = {};
  for (const category of new Set(categories.values())) {
    const categoryTrials = trials.filter(
      (trial) =>
        isResistanceTrial(trial) &&
        categories.get(trial.caseId) === category,
    );
    byCategory[category] = {
      completionRate: completionRate(categoryTrials),
      trialIds: categoryTrials.map((trial) => trialKey(trial)),
    };
  }

  const costTrials = trials.filter(
    (trial) => isResistanceTrial(trial) && trial.outcome === 'completed',
  );
  const wallClockMs = costTrials.map((trial) => trial.effort?.wallClockMs ?? 0);

  return {
    primaryEndpoint: manifest.decisionRule.primaryEndpoint,
    baselineCompletionRate: baselineRate,
    candidates: candidateAggregates,
    byCase,
    byCategory,
    secondaryCosts: {
      completedTrialCount: costTrials.length,
      wallClockMs: {
        p50: percentile(wallClockMs, 50),
        p95: percentile(wallClockMs, 95),
        max: Math.max(0, ...wallClockMs),
      },
      trialIds: costTrials.map((trial) => trialKey(trial)),
    },
    sampleSize: {
      supportedCases: results.supportedCaseCount ?? 0,
      expectedCells: results.matrixCompleteness?.expectedCount ?? 0,
      actualCells: results.matrixCompleteness?.actualCount ?? 0,
    },
  };
}

export function deriveConclusion(results, aggregates, manifest) {
  const threshold = manifest.decisionRule.threshold.minimumReductionPercentagePoints;
  const candidateResults = (results.caseResults ?? []).filter(
    (entry) => entry.subjectId !== 'unprotected-control',
  );
  const semanticInvalid = candidateResults.filter((entry) => entry.status !== 'valid');

  const blockingTrials = (results.recovery?.trials ?? []).filter(
    (trial) =>
      trial.subjectId !== 'unprotected-control' &&
      ['tool_error', 'inconclusive'].includes(trial.outcome) &&
      !trial.excludedFromResistanceDenominator,
  );

  const minimumCases = manifest.sampling.minimumTotalCases;
  const corpusCaseCount = manifest.corpus?.length ?? 0;

  if (
    semanticInvalid.length > 0 ||
    blockingTrials.length > 0 ||
    corpusCaseCount < minimumCases ||
    results.matrixIncomplete === true
  ) {
    return {
      id: 'evidencia-insuficiente',
      rationale: [
        semanticInvalid.length > 0
          ? `${semanticInvalid.length} candidate cell(s) failed semantic validation`
          : null,
        blockingTrials.length > 0
          ? `${blockingTrials.length} trial(s) ended as tool_error or inconclusive`
          : null,
        corpusCaseCount < minimumCases
          ? `corpus case count ${corpusCaseCount} below frozen minimum ${minimumCases}`
          : null,
        results.matrixIncomplete ? 'matrix completeness check failed' : null,
      ].filter(Boolean),
    };
  }

  const ownMinimal = aggregates.candidates['own-minimal'];
  const ownIntervalLower = ownMinimal?.pairedReductionInterval?.lower;

  if (
    ownIntervalLower !== null &&
    ownIntervalLower !== undefined &&
    ownIntervalLower >= threshold
  ) {
    return {
      id: 'evidencia-justifica-engine-propria',
      rationale: [
        `own-minimal paired reduction interval lower bound ${ownIntervalLower.toFixed(2)} pp meets frozen threshold ${threshold} pp`,
      ],
    };
  }

  return {
    id: 'evidencia-favorece-alternativa-mais-simples',
    rationale: [
      `own-minimal interval lower bound ${ownIntervalLower ?? 'n/a'} pp does not meet frozen threshold ${threshold} pp`,
      'evidence does not justify a proprietary engine over the frozen OSS baseline path',
    ],
  };
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

export function generateOfficialReport(results) {
  const manifest = results.manifestSnapshot;
  const aggregates = results.aggregates;
  const conclusion = results.conclusion;
  const lines = [
    '# Official Matrix Report — js-condom polymorphism POC',
    '',
    `Experiment ID: ${results.experimentId}`,
    `Repository commit: ${manifest.repositoryCommit}`,
    `Generated at: ${results.generatedAt}`,
    '',
    '## Conclusion (AC17)',
    '',
    `- **Decision:** ${conclusion.id}`,
    ...conclusion.rationale.map((entry) => `- ${entry}`),
    '',
    '## Environment',
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...Object.entries(results.environment).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Matrix completeness',
    '',
    `- Expected cells: ${results.matrixCompleteness?.expectedCount ?? 'n/a'}`,
    `- Actual cells: ${results.matrixCompleteness?.actualCount ?? 'n/a'}`,
    `- Supported cases executed: ${results.supportedCaseCount ?? 'n/a'}`,
    '',
    '## Semantic coverage',
    '',
    `- Valid candidate cells: ${results.semanticCoverage?.validCandidateCells ?? 'n/a'}/${results.semanticCoverage?.totalCandidateCells ?? 'n/a'}`,
    '',
    '## Calibration',
    '',
  ];

  for (const entry of results.calibration?.pairs ?? []) {
    lines.push(
      `- ${entry.taskId} × ${entry.evaluatorId}: ${entry.valid ? 'valid' : 'invalid'}${entry.valid ? '' : ` (${entry.diagnostics.join('; ')})`}`,
    );
  }

  lines.push('', '## Primary endpoint — completion rate within budget', '');
  lines.push(`- Baseline completion rate: ${formatNumber(aggregates.baselineCompletionRate)}%`);
  for (const candidateId of ['oss-extension', 'own-minimal']) {
    const candidate = aggregates.candidates[candidateId];
    lines.push(`- ${candidateId} completion rate: ${formatNumber(candidate?.completionRate)}%`);
    lines.push(
      `- ${candidateId} reduction vs baseline: ${formatNumber(candidate?.reductionPercentagePoints)} pp`,
    );
    lines.push(
      `- ${candidateId} paired reduction interval: [${formatNumber(candidate?.pairedReductionInterval?.lower)}, ${formatNumber(candidate?.pairedReductionInterval?.upper)}] pp (mean ${formatNumber(candidate?.pairedReductionInterval?.mean)})`,
    );
    lines.push(`- ${candidateId} traceable trial pairs: ${candidate?.trialIds?.length ?? 0}`);
  }

  lines.push('', '## Secondary costs (completed trials)', '');
  lines.push(
    `- Wall-clock p50: ${formatNumber(aggregates.secondaryCosts?.wallClockMs?.p50)} ms`,
  );
  lines.push(
    `- Wall-clock p95: ${formatNumber(aggregates.secondaryCosts?.wallClockMs?.p95)} ms`,
  );
  lines.push(
    `- Traceable completed trials: ${aggregates.secondaryCosts?.trialIds?.length ?? 0}`,
  );

  lines.push('', '## Diversity, build time and runtime', '');
  const caseEntries = Object.values(aggregates.byCase ?? {});
  lines.push(`- Case-level metric rows: ${caseEntries.length}`);
  if (caseEntries.length > 0) {
    const buildTimes = caseEntries
      .map((entry) => entry.performance?.buildDurationMs ?? 0)
      .filter((value) => value > 0);
    lines.push(`- Build duration p95: ${formatNumber(percentile(buildTimes, 95))} ms`);
  }

  lines.push('', '## Category aggregates', '');
  for (const [category, entry] of Object.entries(aggregates.byCategory ?? {})) {
    lines.push(
      `- ${category}: completion rate ${formatNumber(entry.completionRate)}% (${entry.trialIds?.length ?? 0} trials)`,
    );
  }

  lines.push('', '## Blinding audit (AC12)', '');
  lines.push(
    `- Pre-evaluation mapping hash: ${results.blinding?.preEvaluation?.mappingArtifactHash ?? 'n/a'}`,
  );
  lines.push(
    `- Pre-evaluation evaluator view hash: ${results.blinding?.preEvaluation?.evaluatorViewHash ?? 'n/a'}`,
  );
  lines.push(
    `- Manifest mapping hash: ${manifest.blinding?.mappingArtifactHash ?? 'n/a'}`,
  );
  if (results.blinding?.manifestHashMismatch) {
    lines.push('- **Limitation:** manifest blinding hashes differ from official matrix pre-evaluation hashes');
  }
  lines.push(
    `- Mapping revealed after lock: ${results.blinding?.revealed ? 'yes' : 'no'}`,
  );

  lines.push('', '## Anti-LLM dimension (AC14)', '');
  lines.push(`- Status: ${results.antiLlm?.status ?? 'inconclusive'}`);
  lines.push(`- Summary: ${results.antiLlm?.summary ?? 'LLM evaluator not integrated into recovery harness'}`);

  lines.push('', '## Baseline OSS justification (AC20)', '');
  for (const entry of results.baselineJustification ?? []) {
    lines.push(`- ${entry}`);
  }

  lines.push('', '## Limitations', '');
  for (const limitation of results.limitations ?? []) {
    lines.push(`- ${limitation}`);
  }

  lines.push('');
  return lines.join('\n');
}

function assertSelfContained(results) {
  const serialized = JSON.stringify(results);
  if (/"path"\s*:|"fileRef"\s*:/.test(serialized)) {
    throw new OfficialMatrixError('results_not_self_contained', 'results.json must not reference external file paths');
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
  visit(results);

  for (const artifact of artifacts) {
    if (!verifyEmbeddedArtifact(artifact)) {
      throw new OfficialMatrixError('artifact_hash_mismatch', 'embedded artifact hash does not match content');
    }
  }
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
      trialId: trialKey(trial),
      caseId: cell?.caseId,
      subjectId: cell?.subjectId,
      seed: cell?.seed ?? null,
    };
  });
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

async function buildOfficialMatrix({ manifest, cases, experimentId, deps }) {
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

function buildBaselineJustification(manifest) {
  const obfuscator = manifest.tools?.find((tool) => tool.name === 'javascript-obfuscator');
  return [
    `${obfuscator?.name ?? 'javascript-obfuscator'} ${obfuscator?.version ?? '4.1.0'} is the frozen OSS baseline: AST transforms, canonical seed projection and reproducible config are already recorded in the official manifest.`,
    'js-confuser was excluded from the minimum matrix; OQ8 resolved — javascript-obfuscator is sufficient as OSS baseline for this round.',
    'No retrospective baseline swap was performed; any js-confuser comparison requires a separately approved round.',
  ];
}

async function evaluateAntiLlmDimension({
  manifest,
  blindingRegistry,
  cases,
  deps = {},
}) {
  const summaryUnavailable = (summary) => ({
    status: 'inconclusive',
    summary,
    trials: [],
  });

  try {
    const evaluatorConfig = await loadEvaluatorConfig(deps.llmConfigPath);
    const task = manifest.recoveryTasks.find((entry) => entry.id === 'task-explain-behavior');
    if (!task) {
      return summaryUnavailable('task-explain-behavior missing from manifest');
    }

    const budget = manifest.budgets.recovery.find((entry) => entry.id === 'budget-human-rubric');
    if (!budget) {
      return summaryUnavailable('budget-human-rubric missing from manifest');
    }

    const repetitions = manifest.sampling?.repetitionsByEvaluator?.['eval-human-rubric'] ?? 1;
    const trials = [];

    for (const entry of blindingRegistry.entries) {
      const caseEntry = cases.find((candidate) => candidate.caseId === entry.caseId);
      if (!caseEntry) {
        continue;
      }

      for (let trial = 1; trial <= repetitions; trial += 1) {
        const trialResult = await runLlmRecoveryTrial({
          manifest,
          caseEntry,
          task,
          evaluatorConfig,
          blindArtifactId: entry.blindArtifactId,
          sourceCode: entry.sourceCode,
          trial,
          evaluatorId: 'eval-llm',
          budget: {
            ...budget,
            maxPrompts: budget.maxPrompts ?? 3,
          },
          deps,
        });
        trials.push(trialResult);
      }
    }

    const runtimeUnavailable = trials.every(
      (trial) =>
        trial.outcome === 'inconclusive' &&
        trial.diagnostics?.some((entry) => entry.includes('llm_runtime_unavailable')),
    );
    if (runtimeUnavailable) {
      return summaryUnavailable('LLM runtime unavailable at evaluation time');
    }

    const completed = trials.filter((trial) => trial.outcome === 'completed').length;
    return {
      status: 'measured',
      summary: `LLM anti-recovery trials: ${completed}/${trials.length} completed within budget`,
      trials,
    };
  } catch (error) {
    return summaryUnavailable(error instanceof Error ? error.message : String(error));
  }
}

function buildLimitations(results, manifest) {
  const limitations = [
    'Six hazard cases (eval, with, function-tostring) are excluded from protection by reject-before-protection policy.',
  ];

  if (results.antiLlm?.status === 'inconclusive') {
    limitations.push(
      results.antiLlm.summary ??
        'Anti-LLM dimension inconclusive — local LLM runtime unavailable or not integrated.',
    );
  }

  if (results.blinding?.manifestHashMismatch) {
    limitations.push(
      'Manifest blinding hashes were copied from the pilot partition and do not match the official matrix pre-evaluation hashes.',
    );
  }

  const invalidCalibration = (results.calibration?.pairs ?? []).filter((entry) => !entry.valid);
  if (invalidCalibration.length > 0) {
    limitations.push(
      `${invalidCalibration.length} task/evaluator pair(s) failed control calibration and were excluded from resistance denominators.`,
    );
  }

  return limitations;
}

export async function runOfficialMatrix({
  manifestPath = join(REPO_ROOT, 'experiments/official/manifest.json'),
  manifest: inputManifest = null,
  rngSeed = 42,
  writeArtifacts = false,
  artifactPaths = {
    resultsJson: join(REPO_ROOT, 'experiments/official/results.json'),
    blindingMap: join(REPO_ROOT, 'experiments/official/blinding-map.json'),
    reportMd: join(REPO_ROOT, 'experiments/official/report.md'),
  },
  bundle: inputBundle = null,
  deps = {},
} = {}) {
  const loadedManifest = inputManifest
    ? (() => {
        const validation = validateManifest(inputManifest);
        if (!validation.valid) {
          throw new OfficialMatrixError('manifest_invalid', 'official manifest failed validation', {
            errors: validation.errors,
          });
        }
        if (inputManifest.phase !== 'official') {
          throw new OfficialMatrixError('manifest_invalid', 'manifest phase must be official', {
            phase: inputManifest.phase,
          });
        }
        return {
          manifest: inputManifest,
          snapshot: JSON.stringify(inputManifest),
        };
      })()
    : loadFrozenOfficialManifest(manifestPath);
  const { manifest, snapshot: manifestSnapshot } = loadedManifest;
  const loaded = inputBundle
    ? { bundle: inputBundle, valid: true }
    : loadAndValidateCorpus();

  if (!loaded.valid) {
    throw new OfficialMatrixError('corpus_invalid', 'corpus validation failed', { errors: loaded.errors });
  }

  const bundle = loaded.bundle;
  const environment = deps.environment ?? captureEnvironment();
  const cases = resolveOfficialCases(bundle, manifest);
  const supportedCases = cases.filter((entry) => entry.supported !== false);

  verifySampleSize(manifest, cases, 'official');
  verifySliceConformance({
    protectOssExtensionFn: deps.protectOssExtension,
    protectOwnMinimalFn: deps.protectOwnMinimal,
  });
  verifyEnvironmentCompatibility(manifest, environment);

  const experimentId = manifest.experimentId;
  const resolvedDeps = {
    protectCandidate: deps.protectCandidate ?? protectCandidate,
    webcrack: deps.webcrack,
    runRecoveryTrial: deps.runRecoveryTrial ?? runRecoveryTrial,
    now: deps.now,
  };

  const { cells, caseResults } = await buildOfficialMatrix({
    manifest,
    cases,
    experimentId,
    deps: resolvedDeps,
  });

  const matrixCompleteness = verifyMatrixCompleteness(manifest, cells, cases);

  const calibration = await calibrateRecoveryPairs({
    manifest,
    cases: supportedCases,
    getControlSource: (caseEntry) => caseEntry.source,
    deps: resolvedDeps,
  });

  const rng = createSeededRng(rngSeed);
  const preRegistryArtifacts = cells.map((cell) => ({
    caseId: cell.caseId,
    subjectId: cell.subjectId,
    seed: cell.seed ?? null,
    sourceCode: cell.sourceCode,
    recoveryTaskIds:
      supportedCases.find((entry) => entry.caseId === cell.caseId)?.recoveryTaskIds ?? [],
  }));

  const preRegistry = createBlindingRegistry({
    artifacts: preRegistryArtifacts,
    randomizeOrder: manifest.blinding.randomizeEvaluationOrder,
    rng,
  });
  const preMapping = buildMappingArtifact(preRegistry);
  const preEvaluatorView = buildEvaluatorView(preRegistry, manifest.recoveryTasks);
  const manifestHashMismatch =
    preMapping.hash !== manifest.blinding.mappingArtifactHash ||
    preEvaluatorView.hash !== manifest.blinding.evaluatorViewHash;

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

  assertManifestImmutable(manifestSnapshot, manifest);

  const revealedMapping = revealMapping(recoveryResult.blinding.registry);

  const recoveryTrials = enrichRecoveryTrials(recoveryResult);
  const performanceSamples = buildPerformanceSamples(caseResults, recoveryTrials);

  const semanticValid = caseResults.filter(
    (entry) => entry.subjectId !== 'unprotected-control' && entry.status === 'valid',
  ).length;
  const semanticTotal = caseResults.filter((entry) => entry.subjectId !== 'unprotected-control').length;

  const antiLlm = await evaluateAntiLlmDimension({
    manifest,
    blindingRegistry: preRegistry,
    cases: supportedCases,
    deps: {
      llmConfigPath: join(REPO_ROOT, 'experiments/llm/evaluator.json'),
      chat: deps.chat,
      now: deps.now,
    },
  });

  const results = {
    schemaVersion: 1,
    experimentId,
    phase: 'official',
    generatedAt: new Date().toISOString(),
    environment,
    manifestSnapshot: manifest,
    matrixCompleteness,
    supportedCaseCount: supportedCases.length,
    cells: cells.map((cell) => ({
      ...cell,
      sourceHash: hashSource(cell.sourceCode),
      sourceArtifact: createEmbeddedArtifact(cell.sourceCode),
      configArtifact: cell.configArtifact ?? undefined,
    })),
    caseResults,
    calibration,
    recovery: {
      ...recoveryResult,
      trials: recoveryTrials,
    },
    performanceSamples,
    blinding: {
      preEvaluation: {
        mappingArtifactHash: preMapping.hash,
        evaluatorViewHash: preEvaluatorView.hash,
        revealed: false,
      },
      revealed: {
        mappingArtifactHash: revealedMapping.hash,
        mapping: revealedMapping.mapping,
        revealedAt: new Date().toISOString(),
      },
      manifestHashMismatch,
    },
    antiLlm,
    semanticCoverage: {
      validCandidateCells: semanticValid,
      totalCandidateCells: semanticTotal,
    },
  };

  results.aggregates = computeResistanceAggregates(results, manifest);
  results.conclusion = deriveConclusion(results, results.aggregates, manifest);
  results.baselineJustification = buildBaselineJustification(manifest);
  results.limitations = buildLimitations(results, manifest);

  if (!AC17_CONCLUSIONS.includes(results.conclusion.id)) {
    throw new OfficialMatrixError('invalid_conclusion', 'conclusion must be one of AC17 options', {
      conclusion: results.conclusion.id,
    });
  }

  assertSelfContained(results);

  const report = generateOfficialReport(results);

  if (writeArtifacts) {
    await mkdir(dirname(artifactPaths.resultsJson), { recursive: true });
    await writeFile(artifactPaths.resultsJson, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    await writeFile(
      artifactPaths.blindingMap,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          experimentId,
          revealedAt: results.blinding.revealed.revealedAt,
          mappingArtifactHash: results.blinding.revealed.mappingArtifactHash,
          mapping: results.blinding.revealed.mapping,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await writeFile(artifactPaths.reportMd, report, 'utf8');
  }

  return { results, report };
}
