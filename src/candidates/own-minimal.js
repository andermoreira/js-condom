import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as escodegen from 'escodegen';
import { replace } from 'estraverse';
import JavaScriptObfuscator from 'javascript-obfuscator';
import {
  TRANSFORMATION_SLICE,
  assertAuxiliaryTransformsAllowed,
  buildConformanceEvidence,
  validateConformanceMetadata,
} from '../protocol/transformation-slice.js';
import { projectCanonicalSeed } from './oss-baseline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CANDIDATE_ID = 'own-minimal';
export const INPUT_STAGE_ID = TRANSFORMATION_SLICE.inputStageId;

export const RENAME_IDENTIFIERS_CONFIG = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: false,
  stringArrayShuffle: false,
  target: 'browser',
  unicodeEscapeSequence: false,
};

export class OwnMinimalError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OwnMinimalError';
    this.code = code;
    this.details = details;
  }
}

function readPackageIntegrity(packageName) {
  const lockfilePath = join(__dirname, '../../package-lock.json');
  const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const entry = lockfile.packages?.[`node_modules/${packageName}`];
  if (!entry?.integrity) {
    throw new OwnMinimalError(
      'tool_metadata_missing',
      `${packageName} integrity is missing from package-lock.json`,
      { packageName },
    );
  }
  return entry.integrity;
}

function readPackageVersion(packageName) {
  const packageJsonPath = join(__dirname, `../../node_modules/${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

export function getToolRecord() {
  return {
    parser: {
      name: 'acorn',
      version: readPackageVersion('acorn'),
      source: 'npm',
      integrity: readPackageIntegrity('acorn'),
    },
    codegen: {
      name: 'escodegen',
      version: readPackageVersion('escodegen'),
      source: 'npm',
      integrity: readPackageIntegrity('escodegen'),
    },
  };
}

function validateSourceCode(sourceCode) {
  if (typeof sourceCode !== 'string' || sourceCode.length === 0) {
    throw new OwnMinimalError(
      'invalid_input',
      'sourceCode must be a non-empty string',
      { sourceCodeType: typeof sourceCode },
    );
  }
}

function detectSourceType(sourceCode) {
  return /\b(import|export)\b/.test(sourceCode) ? 'module' : 'script';
}

function validateOutput(code) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new OwnMinimalError(
      'invalid_output',
      'candidate produced empty or non-string output',
    );
  }

  try {
    acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: detectSourceType(code),
    });
  } catch (error) {
    throw new OwnMinimalError(
      'invalid_output',
      'candidate output is not valid JavaScript',
      { cause: error.message },
    );
  }
}


function variantIndexForNode(projectedSeed, nodeStart) {
  const digest = createHash('sha256')
    .update(`${projectedSeed}:${nodeStart}`, 'utf8')
    .digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) % 2;
}

function suffixForNode(projectedSeed, nodeStart) {
  return createHash('sha256')
    .update(`${projectedSeed}:suffix:${nodeStart}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
}

function shouldSelectNode(random, intensity) {
  return random() < intensity;
}

function createSeededRandom(projectedSeed) {
  let state = projectedSeed % 2_147_483_647;
  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function applyBlockWrap(body) {
  return {
    type: 'BlockStatement',
    body: [
      {
        type: 'BlockStatement',
        body: body.body,
      },
    ],
  };
}

function applyReturnBind(body, projectedSeed, nodeStart) {
  const statements = body.body;
  const last = statements[statements.length - 1];
  if (last?.type !== 'ReturnStatement' || last.argument === null) {
    return applyBlockWrap(body);
  }

  const bindingName = `__sv${suffixForNode(projectedSeed, nodeStart)}`;
  return {
    type: 'BlockStatement',
    body: [
      ...statements.slice(0, -1),
      {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: bindingName },
            init: last.argument,
          },
        ],
      },
      {
        type: 'ReturnStatement',
        argument: { type: 'Identifier', name: bindingName },
      },
    ],
  };
}

function applyStructuralVariant(functionNode, projectedSeed) {
  if (functionNode.body?.type !== 'BlockStatement') {
    return null;
  }

  const nodeStart = functionNode.start ?? 0;
  const variantIndex = variantIndexForNode(projectedSeed, nodeStart);
  const variant = variantIndex === 0 ? 'block-wrap' : 'return-bind';
  const nextBody =
    variant === 'block-wrap'
      ? applyBlockWrap(functionNode.body)
      : applyReturnBind(functionNode.body, projectedSeed, nodeStart);

  functionNode.body = nextBody;

  return {
    nodeType: 'FunctionDeclaration',
    start: nodeStart,
    variant,
  };
}

function applyStructuralSlice(ast, projectedSeed) {
  const intensity = TRANSFORMATION_SLICE.logicalParameters.intensity;
  const random = createSeededRandom(projectedSeed);
  const selectedNodes = [];
  const appliedVariants = [];

  replace(ast, {
    enter(node) {
      if (node.type !== 'FunctionDeclaration' || node.body?.type !== 'BlockStatement') {
        return;
      }

      if (!shouldSelectNode(random, intensity)) {
        return;
      }

      const applied = applyStructuralVariant(node, projectedSeed);
      if (!applied) {
        return;
      }

      selectedNodes.push({
        nodeType: applied.nodeType,
        start: applied.start,
      });
      appliedVariants.push({
        nodeType: applied.nodeType,
        start: applied.start,
        variant: applied.variant,
      });
    },
  });

  return { selectedNodes, appliedVariants };
}

function parseToAst(sourceCode) {
  try {
    return acorn.parse(sourceCode, {
      ecmaVersion: 'latest',
      sourceType: detectSourceType(sourceCode),
      locations: true,
    });
  } catch (error) {
    throw new OwnMinimalError(
      'invalid_input',
      'sourceCode could not be parsed at parsed-ast stage',
      { cause: error.message },
    );
  }
}

function generateFromAst(ast) {
  try {
    return escodegen.generate(ast);
  } catch (error) {
    throw new OwnMinimalError(
      'tool_error',
      'failed to generate JavaScript from parsed AST',
      { cause: error.message },
    );
  }
}

function applyRenameIdentifiers(sourceCode, projectedSeed) {
  try {
    const result = JavaScriptObfuscator.obfuscate(sourceCode, {
      ...RENAME_IDENTIFIERS_CONFIG,
      seed: projectedSeed,
    });
    return result.getObfuscatedCode();
  } catch (error) {
    throw new OwnMinimalError(
      'tool_error',
      'rename-identifiers auxiliary transform failed',
      { cause: error.message },
    );
  }
}

export function protect({
  sourceCode,
  canonicalSeed,
  auxiliaryTransforms = ['rename-identifiers'],
}) {
  validateSourceCode(sourceCode);

  let projection;
  try {
    projection = projectCanonicalSeed(canonicalSeed);
  } catch (error) {
    throw new OwnMinimalError(error.code ?? 'invalid_canonical_seed', error.message, error.details);
  }

  try {
    assertAuxiliaryTransformsAllowed(auxiliaryTransforms);
  } catch (error) {
    throw new OwnMinimalError(error.code, error.message, error.details);
  }

  const ast = parseToAst(sourceCode);
  const { selectedNodes, appliedVariants } = applyStructuralSlice(ast, projection.projectedSeed);

  let code = sourceCode;
  if (appliedVariants.length > 0) {
    code = generateFromAst(ast);
  }

  const appliedAuxiliaryTransforms = [];
  if (auxiliaryTransforms.includes('rename-identifiers')) {
    code = applyRenameIdentifiers(code, projection.projectedSeed);
    appliedAuxiliaryTransforms.push('rename-identifiers');
  }

  validateOutput(code);

  const appliedNodeTypes = [...new Set(appliedVariants.map((entry) => entry.nodeType))];
  const metadata = {
    candidateId: CANDIDATE_ID,
    inputStageId: INPUT_STAGE_ID,
    sliceId: TRANSFORMATION_SLICE.id,
    sliceVersion: TRANSFORMATION_SLICE.version,
    logicalParameters: { ...TRANSFORMATION_SLICE.logicalParameters },
    auxiliaryTransforms: [...auxiliaryTransforms],
    appliedAuxiliaryTransforms,
    eligibleNodeTypes: [...TRANSFORMATION_SLICE.eligibleNodeTypes],
    appliedNodeTypes,
    selectedNodes,
    appliedVariants,
    tool: getToolRecord(),
    canonicalSeed: projection.canonicalSeed,
    canonicalSeedProjection: projection.projectionRecord,
    projectedSeed: projection.projectedSeed,
    projectionAlgorithm: projection.algorithm,
    renameConfig: auxiliaryTransforms.includes('rename-identifiers')
      ? { ...RENAME_IDENTIFIERS_CONFIG }
      : null,
  };

  metadata.sliceConformanceEvidenceIds = buildConformanceEvidence({
    candidateId: metadata.candidateId,
    inputStageId: metadata.inputStageId,
    auxiliaryTransforms: metadata.auxiliaryTransforms,
    logicalParameters: metadata.logicalParameters,
    appliedNodeTypes: metadata.appliedNodeTypes,
  });

  try {
    validateConformanceMetadata(metadata);
  } catch (error) {
    throw new OwnMinimalError(error.code, error.message, error.details);
  }

  return { code, metadata };
}
