import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { PRESET_V1, PRESET_VERSION } from '../../src/core/config.js';
import { JsCondomError, serializePublicError } from '../../src/core/errors.js';
import { sha256Hex } from '../../src/core/metadata.js';
import { protect } from '../../src/core/protect.js';
import { FIXED_SEED } from './fixtures/semantic-fixtures.js';

const SAMPLE_SOURCE = 'export function add(a, b) { return a + b; }';
const SECRET_LIKE_SOURCE =
  'const apiKey = "sk-live-abcdef1234567890"; export function run() { return apiKey; }';

test('returns protected code and full metadata after validation', async () => {
  const result = await protect(SAMPLE_SOURCE, { seed: 'protect-metadata-seed' });

  assert.equal(typeof result.code, 'string');
  assert.ok(result.code.length > 0);
  assert.notEqual(result.code, SAMPLE_SOURCE);

  assert.equal(result.metadata.toolVersion, '0.0.0');
  assert.equal(result.metadata.engineVersion, '4.1.0');
  assert.equal(result.metadata.presetVersion, PRESET_VERSION);
  assert.equal(result.metadata.seedUsed, 'protect-metadata-seed');
  assert.equal(result.metadata.inputSha256, sha256Hex(SAMPLE_SOURCE));
  assert.equal(result.metadata.outputSha256, sha256Hex(result.code));
  assert.match(result.metadata.configSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(result.metadata).sort(), [
    'configSha256',
    'engineVersion',
    'inputSha256',
    'outputSha256',
    'presetVersion',
    'seedUsed',
    'toolVersion',
  ]);
});

test('rejects invalid input and configuration', async () => {
  for (const sourceCode of ['', null, 42]) {
    await assert.rejects(
      () => protect(sourceCode),
      (error) => error instanceof JsCondomError && error.code === 'INVALID_INPUT',
    );
  }

  await assert.rejects(
    () => protect(SAMPLE_SOURCE, { unknownOption: true }),
    (error) => error instanceof JsCondomError && error.code === 'INVALID_CONFIG',
  );
});

test('rejects semantic hazards with stable public error codes', async () => {
  const cases = [
    {
      source: 'export function runDynamic(expression) { return eval(expression); }',
      code: 'UNSUPPORTED_SYNTAX',
      hazard: 'direct-eval',
    },
    {
      source: 'export function readLength(obj) { with (obj) { return length; } }',
      code: 'UNSUPPORTED_SYNTAX',
      hazard: 'with-statement',
    },
    {
      source:
        'export function dependsOnToString(fn) { return fn.toString().includes("return value"); }',
      code: 'SEMANTIC_HAZARD',
      hazard: 'function-prototype-tostring',
    },
    {
      source: 'export const run = new Function("return 1");',
      code: 'SEMANTIC_HAZARD',
      hazard: 'function-constructor',
    },
  ];

  for (const { source, code, hazard } of cases) {
    await assert.rejects(
      () => protect(source, { seed: FIXED_SEED }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === code &&
        error.details?.hazard === hazard,
    );
  }
});

test('produces byte-deterministic output with a fixed seed', async () => {
  const first = await protect(SAMPLE_SOURCE, { seed: FIXED_SEED });
  const second = await protect(SAMPLE_SOURCE, { seed: FIXED_SEED });

  assert.equal(first.code, second.code);
  assert.equal(first.metadata.outputSha256, second.metadata.outputSha256);
  assert.equal(first.metadata.configSha256, second.metadata.configSha256);
});

test('generates seedUsed when seed is omitted', async () => {
  const result = await protect(SAMPLE_SOURCE);
  assert.match(result.metadata.seedUsed, /^[0-9a-f]{32}$/);
});

test('serializes protection errors without source code or secrets', async () => {
  try {
    await protect(SECRET_LIKE_SOURCE, { seed: '' });
    assert.fail('expected INVALID_CONFIG');
  } catch (error) {
    const serialized = serializePublicError(error);
    assert.equal(serialized.code, 'INVALID_CONFIG');
    assert.equal(JSON.stringify(serialized).includes(SECRET_LIKE_SOURCE), false);
    assert.equal(JSON.stringify(serialized).includes('sk-live'), false);
  }
});

test('does not invoke network during protection', async () => {
  const fetchMock = mock.fn(() => Promise.reject(new Error('network should be blocked')));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  try {
    await protect(SAMPLE_SOURCE, { seed: FIXED_SEED });
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forwards only validated preset options to the engine', async () => {
  const obfuscatorModule = await import('javascript-obfuscator');
  const obfuscateMock = mock.method(obfuscatorModule.default, 'obfuscate', (source, options) => ({
    getObfuscatedCode: () => source,
  }));

  try {
    await protect(SAMPLE_SOURCE, { seed: 'engine-options-seed' });
    assert.equal(obfuscateMock.mock.callCount(), 1);

    const [, options] = obfuscateMock.mock.calls[0].arguments;
    assert.deepEqual(options, {
      ...PRESET_V1,
      seed: 'engine-options-seed',
    });
  } finally {
    obfuscateMock.mock.restore();
  }
});
