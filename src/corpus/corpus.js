import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS_DIR = join(__dirname, '../../corpus');

export const REQUIRED_CATEGORIES = [
  'closures',
  'classes',
  'async-promises',
  'generators',
  'exceptions',
  'modules-bundle',
  'strings-literals',
  'control-flow',
  'eval',
  'with',
  'function-tostring',
];

export const HAZARD_CATEGORIES = new Set(['eval', 'with', 'function-tostring']);

export const ALLOWED_ORIGINS = ['synthetic', 'open-source-mit'];

const OQ2_DECISION = {
  owner: '@andersonalves',
  decidedAt: '2026-08-09',
  allowedOrigins: ALLOWED_ORIGINS,
  partitionsDisjoint: true,
  minimumTotalCases: 33,
  partitionPolicy: {
    pilot: {
      minimumTotalCases: 11,
      minimumCasesPerCategory: 1,
    },
    official: {
      minimumTotalCases: 22,
      minimumCasesPerCategory: 2,
    },
  },
  minimumCasesPerCategory: Object.fromEntries(REQUIRED_CATEGORIES.map((category) => [category, 1])),
};

function pushError(errors, path, message) {
  errors.push({ path, message });
}

export function hashSource(source) {
  const digest = createHash('sha256').update(source, 'utf8').digest('hex');
  return `sha256-${digest}`;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function loadCorpus({ corpusDir = DEFAULT_CORPUS_DIR } = {}) {
  return {
    pilot: readJsonFile(join(corpusDir, 'pilot-cases.json')),
    official: readJsonFile(join(corpusDir, 'official-cases.json')),
    recoveryTasks: readJsonFile(join(corpusDir, 'recovery-tasks.json')),
  };
}

function validateOq2Decision(partitionName, partitionFile, errors) {
  const { oq2Decision } = partitionFile;
  if (!oq2Decision) {
    pushError(errors, `/${partitionName}/oq2Decision`, 'missing OQ2 decision metadata');
    return;
  }

  const serialized = JSON.stringify(oq2Decision);
  const canonical = JSON.stringify(OQ2_DECISION);
  if (serialized !== canonical) {
    pushError(
      errors,
      `/${partitionName}/oq2Decision`,
      'OQ2 decision must match the approved corpus policy',
    );
  }
}

function validateCaseSourceHash(caseEntry, partitionName, index, errors) {
  const actualHash = hashSource(caseEntry.source);
  if (caseEntry.sourceHash !== actualHash) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/sourceHash`,
      `sourceHash mismatch; expected ${actualHash}`,
    );
  }
}

function validateCaseOrigin(caseEntry, partitionName, index, errors) {
  if (!ALLOWED_ORIGINS.includes(caseEntry.origin)) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/origin`,
      `origin must be one of: ${ALLOWED_ORIGINS.join(', ')}`,
    );
  }
}

function validateSupportedCase(caseEntry, partitionName, index, errors) {
  if (!caseEntry.semanticOracle?.id) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/semanticOracle`,
      'supported cases require a semantic oracle id',
    );
  }

  if (!caseEntry.semanticOracle?.mode) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/semanticOracle/mode`,
      'supported cases require a semantic oracle mode',
    );
  }

  if (!caseEntry.expectedBehaviorId) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/expectedBehaviorId`,
      'supported cases require expectedBehaviorId',
    );
  }

  if (!Array.isArray(caseEntry.recoveryTaskIds) || caseEntry.recoveryTaskIds.length === 0) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/recoveryTaskIds`,
      'supported cases require at least one recovery task reference',
    );
  }
}

function validateUnsupportedCase(caseEntry, partitionName, index, errors) {
  if (!caseEntry.exclusionJustification) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/exclusionJustification`,
      'unsupported cases require exclusion justification',
    );
  }

  if (!caseEntry.expectedPolicy?.kind) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/expectedPolicy`,
      'unsupported cases require expectedPolicy.kind',
    );
  }

  if (!caseEntry.expectedPolicy?.hazard) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/expectedPolicy/hazard`,
      'unsupported cases require expectedPolicy.hazard',
    );
  }
}

function validateHazardCategory(caseEntry, partitionName, index, errors) {
  if (!HAZARD_CATEGORIES.has(caseEntry.category)) {
    return;
  }

  if (caseEntry.supported !== false) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/supported`,
      `category ${caseEntry.category} must be marked unsupported with an expected policy`,
    );
  }

  if (!caseEntry.expectedPolicy?.expectedOutcome) {
    pushError(
      errors,
      `/${partitionName}/cases/${index}/expectedPolicy/expectedOutcome`,
      'hazard categories require expectedPolicy.expectedOutcome',
    );
  }
}

function validatePartitionCases(partitionName, partitionFile, taskIds, errors) {
  const cases = partitionFile.cases ?? [];
  const policy = OQ2_DECISION.partitionPolicy[partitionName];
  const countsByCategory = Object.fromEntries(REQUIRED_CATEGORIES.map((category) => [category, 0]));
  const seenCaseIds = new Set();

  if (cases.length < policy.minimumTotalCases) {
    pushError(
      errors,
      `/${partitionName}/cases`,
      `expected at least ${policy.minimumTotalCases} cases, found ${cases.length}`,
    );
  }

  cases.forEach((caseEntry, index) => {
    if (!caseEntry.caseId) {
      pushError(errors, `/${partitionName}/cases/${index}/caseId`, 'caseId is required');
      return;
    }

    if (seenCaseIds.has(caseEntry.caseId)) {
      pushError(
        errors,
        `/${partitionName}/cases/${index}/caseId`,
        `duplicate caseId within partition: ${caseEntry.caseId}`,
      );
    }
    seenCaseIds.add(caseEntry.caseId);

    if (!REQUIRED_CATEGORIES.includes(caseEntry.category)) {
      pushError(
        errors,
        `/${partitionName}/cases/${index}/category`,
        `unknown category: ${caseEntry.category}`,
      );
    } else {
      countsByCategory[caseEntry.category] += 1;
    }

    if (!caseEntry.source) {
      pushError(errors, `/${partitionName}/cases/${index}/source`, 'source is required');
    } else {
      validateCaseSourceHash(caseEntry, partitionName, index, errors);
    }

    validateCaseOrigin(caseEntry, partitionName, index, errors);
    validateHazardCategory(caseEntry, partitionName, index, errors);

    if (caseEntry.supported === false) {
      validateUnsupportedCase(caseEntry, partitionName, index, errors);
    } else {
      validateSupportedCase(caseEntry, partitionName, index, errors);
      caseEntry.recoveryTaskIds?.forEach((taskId) => {
        if (!taskIds.has(taskId)) {
          pushError(
            errors,
            `/${partitionName}/cases/${index}/recoveryTaskIds`,
            `unknown recovery task id: ${taskId}`,
          );
        }
      });
    }
  });

  for (const category of REQUIRED_CATEGORIES) {
    if (countsByCategory[category] < policy.minimumCasesPerCategory) {
      pushError(
        errors,
        `/${partitionName}/cases`,
        `category ${category} requires at least ${policy.minimumCasesPerCategory} case(s), found ${countsByCategory[category]}`,
      );
    }
  }
}

function validateRecoveryTasks(recoveryTasks, errors) {
  const evaluatorIds = new Set(recoveryTasks.evaluators?.map((entry) => entry.id) ?? []);
  const budgetIds = new Set(recoveryTasks.budgets?.map((entry) => entry.id) ?? []);
  const oracleIds = new Set(recoveryTasks.completionOracles?.map((entry) => entry.id) ?? []);
  const taskIds = new Set();

  recoveryTasks.tasks?.forEach((task, index) => {
    if (!task.id) {
      pushError(errors, `/recoveryTasks/tasks/${index}/id`, 'task id is required');
      return;
    }

    taskIds.add(task.id);

    if (!task.objective) {
      pushError(errors, `/recoveryTasks/tasks/${index}/objective`, 'objective is required');
    }

    if (!task.budgetId || !budgetIds.has(task.budgetId)) {
      pushError(errors, `/recoveryTasks/tasks/${index}/budgetId`, `unknown budget id: ${task.budgetId}`);
    }

    if (!task.oracleId || !oracleIds.has(task.oracleId)) {
      pushError(errors, `/recoveryTasks/tasks/${index}/oracleId`, `unknown oracle id: ${task.oracleId}`);
    }

    if (!Array.isArray(task.evaluatorIds) || task.evaluatorIds.length === 0) {
      pushError(
        errors,
        `/recoveryTasks/tasks/${index}/evaluatorIds`,
        'tasks require at least one evaluator id',
      );
    } else {
      task.evaluatorIds.forEach((evaluatorId) => {
        if (!evaluatorIds.has(evaluatorId)) {
          pushError(
            errors,
            `/recoveryTasks/tasks/${index}/evaluatorIds`,
            `unknown evaluator id: ${evaluatorId}`,
          );
        }
      });
    }
  });

  recoveryTasks.budgets?.forEach((budget, index) => {
    if (!evaluatorIds.has(budget.evaluatorId)) {
      pushError(
        errors,
        `/recoveryTasks/budgets/${index}/evaluatorId`,
        `unknown evaluator id: ${budget.evaluatorId}`,
      );
    }
  });

  recoveryTasks.completionOracles?.forEach((oracle, index) => {
    if (oracle.mode === 'human-rubric' && !oracle.rubric) {
      pushError(
        errors,
        `/recoveryTasks/completionOracles/${index}/rubric`,
        'human-rubric oracles require a rubric',
      );
    }
  });

  return taskIds;
}

export function validateCorpus(bundle) {
  const errors = [];

  validateOq2Decision('pilot', bundle.pilot, errors);
  validateOq2Decision('official', bundle.official, errors);

  const taskIds = validateRecoveryTasks(bundle.recoveryTasks, errors);
  validatePartitionCases('pilot', bundle.pilot, taskIds, errors);
  validatePartitionCases('official', bundle.official, taskIds, errors);

  const pilotIds = new Set(bundle.pilot.cases?.map((entry) => entry.caseId) ?? []);
  const officialIds = bundle.official.cases?.map((entry) => entry.caseId) ?? [];
  const overlap = officialIds.filter((caseId) => pilotIds.has(caseId));
  if (overlap.length > 0) {
    pushError(
      errors,
      '/partitions',
      `pilot and official partitions must be disjoint; overlap: ${overlap.join(', ')}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function loadAndValidateCorpus(options = {}) {
  const bundle = loadCorpus(options);
  const result = validateCorpus(bundle);
  return { bundle, ...result };
}

export function getOq2Decision() {
  return structuredClone(OQ2_DECISION);
}
