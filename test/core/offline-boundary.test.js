import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mock, test } from 'node:test';
import { serializePublicError } from '../../src/core/errors.js';
import { protect } from '../../src/core/protect.js';
import { FIXED_SEED } from './fixtures/semantic-fixtures.js';

const CLI_PATH = resolve(fileURLToPath(new URL('../../src/cli/protect.js', import.meta.url)));
const SAMPLE_SOURCE = 'export function add(a, b) { return a + b; }';
const SECRET_LIKE_SOURCE =
  'const apiKey = "sk-live-abcdef1234567890"; export function run() { return apiKey; }';

function installNetworkStubs() {
  const fetchMock = mock.fn(() => Promise.reject(new Error('network should be blocked')));
  const httpRequestMock = mock.method(http, 'request', () => {
    throw new Error('network should be blocked');
  });
  const httpsRequestMock = mock.method(https, 'request', () => {
    throw new Error('network should be blocked');
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  return {
    fetchMock,
    httpRequestMock,
    httpsRequestMock,
    restore() {
      globalThis.fetch = originalFetch;
      fetchMock.mock.restore();
      httpRequestMock.mock.restore();
      httpsRequestMock.mock.restore();
    },
  };
}

async function withTempDir(run) {
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-offline-boundary-'));
  try {
    return await run(workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

test('protect does not invoke network APIs during protection', async () => {
  const stubs = installNetworkStubs();

  try {
    await protect(SAMPLE_SOURCE, { seed: FIXED_SEED });
    assert.equal(stubs.fetchMock.mock.callCount(), 0);
    assert.equal(stubs.httpRequestMock.mock.callCount(), 0);
    assert.equal(stubs.httpsRequestMock.mock.callCount(), 0);
  } finally {
    stubs.restore();
  }
});

test('cli protect does not invoke network APIs in the parent process', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');
    await writeFile(inputPath, SAMPLE_SOURCE, 'utf8');

    const stubs = installNetworkStubs();

    try {
      const result = spawnSync(process.execPath, [
        CLI_PATH,
        'protect',
        inputPath,
        '--output',
        outputPath,
        '--seed',
        FIXED_SEED,
      ], {
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(stubs.fetchMock.mock.callCount(), 0);
      assert.equal(stubs.httpRequestMock.mock.callCount(), 0);
      assert.equal(stubs.httpsRequestMock.mock.callCount(), 0);
    } finally {
      stubs.restore();
    }
  });
});

test('serialized protection errors do not leak source code from the process boundary', async () => {
  try {
    await protect(SECRET_LIKE_SOURCE, { seed: '' });
    assert.fail('expected INVALID_CONFIG');
  } catch (error) {
    const serialized = serializePublicError(error);
    const payload = JSON.stringify(serialized);

    assert.equal(payload.includes(SECRET_LIKE_SOURCE), false);
    assert.equal(payload.includes('sk-live'), false);
    assert.equal(payload.includes('stack'), false);
  }
});
