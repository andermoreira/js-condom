import {
  computeAstSimilarity,
  computeTokenSimilarity,
  formatMetricId,
} from './similarity.js';

const CANDIDATE_SUBJECTS = new Set(['oss-baseline', 'oss-extension', 'own-minimal']);

export class DiversityRunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DiversityRunnerError';
    this.code = code;
    this.details = details;
  }
}

function assertManifestSeeds(manifest, seeds) {
  const manifestSeeds = manifest.seeds ?? [];
  const manifestSeedSet = new Set(manifestSeeds);

  for (const seed of seeds) {
    if (!manifestSeedSet.has(seed)) {
      throw new DiversityRunnerError('missing_manifest_seed', `seed is not declared in manifest: ${seed}`, {
        seed,
      });
    }
  }

  if (manifest.sampling?.seedsPerCase !== undefined && seeds.length !== manifest.sampling.seedsPerCase) {
    throw new DiversityRunnerError(
      'missing_manifest_seed',
      `expected ${manifest.sampling.seedsPerCase} manifest seeds but received ${seeds.length}`,
      {
        expected: manifest.sampling.seedsPerCase,
        received: seeds.length,
      },
    );
  }
}

function assertComparisonScope({ caseId, subjectId, groupCaseId, groupSubjectId }) {
  if (caseId !== groupCaseId || subjectId !== groupSubjectId) {
    throw new DiversityRunnerError(
      'cross_scope_comparison',
      'diversity comparisons must stay within the same case and candidate',
      {
        caseId,
        subjectId,
        groupCaseId,
        groupSubjectId,
      },
    );
  }
}

export function enumerateUnorderedSeedPairs(seeds) {
  const sortedSeeds = [...seeds].sort();
  const pairs = [];

  for (let index = 0; index < sortedSeeds.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < sortedSeeds.length; otherIndex += 1) {
      pairs.push({
        baseSeed: sortedSeeds[index],
        comparisonSeed: sortedSeeds[otherIndex],
      });
    }
  }

  return pairs;
}

export function computePairDiversity({
  manifest,
  baseSeed,
  comparisonSeed,
  baseSource,
  comparisonSource,
}) {
  const tokenMetric = manifest.diversityMetrics.token;
  const astMetric = manifest.diversityMetrics.ast;

  return {
    comparisonSeed,
    tokenMetricId: formatMetricId(tokenMetric),
    astMetricId: formatMetricId(astMetric),
    normalizedTokenSimilarity: computeTokenSimilarity(baseSource, comparisonSource, tokenMetric),
    normalizedAstSimilarity: computeAstSimilarity(baseSource, comparisonSource, astMetric),
  };
}

export function runDiversityForGroup({
  manifest,
  caseId,
  subjectId,
  seedSources,
  groupCaseId = caseId,
  groupSubjectId = subjectId,
}) {
  if (!CANDIDATE_SUBJECTS.has(subjectId)) {
    return new Map();
  }

  assertComparisonScope({ caseId, subjectId, groupCaseId, groupSubjectId });

  const seeds = [...seedSources.keys()].sort();
  assertManifestSeeds(manifest, seeds);

  for (const seed of seeds) {
    if (!seedSources.has(seed) || seedSources.get(seed) === undefined) {
      throw new DiversityRunnerError('missing_seed_source', `missing source for seed: ${seed}`, {
        caseId,
        subjectId,
        seed,
      });
    }
  }

  const diversityBySeed = new Map(seeds.map((seed) => [seed, []]));

  for (const { baseSeed, comparisonSeed } of enumerateUnorderedSeedPairs(seeds)) {
    const comparison = computePairDiversity({
      manifest,
      baseSeed,
      comparisonSeed,
      baseSource: seedSources.get(baseSeed),
      comparisonSource: seedSources.get(comparisonSeed),
    });

    diversityBySeed.get(baseSeed).push(comparison);
  }

  return diversityBySeed;
}

export function attachDiversityToCaseResults({ manifest, caseResults, getSource }) {
  const groupedSources = new Map();

  for (const caseResult of caseResults) {
    if (!CANDIDATE_SUBJECTS.has(caseResult.subjectId) || caseResult.seed === null) {
      continue;
    }

    const groupKey = `${caseResult.caseId}:${caseResult.subjectId}`;
    if (!groupedSources.has(groupKey)) {
      groupedSources.set(groupKey, {
        caseId: caseResult.caseId,
        subjectId: caseResult.subjectId,
        seedSources: new Map(),
      });
    }

    const group = groupedSources.get(groupKey);
    const source = getSource(caseResult.caseId, caseResult.subjectId, caseResult.seed);
    if (source === undefined) {
      throw new DiversityRunnerError('missing_seed_source', `missing source for seed: ${caseResult.seed}`, {
        caseId: caseResult.caseId,
        subjectId: caseResult.subjectId,
        seed: caseResult.seed,
      });
    }

    group.seedSources.set(caseResult.seed, source);
  }

  const diversityByCaseResultKey = new Map();

  for (const group of groupedSources.values()) {
    const diversityBySeed = runDiversityForGroup({
      manifest,
      caseId: group.caseId,
      subjectId: group.subjectId,
      seedSources: group.seedSources,
    });

    for (const [seed, diversity] of diversityBySeed.entries()) {
      diversityByCaseResultKey.set(`${group.caseId}:${group.subjectId}:${seed}`, diversity);
    }
  }

  return caseResults.map((caseResult) => {
    if (!CANDIDATE_SUBJECTS.has(caseResult.subjectId) || caseResult.seed === null) {
      return caseResult;
    }

    const diversity = diversityByCaseResultKey.get(
      `${caseResult.caseId}:${caseResult.subjectId}:${caseResult.seed}`,
    );

    return {
      ...caseResult,
      diversity: diversity ?? [],
    };
  });
}
