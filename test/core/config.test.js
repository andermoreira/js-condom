import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOWED_OPTION_KEYS,
  PRESET_VERSION,
  PRESET_V1,
  buildConfigRecord,
  getEngineVersion,
  resolveProtectionConfig,
  serializeConfigRecord,
  validateProtectInput,
} from '../../src/core/config.js';
import {
  JsCondomError,
  PUBLIC_ERROR_CODES,
  createPublicError,
  serializePublicError,
} from '../../src/core/errors.js';
import {
  buildProtectionMetadata,
  computeConfigSha256,
  sha256Hex,
} from '../../src/core/metadata.js';

const SAMPLE_SOURCE = 'function add(a, b) { return a + b; }';
const SECRET_LIKE_SOURCE =
  'const apiKey = "sk-live-abcdef1234567890"; function run() { return apiKey; }';

test('exports all public error codes from the spec', () => {
  assert.deepEqual(PUBLIC_ERROR_CODES, [
    'INVALID_INPUT',
    'INVALID_CONFIG',
    'UNSUPPORTED_SYNTAX',
    'SEMANTIC_HAZARD',
    'PROTECTION_FAILED',
    'OUTPUT_CONFLICT',
    'INTERNAL_ERROR',
  ]);
});

test('reads the qualified engine version from the installed package', () => {
  assert.equal(getEngineVersion(), '4.1.0');
});

test('resolves explicit seed and keeps configSha256 stable for the same configuration', () => {
  const first = resolveProtectionConfig({ seed: 'my-seed' });
  const second = resolveProtectionConfig({ seed: 'my-seed' });

  assert.equal(first.seedUsed, 'my-seed');
  assert.equal(second.seedUsed, 'my-seed');
  assert.equal(first.presetVersion, PRESET_VERSION);
  assert.equal(first.engineVersion, '4.1.0');
  assert.deepEqual(first.preset, PRESET_V1);

  const firstRecord = buildConfigRecord(first);
  const secondRecord = buildConfigRecord(second);
  assert.equal(computeConfigSha256(firstRecord), computeConfigSha256(secondRecord));
});

test('generates a non-empty seed when seed is omitted and seeds differ across calls', () => {
  const first = resolveProtectionConfig();
  const second = resolveProtectionConfig();

  assert.match(first.seedUsed, /^[0-9a-f]{32}$/);
  assert.match(second.seedUsed, /^[0-9a-f]{32}$/);
  assert.notEqual(first.seedUsed, second.seedUsed);
});

test('rejects invalid configuration with INVALID_CONFIG', () => {
  const cases = [
    { options: null, key: 'optionsType' },
    { options: [], key: 'optionsType' },
    { options: { unknownOption: true }, key: 'key' },
    { options: { seed: '' }, key: 'seed' },
    { options: { seed: 42 }, key: 'seed' },
  ];

  for (const { options } of cases) {
    assert.throws(
      () => resolveProtectionConfig(options),
      (error) => error instanceof JsCondomError && error.code === 'INVALID_CONFIG',
    );
  }

  assert.equal(ALLOWED_OPTION_KEYS.has('seed'), true);
  assert.equal(ALLOWED_OPTION_KEYS.has('compact'), false);
});

test('rejects invalid protect input with INVALID_INPUT', () => {
  for (const sourceCode of ['', null, 42]) {
    assert.throws(
      () => validateProtectInput(sourceCode),
      (error) => error instanceof JsCondomError && error.code === 'INVALID_INPUT',
    );
  }

  assert.doesNotThrow(() => validateProtectInput(SAMPLE_SOURCE));
});

test('keeps config serialization stable regardless of key insertion order', () => {
  const resolved = resolveProtectionConfig({ seed: 'stable-seed' });
  const canonicalRecord = buildConfigRecord(resolved);
  const reversedRecord = {
    seedUsed: resolved.seedUsed,
    preset: { ...resolved.preset },
    presetVersion: resolved.presetVersion,
    engineVersion: resolved.engineVersion,
  };

  assert.equal(
    serializeConfigRecord(canonicalRecord),
    serializeConfigRecord(reversedRecord),
  );
  assert.equal(computeConfigSha256(canonicalRecord), computeConfigSha256(reversedRecord));
});

test('builds protection metadata with all required fields and stable hashes', () => {
  const resolved = resolveProtectionConfig({ seed: 'metadata-seed' });
  const outputCode = '// stub output';

  const metadata = buildProtectionMetadata({
    sourceCode: SAMPLE_SOURCE,
    outputCode,
    resolvedConfig: resolved,
  });

  assert.equal(metadata.toolVersion, '0.0.0');
  assert.equal(metadata.engineVersion, '4.1.0');
  assert.equal(metadata.presetVersion, PRESET_VERSION);
  assert.equal(metadata.seedUsed, 'metadata-seed');
  assert.equal(metadata.inputSha256, sha256Hex(SAMPLE_SOURCE));
  assert.equal(metadata.outputSha256, sha256Hex(outputCode));
  assert.equal(
    metadata.configSha256,
    computeConfigSha256(buildConfigRecord(resolved)),
  );
  assert.deepEqual(Object.keys(metadata).sort(), [
    'configSha256',
    'engineVersion',
    'inputSha256',
    'outputSha256',
    'presetVersion',
    'seedUsed',
    'toolVersion',
  ]);
});

test('serializes public errors without source code, secrets or stack traces', () => {
  const error = createPublicError(
    'INVALID_INPUT',
    'sourceCode must be a non-empty string',
    {
      sourceCode: SECRET_LIKE_SOURCE,
      sourceCodeType: 'string',
      stack: 'Error: hidden\n    at protect',
      token: 'sk-live-abcdef1234567890',
      key: 'seed',
    },
  );

  const serialized = serializePublicError(error);

  assert.equal(serialized.code, 'INVALID_INPUT');
  assert.equal(serialized.message, 'sourceCode must be a non-empty string');
  assert.deepEqual(serialized.details, { sourceCodeType: 'string', key: 'seed' });
  assert.equal(JSON.stringify(serialized).includes(SECRET_LIKE_SOURCE), false);
  assert.equal(JSON.stringify(serialized).includes('sk-live'), false);
  assert.equal(JSON.stringify(serialized).includes('stack'), false);
});
