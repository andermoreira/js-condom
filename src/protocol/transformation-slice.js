/**
 * OQ3 resolution: versioned common transformation slice for custom POC candidates.
 * structural-variant-v1 applies seeded structural reshaping on FunctionDeclaration
 * nodes at the parsed-ast stage; rename-identifiers is the only allowed auxiliary.
 */
export const TRANSFORMATION_SLICE = Object.freeze({
  id: 'structural-variant-v1',
  version: '1.0.0',
  appliesTo: Object.freeze(['oss-extension', 'own-minimal']),
  inputStageId: 'parsed-ast',
  eligibleNodeTypes: Object.freeze(['FunctionDeclaration']),
  selectionPolicy: 'uniform-random',
  variantPolicy: 'seeded-variant',
  logicalParameters: Object.freeze({ intensity: 1 }),
  allowedAuxiliaryTransforms: Object.freeze(['rename-identifiers']),
});

export const SLICE_CONFIG_EVIDENCE_ID = `${TRANSFORMATION_SLICE.id}/config`;
export const SLICE_ARTIFACT_EVIDENCE_ID = `${TRANSFORMATION_SLICE.id}/artifact`;

export class SliceConformanceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SliceConformanceError';
    this.code = code;
    this.details = details;
  }
}

function logicalParametersMatch(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

export function assertAuxiliaryTransformsAllowed(auxiliaryTransforms) {
  if (!Array.isArray(auxiliaryTransforms)) {
    throw new SliceConformanceError(
      'invalid_auxiliary_transform',
      'auxiliaryTransforms must be an array',
      { auxiliaryTransforms },
    );
  }

  const allowlist = new Set(TRANSFORMATION_SLICE.allowedAuxiliaryTransforms);
  for (const transform of auxiliaryTransforms) {
    if (!allowlist.has(transform)) {
      throw new SliceConformanceError(
        'invalid_auxiliary_transform',
        `auxiliary transform "${transform}" is not in the slice allowlist`,
        { transform, allowlist: [...allowlist] },
      );
    }
  }
}

export function buildConformanceEvidence({
  candidateId,
  inputStageId,
  auxiliaryTransforms,
  logicalParameters,
  appliedNodeTypes,
}) {
  validateConformanceMetadata({
    candidateId,
    inputStageId,
    sliceId: TRANSFORMATION_SLICE.id,
    sliceVersion: TRANSFORMATION_SLICE.version,
    logicalParameters,
    auxiliaryTransforms,
    appliedAuxiliaryTransforms: auxiliaryTransforms,
    appliedNodeTypes,
    eligibleNodeTypes: [...TRANSFORMATION_SLICE.eligibleNodeTypes],
  });

  return [SLICE_CONFIG_EVIDENCE_ID, SLICE_ARTIFACT_EVIDENCE_ID];
}

export function validateConformanceMetadata(metadata) {
  if (metadata === null || typeof metadata !== 'object') {
    throw new SliceConformanceError(
      'slice_conformance_violation',
      'metadata must be a plain object',
      { metadataType: typeof metadata },
    );
  }

  if (!TRANSFORMATION_SLICE.appliesTo.includes(metadata.candidateId)) {
    throw new SliceConformanceError(
      'slice_conformance_violation',
      `candidateId "${metadata.candidateId}" is not covered by the slice`,
      { candidateId: metadata.candidateId, appliesTo: [...TRANSFORMATION_SLICE.appliesTo] },
    );
  }

  if (metadata.inputStageId !== TRANSFORMATION_SLICE.inputStageId) {
    throw new SliceConformanceError(
      'invalid_input_stage',
      `inputStageId must be "${TRANSFORMATION_SLICE.inputStageId}"`,
      {
        expected: TRANSFORMATION_SLICE.inputStageId,
        actual: metadata.inputStageId,
      },
    );
  }

  if (metadata.sliceId !== TRANSFORMATION_SLICE.id) {
    throw new SliceConformanceError(
      'slice_conformance_violation',
      `sliceId must be "${TRANSFORMATION_SLICE.id}"`,
      { expected: TRANSFORMATION_SLICE.id, actual: metadata.sliceId },
    );
  }

  if (metadata.sliceVersion !== TRANSFORMATION_SLICE.version) {
    throw new SliceConformanceError(
      'slice_conformance_violation',
      `sliceVersion must be "${TRANSFORMATION_SLICE.version}"`,
      { expected: TRANSFORMATION_SLICE.version, actual: metadata.sliceVersion },
    );
  }

  if (!logicalParametersMatch(metadata.logicalParameters ?? {}, TRANSFORMATION_SLICE.logicalParameters)) {
    throw new SliceConformanceError(
      'slice_conformance_violation',
      'logicalParameters must match the versioned slice contract',
      {
        expected: TRANSFORMATION_SLICE.logicalParameters,
        actual: metadata.logicalParameters,
      },
    );
  }

  assertAuxiliaryTransformsAllowed(metadata.auxiliaryTransforms ?? []);
  assertAuxiliaryTransformsAllowed(metadata.appliedAuxiliaryTransforms ?? []);

  const eligible = new Set(TRANSFORMATION_SLICE.eligibleNodeTypes);
  for (const nodeType of metadata.appliedNodeTypes ?? []) {
    if (!eligible.has(nodeType)) {
      throw new SliceConformanceError(
        'slice_conformance_violation',
        `applied node type "${nodeType}" is not eligible for this slice`,
        { nodeType, eligibleNodeTypes: [...eligible] },
      );
    }
  }
}
