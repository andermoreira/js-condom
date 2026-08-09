import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicError } from './errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_JSON_PATH = join(__dirname, '../../package.json');
const ENGINE_PACKAGE_JSON_PATH = join(
  __dirname,
  '../../node_modules/javascript-obfuscator/package.json',
);

export const PRESET_VERSION = '1.0.0';
export const ALLOWED_OPTION_KEYS = Object.freeze(new Set(['seed']));

export const PRESET_V1 = Object.freeze({
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayShuffle: true,
  target: 'browser',
  unicodeEscapeSequence: false,
});

/**
 * @typedef {Object} ProtectOptions
 * @property {string} [seed] Omitted means a fresh random seed; effective value is always returned.
 */

/**
 * @typedef {Object} ResolvedProtectionConfig
 * @property {string} seedUsed
 * @property {string} presetVersion
 * @property {string} engineVersion
 * @property {Readonly<typeof PRESET_V1>} preset
 */

/**
 * @typedef {Object} ProtectionMetadata
 * @property {string} toolVersion
 * @property {string} engineVersion
 * @property {string} presetVersion
 * @property {string} seedUsed
 * @property {string} inputSha256
 * @property {string} outputSha256
 * @property {string} configSha256
 */

/**
 * @typedef {Object} ProtectResult
 * @property {string} code
 * @property {ProtectionMetadata} metadata
 */

/**
 * Protects JavaScript source code using the versioned preset.
 * Full implementation is provided in Step 2 (`src/core/protect.js`).
 *
 * @param {string} sourceCode
 * @param {ProtectOptions} [options]
 * @returns {Promise<ProtectResult>}
 */

function sortValue(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortValue(value[key]);
  }
  return sorted;
}

export function getToolVersion() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

export function getEngineVersion() {
  const packageJson = JSON.parse(readFileSync(ENGINE_PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

export function validateProtectInput(sourceCode) {
  if (typeof sourceCode !== 'string' || sourceCode.length === 0) {
    throw createPublicError(
      'INVALID_INPUT',
      'sourceCode must be a non-empty string',
      { sourceCodeType: typeof sourceCode },
    );
  }
}

function generateSeedUsed() {
  return randomBytes(16).toString('hex');
}

function resolveSeedUsed(options) {
  if (!('seed' in options)) {
    return generateSeedUsed();
  }

  const { seed } = options;
  if (typeof seed !== 'string' || seed.length === 0) {
    throw createPublicError(
      'INVALID_CONFIG',
      'seed must be a non-empty string when provided',
      { key: 'seed' },
    );
  }

  return seed;
}

export function resolveProtectionConfig(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw createPublicError(
      'INVALID_CONFIG',
      'options must be a plain object',
      { optionsType: typeof options },
    );
  }

  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw createPublicError(
        'INVALID_CONFIG',
        `unknown option: ${key}`,
        { key },
      );
    }
  }

  const seedUsed = resolveSeedUsed(options);

  return {
    seedUsed,
    presetVersion: PRESET_VERSION,
    engineVersion: getEngineVersion(),
    preset: PRESET_V1,
  };
}

export function buildConfigRecord(resolvedConfig) {
  return sortValue({
    engineVersion: resolvedConfig.engineVersion,
    presetVersion: resolvedConfig.presetVersion,
    preset: { ...resolvedConfig.preset },
    seedUsed: resolvedConfig.seedUsed,
  });
}

export function serializeConfigRecord(configRecord) {
  return JSON.stringify(sortValue(configRecord));
}
