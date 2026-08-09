import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'experiment-manifest.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

const REQUIRED_CANDIDATE_IDS = ['oss-baseline', 'oss-extension', 'own-minimal'];
const CUSTOM_CANDIDATE_IDS = ['oss-extension', 'own-minimal'];
const ENVIRONMENT_FIELDS = ['os', 'architecture', 'cpu', 'memoryBytes', 'nodeVersion'];
const EXACT_MATCH_FIELDS = ['os', 'architecture', 'nodeVersion'];
const INFORMATIVE_FIELDS = ['cpu', 'memoryBytes'];

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function setsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function validateEnvironmentCompatibility(manifest, errors) {
  const { environmentCompatibility } = manifest;
  const exact = environmentCompatibility.exactMatchFields;
  const informative = environmentCompatibility.informativeFields;

  if (!setsEqual([...exact].sort(), [...EXACT_MATCH_FIELDS].sort())) {
    pushError(
      errors,
      '/environmentCompatibility/exactMatchFields',
      'exactMatchFields must contain exactly os, architecture, and nodeVersion',
    );
  }

  if (!setsEqual([...informative].sort(), [...INFORMATIVE_FIELDS].sort())) {
    pushError(
      errors,
      '/environmentCompatibility/informativeFields',
      'informativeFields must contain exactly cpu and memoryBytes',
    );
  }

  const exactSet = new Set(exact);
  const overlap = informative.filter((field) => exactSet.has(field));
  if (overlap.length > 0) {
    pushError(
      errors,
      '/environmentCompatibility',
      `exactMatchFields and informativeFields must be disjoint; overlap: ${overlap.join(', ')}`,
    );
  }

  const classified = new Set([...exact, ...informative]);
  const unclassified = ENVIRONMENT_FIELDS.filter((field) => !classified.has(field));
  if (unclassified.length > 0) {
    pushError(
      errors,
      '/environmentCompatibility',
      `environment fields must be fully classified; missing: ${unclassified.join(', ')}`,
    );
  }

  const extra = [...classified].filter((field) => !ENVIRONMENT_FIELDS.includes(field));
  if (extra.length > 0) {
    pushError(
      errors,
      '/environmentCompatibility',
      `unknown environment field classification: ${extra.join(', ')}`,
    );
  }
}

function validateCandidates(manifest, errors) {
  const { candidates } = manifest;
  const ids = candidates.map((candidate) => candidate.id);

  if (candidates.length !== REQUIRED_CANDIDATE_IDS.length) {
    pushError(
      errors,
      '/candidates',
      `candidates must contain exactly ${REQUIRED_CANDIDATE_IDS.length} architectural arms`,
    );
  }

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    pushError(errors, '/candidates', 'candidate ids must be unique');
  }

  for (const requiredId of REQUIRED_CANDIDATE_IDS) {
    if (!uniqueIds.has(requiredId)) {
      pushError(errors, '/candidates', `missing required candidate id: ${requiredId}`);
    }
  }

  if (uniqueIds.has('unprotected-control')) {
    pushError(
      errors,
      '/candidates',
      'unprotected-control is a calibration arm and must not appear in candidates',
    );
  }
}

function validateTransformationSlice(manifest, errors) {
  const { transformationSlice, candidates } = manifest;
  const appliesTo = transformationSlice.appliesTo;

  if (!setsEqual([...appliesTo].sort(), [...CUSTOM_CANDIDATE_IDS].sort())) {
    pushError(
      errors,
      '/transformationSlice/appliesTo',
      'appliesTo must contain exactly oss-extension and own-minimal',
    );
  }

  const allowlist = new Set(transformationSlice.allowedAuxiliaryTransforms);
  const sliceInputStageId = transformationSlice.inputStageId;

  for (const candidateId of CUSTOM_CANDIDATE_IDS) {
    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) {
      continue;
    }

    if (candidate.inputStageId !== sliceInputStageId) {
      pushError(
        errors,
        `/candidates/${candidateId}/inputStageId`,
        `inputStageId must match transformationSlice.inputStageId (${sliceInputStageId})`,
      );
    }

    for (const transform of candidate.auxiliaryTransforms) {
      if (!allowlist.has(transform)) {
        pushError(
          errors,
          `/candidates/${candidateId}/auxiliaryTransforms`,
          `auxiliary transform "${transform}" is not listed in transformationSlice.allowedAuxiliaryTransforms`,
        );
      }
    }
  }
}

function validateSampling(manifest, errors) {
  const { sampling, seeds, evaluators, budgets } = manifest;

  if (sampling.seedsPerCase !== seeds.length) {
    pushError(
      errors,
      '/sampling/seedsPerCase',
      `seedsPerCase (${sampling.seedsPerCase}) must equal seeds.length (${seeds.length})`,
    );
  }

  const evaluatorIds = new Set(evaluators.map((evaluator) => evaluator.id));
  const budgetEvaluatorIds = new Set(budgets.recovery.map((budget) => budget.evaluatorId));

  for (const evaluatorId of Object.keys(sampling.repetitionsByEvaluator)) {
    if (!evaluatorIds.has(evaluatorId)) {
      pushError(
        errors,
        `/sampling/repetitionsByEvaluator/${evaluatorId}`,
        `unknown evaluator id: ${evaluatorId}`,
      );
    }

    if (!budgetEvaluatorIds.has(evaluatorId)) {
      pushError(
        errors,
        `/sampling/repetitionsByEvaluator/${evaluatorId}`,
        `evaluator "${evaluatorId}" has no matching budgets.recovery entry`,
      );
    }
  }
}

function validateDecisionRule(manifest, errors) {
  const { phase, decisionRule } = manifest;
  const { threshold } = decisionRule;

  if (phase === 'official') {
    if (threshold.status !== 'frozen') {
      pushError(
        errors,
        '/decisionRule/threshold',
        'official phase requires a frozen threshold; pending-pilot is not allowed',
      );
      return;
    }

    if (threshold.minimumReductionPercentagePoints <= 0) {
      pushError(
        errors,
        '/decisionRule/threshold/minimumReductionPercentagePoints',
        'official phase requires minimumReductionPercentagePoints greater than zero',
      );
    }
  }
}

function validateReferences(manifest, errors) {
  const taskIds = new Set(manifest.recoveryTasks.map((task) => task.id));
  const evaluatorIds = new Set(manifest.evaluators.map((evaluator) => evaluator.id));
  const budgetIds = new Set(manifest.budgets.recovery.map((budget) => budget.id));

  manifest.corpus.forEach((entry, index) => {
    entry.recoveryTaskIds.forEach((taskId) => {
      if (!taskIds.has(taskId)) {
        pushError(
          errors,
          `/corpus/${index}/recoveryTaskIds`,
          `unknown recovery task id: ${taskId}`,
        );
      }
    });
  });

  manifest.recoveryTasks.forEach((task, index) => {
    task.evaluatorIds.forEach((evaluatorId) => {
      if (!evaluatorIds.has(evaluatorId)) {
        pushError(
          errors,
          `/recoveryTasks/${index}/evaluatorIds`,
          `unknown evaluator id: ${evaluatorId}`,
        );
      }
    });

    if (!budgetIds.has(task.budgetId)) {
      pushError(
        errors,
        `/recoveryTasks/${index}/budgetId`,
        `unknown budget id: ${task.budgetId}`,
      );
    }
  });

  manifest.budgets.recovery.forEach((budget, index) => {
    if (!evaluatorIds.has(budget.evaluatorId)) {
      pushError(
        errors,
        `/budgets/recovery/${index}/evaluatorId`,
        `unknown evaluator id: ${budget.evaluatorId}`,
      );
    }
  });
}

function validateCrossInvariants(manifest) {
  const errors = [];

  validateEnvironmentCompatibility(manifest, errors);
  validateCandidates(manifest, errors);
  validateTransformationSlice(manifest, errors);
  validateSampling(manifest, errors);
  validateDecisionRule(manifest, errors);
  validateReferences(manifest, errors);

  return errors;
}

function formatSchemaErrors(ajvErrors) {
  return ajvErrors.map((error) => {
    const path = error.instancePath || '/';
    const detail = error.message ?? 'schema validation failed';
    return { path, message: detail };
  });
}

export function validateManifest(manifest) {
  const errors = [];

  const schemaValid = validateSchema(manifest);
  if (!schemaValid && validateSchema.errors) {
    errors.push(...formatSchemaErrors(validateSchema.errors));
  }

  if (schemaValid) {
    errors.push(...validateCrossInvariants(manifest));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function readInput(source) {
  if (source === '-') {
    return readFileSync(0, 'utf8');
  }

  return readFileSync(source, 'utf8');
}

function runCli() {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage: validate-manifest <manifest.json|-');
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(readInput(source));
  } catch (error) {
    console.error(`Failed to parse manifest JSON: ${error.message}`);
    process.exit(1);
  }

  const result = validateManifest(manifest);
  if (!result.valid) {
    for (const error of result.errors) {
      console.error(`${error.path}: ${error.message}`);
    }
    process.exit(1);
  }

  console.log('Manifest is valid.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli();
}
