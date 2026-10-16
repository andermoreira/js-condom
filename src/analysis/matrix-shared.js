/**
 * @fileoverview Building blocks shared by the pilot and the official matrix runs.
 */

import { protect as protectOssBaseline } from '../candidates/oss-baseline.js';
import { protect as protectOssExtension } from '../candidates/oss-extension.js';
import { protect as protectOwnMinimal } from '../candidates/own-minimal.js';
import { attachDiversityToCaseResults } from '../diversity/diversity-runner.js';
import { protectWithExportPreservation } from '../runner/esm-export-preserver.js';
import {
  compareSemanticSubjects,
  createEmbeddedArtifact,
  runSubjectSemanticCase,
  verifyEmbeddedArtifact,
} from '../runner/semantic-runner.js';

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

export const CANDIDATE_SUBJECTS = ['oss-baseline', 'oss-extension', 'own-minimal'];

export class PilotError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PilotError';
    this.code = code;
    this.details = details;
  }
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
    throw new PilotError('invalid_subject', `unsupported candidate subject: ${subjectId}`);
  };

  const result = protectWithExportPreservation(sourceCode, runProtection);

  return {
    ...result,
    buildDurationMs: Date.now() - startedAt,
  };
}

export function cellKey(caseId, subjectId, seed) {
  return `${caseId}:${subjectId}:${seed ?? 'null'}`;
}

export async function buildMatrix({
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

export function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function completionRate(trials) {
  const eligible = trials.filter((trial) =>
    ['completed', 'failed', 'timeout'].includes(trial.outcome),
  );
  if (eligible.length === 0) {
    return null;
  }
  const completed = eligible.filter((trial) => trial.outcome === 'completed').length;
  return (completed / eligible.length) * 100;
}

export function formatNumber(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

export function buildPerformanceSamples(caseResults, recoveryTrials) {
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

export function enrichRecoveryTrials(recoveryResult) {
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

/**
 * Rejects outputs that reference external files or embed artifacts whose hash does not match.
 *
 * @param {unknown} value - Run or results object about to be persisted.
 * @param {{ code: string, fileName: string }} target - Error code and file name used in the message.
 */
export function assertSelfContained(value, { code, fileName }) {
  const serialized = JSON.stringify(value);
  if (/"path"\s*:|"fileRef"\s*:/.test(serialized)) {
    throw new PilotError(code, `${fileName} must not reference external file paths`);
  }

  const artifacts = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.sha256 && node.content && node.encoding) {
      artifacts.push(node);
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(value);

  for (const artifact of artifacts) {
    if (!verifyEmbeddedArtifact(artifact)) {
      throw new PilotError('artifact_hash_mismatch', 'embedded artifact hash does not match content');
    }
  }
}
