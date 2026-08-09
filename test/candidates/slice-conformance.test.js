import assert from 'node:assert/strict';
import test from 'node:test';
import { protect as protectOssExtension } from '../../src/candidates/oss-extension.js';
import { protect as protectOwnMinimal } from '../../src/candidates/own-minimal.js';
import {
  SLICE_ARTIFACT_EVIDENCE_ID,
  SLICE_CONFIG_EVIDENCE_ID,
  SliceConformanceError,
  TRANSFORMATION_SLICE,
  buildConformanceEvidence,
  validateConformanceMetadata,
} from '../../src/protocol/transformation-slice.js';

const FUNCTION_SOURCE = 'function greet(name) { return `hello ${name}`; }';
const ARROW_SOURCE = 'const greet = (name) => `hello ${name}`;';
const MIXED_SOURCE = [
  'function add(a, b) { return a + b; }',
  'const sub = (a, b) => a - b;',
].join('\n');

const CUSTOM_CANDIDATES = [
  { candidateId: 'oss-extension', protect: protectOssExtension },
  { candidateId: 'own-minimal', protect: protectOwnMinimal },
];

function buildValidMetadata(candidateId, overrides = {}) {
  return {
    candidateId,
    inputStageId: TRANSFORMATION_SLICE.inputStageId,
    sliceId: TRANSFORMATION_SLICE.id,
    sliceVersion: TRANSFORMATION_SLICE.version,
    logicalParameters: { ...TRANSFORMATION_SLICE.logicalParameters },
    auxiliaryTransforms: ['rename-identifiers'],
    appliedAuxiliaryTransforms: ['rename-identifiers'],
    eligibleNodeTypes: [...TRANSFORMATION_SLICE.eligibleNodeTypes],
    appliedNodeTypes: ['FunctionDeclaration'],
    ...overrides,
  };
}

for (const { candidateId, protect } of CUSTOM_CANDIDATES) {
  test(`${candidateId}: function declaration fixture applies the structural slice`, () => {
    const result = protect({
      sourceCode: FUNCTION_SOURCE,
      canonicalSeed: 'conformance-seed-1',
      auxiliaryTransforms: [],
    });

    assert.equal(result.metadata.candidateId, candidateId);
    assert.equal(result.metadata.appliedVariants.length, 1);
    assert.equal(result.metadata.appliedVariants[0].nodeType, 'FunctionDeclaration');
    assert.notEqual(result.code, FUNCTION_SOURCE);
  });

  test(`${candidateId}: arrow-only fixture does not apply the structural slice`, () => {
    const result = protect({
      sourceCode: ARROW_SOURCE,
      canonicalSeed: 'conformance-seed-2',
      auxiliaryTransforms: [],
    });

    assert.deepEqual(result.metadata.appliedVariants, []);
    assert.equal(result.code, ARROW_SOURCE);
  });

  test(`${candidateId}: mixed fixture applies only to FunctionDeclaration nodes`, () => {
    const result = protect({
      sourceCode: MIXED_SOURCE,
      canonicalSeed: 'conformance-seed-3',
      auxiliaryTransforms: [],
    });

    assert.equal(result.metadata.appliedVariants.length, 1);
    assert.equal(result.metadata.appliedVariants[0].nodeType, 'FunctionDeclaration');
  });

  test(`${candidateId}: protect metadata passes slice conformance validation`, () => {
    const result = protect({
      sourceCode: FUNCTION_SOURCE,
      canonicalSeed: 'conformance-seed-4',
    });

    assert.doesNotThrow(() => validateConformanceMetadata(result.metadata));
    assert.deepEqual(result.metadata.sliceConformanceEvidenceIds, [
      SLICE_CONFIG_EVIDENCE_ID,
      SLICE_ARTIFACT_EVIDENCE_ID,
    ]);
  });
}

test('both custom candidates apply the same structural variants for the same seed', () => {
  const oss = protectOssExtension({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'conformance-seed-5',
    auxiliaryTransforms: [],
  });
  const own = protectOwnMinimal({
    sourceCode: FUNCTION_SOURCE,
    canonicalSeed: 'conformance-seed-5',
    auxiliaryTransforms: [],
  });

  assert.deepEqual(oss.metadata.appliedVariants, own.metadata.appliedVariants);
  assert.deepEqual(oss.metadata.selectedNodes, own.metadata.selectedNodes);
  assert.equal(oss.metadata.projectedSeed, own.metadata.projectedSeed);
});

test('buildConformanceEvidence returns stable config and artifact ids', () => {
  for (const candidateId of ['oss-extension', 'own-minimal']) {
    const evidence = buildConformanceEvidence({
      candidateId,
      inputStageId: TRANSFORMATION_SLICE.inputStageId,
      auxiliaryTransforms: ['rename-identifiers'],
      logicalParameters: { ...TRANSFORMATION_SLICE.logicalParameters },
      appliedNodeTypes: ['FunctionDeclaration'],
    });

    assert.deepEqual(evidence, [SLICE_CONFIG_EVIDENCE_ID, SLICE_ARTIFACT_EVIDENCE_ID]);
  }
});

test('validateConformanceMetadata rejects divergent input stage', () => {
  assert.throws(
    () =>
      validateConformanceMetadata(
        buildValidMetadata('oss-extension', {
          inputStageId: 'source-text',
        }),
      ),
    (error) => error instanceof SliceConformanceError && error.code === 'invalid_input_stage',
  );
});

test('validateConformanceMetadata rejects divergent logical parameters', () => {
  assert.throws(
    () =>
      validateConformanceMetadata(
        buildValidMetadata('own-minimal', {
          logicalParameters: { intensity: 2 },
        }),
      ),
    (error) =>
      error instanceof SliceConformanceError && error.code === 'slice_conformance_violation',
  );
});

test('validateConformanceMetadata rejects auxiliary transforms outside allowlist', () => {
  assert.throws(
    () =>
      validateConformanceMetadata(
        buildValidMetadata('oss-extension', {
          auxiliaryTransforms: ['dead-code-injection'],
        }),
      ),
    (error) =>
      error instanceof SliceConformanceError && error.code === 'invalid_auxiliary_transform',
  );
});

test('validateConformanceMetadata rejects candidate outside slice coverage', () => {
  assert.throws(
    () =>
      validateConformanceMetadata(
        buildValidMetadata('oss-baseline'),
      ),
    (error) =>
      error instanceof SliceConformanceError && error.code === 'slice_conformance_violation',
  );
});
