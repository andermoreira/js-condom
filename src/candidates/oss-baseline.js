import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
const __dirname = dirname(fileURLToPath(import.meta.url));

const TOOL_PACKAGE_JSON = join(
  __dirname,
  '../../node_modules/javascript-obfuscator/package.json',
);

export const CANDIDATE_ID = 'oss-baseline';
export const TOOL_NAME = 'javascript-obfuscator';
export const TOOL_SOURCE = 'npm';
export const TOOL_COMMAND = 'npx javascript-obfuscator';
export const CANONICAL_SEED_PROJECTION_ALGORITHM = 'sha256-mod-2**31';

export const FORBIDDEN_CONFIG_KEYS = new Set(['seed']);

export const ALLOWED_OBFUSCATOR_CONFIG_KEYS = new Set([
  'compact',
  'controlFlowFlattening',
  'controlFlowFlatteningThreshold',
  'deadCodeInjection',
  'deadCodeInjectionThreshold',
  'debugProtection',
  'debugProtectionInterval',
  'disableConsoleOutput',
  'domainLock',
  'domainLockRedirectUrl',
  'identifierNamesGenerator',
  'identifiersPrefix',
  'identifiersDictionary',
  'ignoreImports',
  'inputFileName',
  'log',
  'numbersToExpressions',
  'optionsPreset',
  'renameGlobals',
  'renameProperties',
  'renamePropertiesMode',
  'reservedNames',
  'reservedStrings',
  'rotateStringArray',
  'selfDefending',
  'shuffleStringArray',
  'simplify',
  'sourceMap',
  'sourceMapBaseUrl',
  'sourceMapFileName',
  'sourceMapMode',
  'splitStrings',
  'splitStringsChunkLength',
  'stringArray',
  'stringArrayCallsTransform',
  'stringArrayCallsTransformThreshold',
  'stringArrayEncoding',
  'stringArrayIndexesType',
  'stringArrayIndexShift',
  'stringArrayRotate',
  'stringArrayShuffle',
  'stringArrayWrappersCount',
  'stringArrayWrappersChainedCalls',
  'stringArrayWrappersParametersMaxCount',
  'stringArrayWrappersType',
  'stringArrayThreshold',
  'target',
  'transformObjectKeys',
  'unicodeEscapeSequence',
]);

export const REQUIRED_OBFUSCATOR_CONFIG_KEYS = [
  'compact',
  'controlFlowFlattening',
  'deadCodeInjection',
  'identifierNamesGenerator',
  'renameGlobals',
  'selfDefending',
  'simplify',
  'stringArray',
  'stringArrayShuffle',
  'target',
  'unicodeEscapeSequence',
];

export class OssBaselineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OssBaselineError';
    this.code = code;
    this.details = details;
  }
}

function readToolVersion() {
  const packageJson = JSON.parse(readFileSync(TOOL_PACKAGE_JSON, 'utf8'));
  return packageJson.version;
}

function readToolIntegrity() {
  const lockfilePath = join(__dirname, '../../package-lock.json');
  const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const entry = lockfile.packages?.['node_modules/javascript-obfuscator'];
  if (!entry?.integrity) {
    throw new OssBaselineError(
      'tool_metadata_missing',
      'javascript-obfuscator integrity is missing from package-lock.json',
    );
  }
  return entry.integrity;
}

export function getToolRecord() {
  return {
    name: TOOL_NAME,
    version: readToolVersion(),
    source: TOOL_SOURCE,
    integrity: readToolIntegrity(),
    command: TOOL_COMMAND,
  };
}

export function projectCanonicalSeed(canonicalSeed) {
  if (typeof canonicalSeed !== 'string' || canonicalSeed.length === 0) {
    throw new OssBaselineError(
      'invalid_canonical_seed',
      'canonicalSeed must be a non-empty string',
      { canonicalSeed },
    );
  }

  const digest = createHash('sha256').update(canonicalSeed, 'utf8').digest('hex');
  const projectedSeed = Number.parseInt(digest.slice(0, 8), 16) % 2_147_483_647;

  return {
    algorithm: CANONICAL_SEED_PROJECTION_ALGORITHM,
    canonicalSeed,
    projectedSeed,
    projectionRecord: `${CANONICAL_SEED_PROJECTION_ALGORITHM}:${projectedSeed}`,
  };
}

function validateSourceCode(sourceCode) {
  if (typeof sourceCode !== 'string' || sourceCode.length === 0) {
    throw new OssBaselineError(
      'invalid_input',
      'sourceCode must be a non-empty string',
      { sourceCodeType: typeof sourceCode },
    );
  }
}

function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new OssBaselineError(
      'invalid_config',
      'config must be a plain object',
      { configType: typeof config },
    );
  }

  for (const key of Object.keys(config)) {
    if (FORBIDDEN_CONFIG_KEYS.has(key)) {
      throw new OssBaselineError(
        'forbidden_config_key',
        `config key "${key}" is not allowed; canonical seeds are projected separately`,
        { key },
      );
    }

    if (!ALLOWED_OBFUSCATOR_CONFIG_KEYS.has(key)) {
      throw new OssBaselineError(
        'invalid_config',
        `unknown obfuscator config key: ${key}`,
        { key },
      );
    }
  }

  for (const key of REQUIRED_OBFUSCATOR_CONFIG_KEYS) {
    if (!(key in config)) {
      throw new OssBaselineError(
        'missing_config_key',
        `required obfuscator config key is missing: ${key}`,
        { key },
      );
    }
  }
}

function buildObfuscatorOptions(config, projectedSeed) {
  const options = { ...config, seed: projectedSeed };

  for (const key of Object.keys(options)) {
    if (!ALLOWED_OBFUSCATOR_CONFIG_KEYS.has(key) && key !== 'seed') {
      throw new OssBaselineError(
        'invalid_config',
        `unknown obfuscator option: ${key}`,
        { key },
      );
    }
  }

  return options;
}

function validateOutput(code) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new OssBaselineError(
      'invalid_output',
      'obfuscator produced empty or non-string output',
    );
  }

  try {
    // Syntax check for script bodies produced by the corpus; modules are out of scope here.
    new Function(code);
  } catch (error) {
    throw new OssBaselineError(
      'invalid_output',
      'obfuscator output is not valid JavaScript',
      { cause: error.message },
    );
  }
}

export function protect({ sourceCode, canonicalSeed, config }) {
  validateSourceCode(sourceCode);
  validateConfig(config);
  const projection = projectCanonicalSeed(canonicalSeed);
  const obfuscatorOptions = buildObfuscatorOptions(config, projection.projectedSeed);

  let obfuscationResult;
  try {
    obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, obfuscatorOptions);
  } catch (error) {
    throw new OssBaselineError(
      'tool_error',
      'javascript-obfuscator failed to obfuscate input',
      { cause: error.message },
    );
  }

  const code = obfuscationResult.getObfuscatedCode();
  validateOutput(code);

  const tool = getToolRecord();

  return {
    code,
    metadata: {
      candidateId: CANDIDATE_ID,
      tool,
      canonicalSeed: projection.canonicalSeed,
      canonicalSeedProjection: projection.projectionRecord,
      projectedSeed: projection.projectedSeed,
      projectionAlgorithm: projection.algorithm,
      config: { ...config },
      obfuscatorOptions,
    },
  };
}
