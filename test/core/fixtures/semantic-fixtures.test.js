import assert from 'node:assert/strict';
import test from 'node:test';
import { JsCondomError } from '../../../src/core/errors.js';
import { protect } from '../../../src/core/protect.js';
import { evaluateBehaviorOracle } from '../../../src/runner/semantic-runner.js';
import {
  FIXED_SEED,
  HAZARD_FIXTURES,
  SUPPORTED_FIXTURES,
  assertFixtureMatrixIntegrity,
  loadFixtureModule,
} from './semantic-fixtures.js';

test('declares a complete semantic fixture matrix', () => {
  assert.doesNotThrow(() => assertFixtureMatrixIntegrity());
  assert.equal(SUPPORTED_FIXTURES.length, 11);
  assert.equal(HAZARD_FIXTURES.length, 3);
});

for (const fixture of SUPPORTED_FIXTURES) {
  test(`supported fixture ${fixture.id} preserves observable behavior`, async () => {
    const { code } = await protect(fixture.source, { seed: FIXED_SEED });

    const originalModule = await loadFixtureModule(fixture.source, {
      moduleFormat: fixture.moduleFormat,
    });
    const protectedModule = await loadFixtureModule(code, {
      moduleFormat: fixture.moduleFormat,
    });

    let originalResult;
    let protectedResult;

    if (fixture.runOracle) {
      originalResult = await fixture.runOracle(originalModule);
      protectedResult = await fixture.runOracle(protectedModule);
    } else {
      originalResult = await evaluateBehaviorOracle(fixture.expectedBehaviorId, originalModule);
      protectedResult = await evaluateBehaviorOracle(fixture.expectedBehaviorId, protectedModule);
    }

    assert.equal(
      originalResult.passed,
      true,
      `original oracle failed for ${fixture.id}: ${originalResult.diagnostics.join('; ')}`,
    );
    assert.equal(
      protectedResult.passed,
      true,
      `protected oracle failed for ${fixture.id}: ${protectedResult.diagnostics.join('; ')}`,
    );
  });
}

for (const fixture of HAZARD_FIXTURES) {
  test(`hazard fixture ${fixture.id} fails closed before protection`, async () => {
    await assert.rejects(
      () => protect(fixture.source, { seed: FIXED_SEED }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === fixture.expectedCode &&
        error.details?.hazard === fixture.hazard,
    );
  });
}
