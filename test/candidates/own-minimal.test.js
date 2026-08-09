import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_ID,
  INPUT_STAGE_ID,
  OwnMinimalError,
  protect,
} from '../../src/candidates/own-minimal.js';
import {
  SLICE_ARTIFACT_EVIDENCE_ID,
  SLICE_CONFIG_EVIDENCE_ID,
  TRANSFORMATION_SLICE,
} from '../../src/protocol/transformation-slice.js';

const FUNCTION_SOURCE = 'function add(a, b) { return a + b; }';
const ARROW_SOURCE = 'const add = (a, b) => a + b;';
const MIXED_SOURCE = [
  'function add(a, b) { return a + b; }',
  'const sub = (a, b) => a - b;',
].join('\n');

test('applies structural variant to FunctionDeclaration and records conformance metadata', () => {
  const result = protect({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'pilot-seed-1',
  });

  assert.equal(result.metadata.candidateId, CANDIDATE_ID);
  assert.equal(result.metadata.inputStageId, INPUT_STAGE_ID);
  assert.equal(result.metadata.sliceId, TRANSFORMATION_SLICE.id);
  assert.deepEqual(result.metadata.logicalParameters, TRANSFORMATION_SLICE.logicalParameters);
  assert.deepEqual(result.metadata.auxiliaryTransforms, ['rename-identifiers']);
  assert.deepEqual(result.metadata.sliceConformanceEvidenceIds, [
    SLICE_CONFIG_EVIDENCE_ID,
    SLICE_ARTIFACT_EVIDENCE_ID,
  ]);
  assert.equal(result.metadata.appliedVariants.length, 1);
  assert.equal(result.metadata.appliedVariants[0].nodeType, 'FunctionDeclaration');
  assert.notEqual(result.code, FUNCTION_SOURCE);
  assert.equal(result.metadata.tool.parser.name, 'acorn');
  assert.equal(result.metadata.tool.codegen.name, 'escodegen');
});

test('does not apply structural variant to arrow-only source', () => {
  const withoutRename = protect({
    sourceCode: ARROW_SOURCE,
    canonicalSeed: 'pilot-seed-1',
    auxiliaryTransforms: [],
  });

  assert.deepEqual(withoutRename.metadata.appliedVariants, []);
  assert.deepEqual(withoutRename.metadata.selectedNodes, []);
  assert.equal(withoutRename.code, ARROW_SOURCE);
});

test('applies structural variant only to FunctionDeclaration in mixed source', () => {
  const withoutRename = protect({
    sourceCode: MIXED_SOURCE,
    canonicalSeed: 'pilot-seed-2',
    auxiliaryTransforms: [],
  });

  assert.equal(withoutRename.metadata.appliedVariants.length, 1);
  assert.equal(withoutRename.metadata.appliedVariants[0].nodeType, 'FunctionDeclaration');
  assert.match(withoutRename.code, /function add/);
  assert.match(withoutRename.code, /const sub = \(a, b\) => a - b;/);
});

test('produces reproducible output for the same seed and changes across seeds', () => {
  const first = protect({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'pilot-seed-1',
  });
  const second = protect({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'pilot-seed-1',
  });
  const otherSeed = protect({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'pilot-seed-2',
  });

  assert.equal(first.code, second.code);
  assert.notEqual(first.code, otherSeed.code);
});

test('rejects auxiliary transforms outside the slice allowlist', () => {
  assert.throws(
    () =>
      protect({
        sourceCode: FUNCTION_SOURCE,
        canonicalSeed: 'pilot-seed-1',
        auxiliaryTransforms: ['string-array'],
      }),
    (error) =>
      error instanceof OwnMinimalError && error.code === 'invalid_auxiliary_transform',
  );
});

test('preserves semantics for a simple function fixture', () => {
  const source = 'function multiply(x, y) { return x * y; }';
  const result = protect({
    sourceCode: source,
    canonicalSeed: 'pilot-seed-3',
    auxiliaryTransforms: [],
  });

  const original = new Function(`${source}; return multiply;`)();
  const protectedMultiply = new Function(`${result.code}; return multiply;`)();
  assert.equal(protectedMultiply(3, 4), original(3, 4));
});

test('rejects empty input with diagnostics', () => {
  assert.throws(
    () =>
      protect({
        sourceCode: '',
        canonicalSeed: 'pilot-seed-1',
      }),
    (error) => error instanceof OwnMinimalError && error.code === 'invalid_input',
  );
});
