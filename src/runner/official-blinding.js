import {
  buildEvaluatorView,
  buildMappingArtifact,
  createBlindingRegistry,
  createSeededRng,
} from '../recovery/blinding.js';

const CANDIDATE_SUBJECTS = ['oss-baseline', 'oss-extension', 'own-minimal'];

export function buildOfficialBlindingArtifacts({ manifest, cases, protectCandidate }) {
  const artifacts = [];

  for (const caseEntry of cases.filter((entry) => entry.supported !== false)) {
    artifacts.push({
      caseId: caseEntry.caseId,
      subjectId: 'unprotected-control',
      seed: null,
      sourceCode: caseEntry.source,
      recoveryTaskIds: caseEntry.recoveryTaskIds ?? [],
    });

    for (const subjectId of CANDIDATE_SUBJECTS) {
      for (const seed of manifest.seeds) {
        const protectedResult = protectCandidate(subjectId, caseEntry.source, seed);
        artifacts.push({
          caseId: caseEntry.caseId,
          subjectId,
          seed,
          sourceCode: protectedResult.code,
          recoveryTaskIds: caseEntry.recoveryTaskIds ?? [],
        });
      }
    }
  }

  return artifacts;
}

export function computeOfficialBlindingHashes({
  manifest,
  cases,
  protectCandidate,
  rngSeed = 42,
}) {
  const artifacts = buildOfficialBlindingArtifacts({ manifest, cases, protectCandidate });
  const rng = createSeededRng(rngSeed);
  const registry = createBlindingRegistry({
    artifacts,
    randomizeOrder: manifest.blinding?.randomizeEvaluationOrder ?? true,
    rng,
  });

  return {
    mappingArtifactHash: buildMappingArtifact(registry).hash,
    evaluatorViewHash: buildEvaluatorView(registry, manifest.recoveryTasks).hash,
  };
}
