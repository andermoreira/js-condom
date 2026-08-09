import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOWED_ORIGINS,
  HAZARD_CATEGORIES,
  REQUIRED_CATEGORIES,
  getOq2Decision,
  hashSource,
  loadAndValidateCorpus,
  loadCorpus,
  validateCorpus,
} from '../../src/corpus/corpus.js';

test('loads and validates the versioned corpus bundle', () => {
  const result = loadAndValidateCorpus();
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.bundle.pilot.cases.length, 11);
  assert.equal(result.bundle.official.cases.length, 22);
});

test('records the approved OQ2 decision without placeholders', () => {
  const decision = getOq2Decision();
  assert.equal(decision.owner, '@andersonalves');
  assert.equal(decision.minimumTotalCases, 33);
  assert.equal(decision.partitionPolicy.pilot.minimumTotalCases, 11);
  assert.equal(decision.partitionPolicy.official.minimumTotalCases, 22);
  assert.equal(decision.partitionPolicy.pilot.minimumCasesPerCategory, 1);
  assert.equal(decision.partitionPolicy.official.minimumCasesPerCategory, 2);
  assert.deepEqual(decision.allowedOrigins, ALLOWED_ORIGINS);
  assert.equal(decision.partitionsDisjoint, true);
});

test('covers every required category in both partitions', () => {
  const { bundle } = loadAndValidateCorpus();

  for (const partitionName of ['pilot', 'official']) {
    const categories = new Set(bundle[partitionName].cases.map((entry) => entry.category));
    assert.deepEqual([...categories].sort(), [...REQUIRED_CATEGORIES].sort());
  }
});

test('keeps pilot and official case ids disjoint', () => {
  const bundle = loadCorpus();
  const pilotIds = new Set(bundle.pilot.cases.map((entry) => entry.caseId));
  const overlap = bundle.official.cases
    .map((entry) => entry.caseId)
    .filter((caseId) => pilotIds.has(caseId));

  assert.deepEqual(overlap, []);
});

test('requires semantic oracles for supported cases and policies for hazards', () => {
  const bundle = loadCorpus();
  const allCases = [...bundle.pilot.cases, ...bundle.official.cases];

  for (const caseEntry of allCases) {
    assert.equal(caseEntry.sourceHash, hashSource(caseEntry.source));

    if (HAZARD_CATEGORIES.has(caseEntry.category)) {
      assert.equal(caseEntry.supported, false);
      assert.ok(caseEntry.expectedPolicy?.hazard);
      assert.ok(caseEntry.expectedPolicy?.expectedOutcome);
      assert.ok(caseEntry.exclusionJustification);
      continue;
    }

    assert.equal(caseEntry.supported, true);
    assert.ok(caseEntry.semanticOracle?.id);
    assert.ok(caseEntry.expectedBehaviorId);
    assert.ok(caseEntry.recoveryTaskIds.length > 0);
  }
});

test('validates recovery task contracts and references', () => {
  const bundle = loadCorpus();
  const taskIds = new Set(bundle.recoveryTasks.tasks.map((task) => task.id));
  const evaluatorIds = new Set(bundle.recoveryTasks.evaluators.map((entry) => entry.id));
  const budgetIds = new Set(bundle.recoveryTasks.budgets.map((entry) => entry.id));
  const oracleIds = new Set(bundle.recoveryTasks.completionOracles.map((entry) => entry.id));

  for (const task of bundle.recoveryTasks.tasks) {
    assert.ok(task.objective);
    assert.ok(budgetIds.has(task.budgetId));
    assert.ok(oracleIds.has(task.oracleId));
    assert.ok(task.evaluatorIds.every((evaluatorId) => evaluatorIds.has(evaluatorId)));
  }

  for (const caseEntry of [...bundle.pilot.cases, ...bundle.official.cases]) {
    if (caseEntry.supported === false) {
      continue;
    }

    for (const taskId of caseEntry.recoveryTaskIds) {
      assert.ok(taskIds.has(taskId), `missing task ${taskId} for ${caseEntry.caseId}`);
    }
  }
});

test('rejects overlapping partitions', () => {
  const bundle = loadCorpus();
  const invalidBundle = structuredClone(bundle);
  invalidBundle.official.cases[0].caseId = invalidBundle.pilot.cases[0].caseId;

  const result = validateCorpus(invalidBundle);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === '/partitions'));
});

test('rejects stale source hashes', () => {
  const bundle = loadCorpus();
  const invalidBundle = structuredClone(bundle);
  invalidBundle.pilot.cases[0].sourceHash = 'sha256-stale';

  const result = validateCorpus(invalidBundle);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.path.includes('/sourceHash')),
    JSON.stringify(result.errors),
  );
});

test('rejects missing category coverage', () => {
  const bundle = loadCorpus();
  const invalidBundle = structuredClone(bundle);
  invalidBundle.pilot.cases = invalidBundle.pilot.cases.filter(
    (entry) => entry.category !== 'closures',
  );

  const result = validateCorpus(invalidBundle);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes('closures')));
});
