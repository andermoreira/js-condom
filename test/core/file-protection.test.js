import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JsCondomError } from '../../src/core/errors.js';
import {
  assertNoOutputConflict,
  protectFile,
  validateInputExtension,
  writeFileAtomically,
} from '../../src/core/file-protection.js';
import { FIXED_SEED } from './fixtures/semantic-fixtures.js';

const SAMPLE_SOURCE = 'export function add(a, b) { return a + b; }';

async function withTempDir(run) {
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-file-protection-'));
  try {
    return await run(workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function writeInput(workDir, fileName, source = SAMPLE_SOURCE) {
  const inputPath = join(workDir, fileName);
  await writeFile(inputPath, source, 'utf8');
  return inputPath;
}

test('validateInputExtension accepts .js, .mjs and .cjs', () => {
  assert.doesNotThrow(() => validateInputExtension('bundle.js'));
  assert.doesNotThrow(() => validateInputExtension('bundle.mjs'));
  assert.doesNotThrow(() => validateInputExtension('bundle.cjs'));
});

test('validateInputExtension rejects unsupported extensions', () => {
  for (const fileName of ['bundle.ts', 'bundle.txt', 'bundle']) {
    assert.throws(
      () => validateInputExtension(fileName),
      (error) => error instanceof JsCondomError && error.code === 'INVALID_INPUT',
    );
  }
});

for (const fileName of ['input.js', 'input.mjs', 'input.cjs']) {
  test(`protectFile protects ${fileName}`, async () => {
    await withTempDir(async (workDir) => {
      const inputPath = await writeInput(workDir, fileName);
      const outputPath = join(workDir, `protected-${fileName}`);

      const result = await protectFile({
        inputPath,
        outputPath,
        options: { seed: FIXED_SEED },
      });

      const outputCode = await readFile(outputPath, 'utf8');
      assert.equal(outputCode, result.code);
      assert.notEqual(outputCode, SAMPLE_SOURCE);
    });
  });
}

test('protectFile writes optional report with full metadata', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');
    const reportPath = join(workDir, 'report.json');

    const result = await protectFile({
      inputPath,
      outputPath,
      reportPath,
      options: { seed: FIXED_SEED },
    });

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.deepEqual(report, result.metadata);
    assert.deepEqual(Object.keys(report).sort(), [
      'configSha256',
      'engineVersion',
      'inputSha256',
      'outputSha256',
      'presetVersion',
      'seedUsed',
      'toolVersion',
    ]);
  });
});

test('protectFile forwards explicit seed to metadata', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');

    const result = await protectFile({
      inputPath,
      outputPath,
      options: { seed: 'cli-seed-value' },
    });

    assert.equal(result.metadata.seedUsed, 'cli-seed-value');
  });
});

test('assertNoOutputConflict rejects input and output on the same path', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(workDir, 'input.js');

    await assert.rejects(
      () => assertNoOutputConflict({ inputPath, outputPath: inputPath }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === 'OUTPUT_CONFLICT' &&
        error.details?.conflict === 'input-output-same',
    );
  });
});

test('assertNoOutputConflict rejects existing output and report files', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');
    const reportPath = join(workDir, 'report.json');
    await writeFile(outputPath, 'existing', 'utf8');
    await writeFile(reportPath, '{}', 'utf8');

    await assert.rejects(
      () => assertNoOutputConflict({ inputPath, outputPath }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === 'OUTPUT_CONFLICT' &&
        error.details?.conflict === 'output-exists',
    );

    await assert.rejects(
      () =>
        assertNoOutputConflict({
          inputPath,
          outputPath: join(workDir, 'new-output.js'),
          reportPath,
        }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === 'OUTPUT_CONFLICT' &&
        error.details?.conflict === 'report-exists',
    );
  });
});

test('assertNoOutputConflict rejects report path collisions', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(workDir, 'input.js');
    const outputPath = join(workDir, 'protected.js');

    await assert.rejects(
      () =>
        assertNoOutputConflict({
          inputPath,
          outputPath,
          reportPath: outputPath,
        }),
      (error) =>
        error instanceof JsCondomError &&
        error.code === 'OUTPUT_CONFLICT' &&
        error.details?.conflict === 'report-path-collision',
    );
  });
});

test('protectFile does not publish partial output when protection fails', async () => {
  await withTempDir(async (workDir) => {
    const inputPath = await writeInput(
      workDir,
      'input.js',
      'export function runDynamic(expression) { return eval(expression); }',
    );
    const outputPath = join(workDir, 'protected.js');
    const reportPath = join(workDir, 'report.json');

    await assert.rejects(
      () =>
        protectFile({
          inputPath,
          outputPath,
          reportPath,
          options: { seed: FIXED_SEED },
        }),
      (error) => error instanceof JsCondomError && error.code === 'UNSUPPORTED_SYNTAX',
    );

    await assert.rejects(() => readFile(outputPath, 'utf8'));
    await assert.rejects(() => readFile(reportPath, 'utf8'));
  });
});

test('writeFileAtomically rejects write failures without leaving partial output', async () => {
  await withTempDir(async (workDir) => {
    const readOnlyDir = join(workDir, 'readonly');
    await mkdir(readOnlyDir, { recursive: true });
    await chmod(readOnlyDir, 0o500);

    const targetPath = join(readOnlyDir, 'protected.js');

    await assert.rejects(
      () => writeFileAtomically(targetPath, 'protected code'),
      (error) => error instanceof JsCondomError && error.code === 'INTERNAL_ERROR',
    );

    await assert.rejects(() => readFile(targetPath, 'utf8'));
    await chmod(readOnlyDir, 0o700);
  });
});
