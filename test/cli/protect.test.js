import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseProtectCliArgs, runProtectCli } from '../../src/cli/protect.js';

const CLI_PATH = resolve(fileURLToPath(new URL('../../src/cli/protect.js', import.meta.url)));
const SAMPLE_SOURCE = 'export function add(a, b) { return a + b; }';
const SECRET_LIKE_SOURCE =
  'const apiKey = "sk-live-abcdef1234567890"; export function run() { return apiKey; }';

async function withTempDir(run) {
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-cli-'));
  try {
    return await run(workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function parseStderr(stderr) {
  return JSON.parse(stderr.trim());
}

test('parseProtectCliArgs requires protect subcommand and explicit output', () => {
  assert.throws(
    () => parseProtectCliArgs(['node', 'cli']),
    (error) => error.code === 'INVALID_INPUT',
  );

  assert.throws(
    () => parseProtectCliArgs(['node', 'cli', 'protect', 'input.js']),
    (error) => error.code === 'INVALID_INPUT' && error.message.includes('--output'),
  );

  const parsed = parseProtectCliArgs([
    'node',
    'cli',
    'protect',
    'input.js',
    '--output',
    'out.js',
    '--report',
    'report.json',
    '--seed',
    'cli-seed',
  ]);

  assert.deepEqual(parsed, {
    inputPath: 'input.js',
    outputPath: 'out.js',
    reportPath: 'report.json',
    options: { seed: 'cli-seed' },
  });
});

test('runProtectCli succeeds for a valid command', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');
    await writeFile(inputPath, SAMPLE_SOURCE, 'utf8');

    const exitCode = await runProtectCli([
      'node',
      CLI_PATH,
      'protect',
      inputPath,
      '--output',
      outputPath,
      '--seed',
      'cli-run-seed',
    ]);

    assert.equal(exitCode, 0);
    const outputCode = await readFile(outputPath, 'utf8');
    assert.notEqual(outputCode, SAMPLE_SOURCE);
  });
});

test('cli rejects missing output and unsupported extensions', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.ts');
    await writeFile(inputPath, SAMPLE_SOURCE, 'utf8');

    const missingOutput = runCli(['protect', inputPath]);
    assert.notEqual(missingOutput.status, 0);
    assert.equal(parseStderr(missingOutput.stderr).code, 'INVALID_INPUT');

    const invalidExtension = runCli([
      'protect',
      inputPath,
      '--output',
      join(workDir, 'out.js'),
    ]);
    assert.notEqual(invalidExtension.status, 0);
    assert.equal(parseStderr(invalidExtension.stderr).code, 'INVALID_INPUT');
  });
});

test('cli rejects output conflicts with structured stderr', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.js');
    await writeFile(inputPath, SAMPLE_SOURCE, 'utf8');

    const samePath = runCli(['protect', inputPath, '--output', inputPath]);
    assert.notEqual(samePath.status, 0);
    assert.equal(parseStderr(samePath.stderr).code, 'OUTPUT_CONFLICT');

    const outputPath = join(workDir, 'protected.js');
    await writeFile(outputPath, 'existing', 'utf8');
    const existingOutput = runCli(['protect', inputPath, '--output', outputPath]);
    assert.notEqual(existingOutput.status, 0);
    assert.equal(parseStderr(existingOutput.stderr).code, 'OUTPUT_CONFLICT');
  });
});

test('cli stderr does not leak source code or stack traces', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.js');
    await writeFile(inputPath, SECRET_LIKE_SOURCE, 'utf8');

    const result = runCli([
      'protect',
      inputPath,
      '--output',
      inputPath,
    ]);

    assert.notEqual(result.status, 0);
    assert.equal(result.stderr.includes(SECRET_LIKE_SOURCE), false);
    assert.equal(result.stderr.includes('sk-live'), false);
    assert.equal(result.stderr.includes('stack'), false);
    assert.doesNotThrow(() => parseStderr(result.stderr));
  });
});

test('cli writes optional report atomically', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = join(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');
    const reportPath = join(workDir, 'report.json');
    await writeFile(inputPath, SAMPLE_SOURCE, 'utf8');

    const result = runCli([
      'protect',
      inputPath,
      '--output',
      outputPath,
      '--report',
      reportPath,
      '--seed',
      'report-seed',
    ]);

    assert.equal(result.status, 0);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.seedUsed, 'report-seed');
    assert.match(report.outputSha256, /^[0-9a-f]{64}$/);
  });
});
