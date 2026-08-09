import { randomBytes } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { createPublicError } from './errors.js';
import { protect } from './protect.js';

export const SUPPORTED_EXTENSIONS = Object.freeze(new Set(['.js', '.mjs', '.cjs']));

function normalizePath(filePath) {
  return resolve(filePath);
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function validateInputExtension(inputPath) {
  const extension = extname(inputPath);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw createPublicError(
      'INVALID_INPUT',
      'input file must have a .js, .mjs or .cjs extension',
      { extension: extension || '(none)' },
    );
  }
}

export async function assertNoOutputConflict({ inputPath, outputPath, reportPath }) {
  const normalizedInput = normalizePath(inputPath);
  const normalizedOutput = normalizePath(outputPath);
  const normalizedReport = reportPath ? normalizePath(reportPath) : undefined;

  if (normalizedOutput === normalizedInput) {
    throw createPublicError(
      'OUTPUT_CONFLICT',
      'output path must differ from input path',
      { conflict: 'input-output-same' },
    );
  }

  if (normalizedReport !== undefined) {
    if (normalizedReport === normalizedInput || normalizedReport === normalizedOutput) {
      throw createPublicError(
        'OUTPUT_CONFLICT',
        'report path must differ from input and output paths',
        { conflict: 'report-path-collision' },
      );
    }
  }

  if (await pathExists(normalizedOutput)) {
    throw createPublicError(
      'OUTPUT_CONFLICT',
      'output file already exists',
      { conflict: 'output-exists', path: outputPath },
    );
  }

  if (normalizedReport !== undefined && (await pathExists(normalizedReport))) {
    throw createPublicError(
      'OUTPUT_CONFLICT',
      'report file already exists',
      { conflict: 'report-exists', path: reportPath },
    );
  }
}

export async function writeFileAtomically(targetPath, content) {
  const absoluteTarget = normalizePath(targetPath);
  const directory = dirname(absoluteTarget);
  const tempPath = joinTempPath(directory, basename(absoluteTarget));

  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, absoluteTarget);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw createPublicError(
      'INTERNAL_ERROR',
      'failed to write output file',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function joinTempPath(directory, fileName) {
  const suffix = randomBytes(8).toString('hex');
  return resolve(directory, `.${fileName}.${suffix}.tmp`);
}

async function readInputFile(inputPath) {
  try {
    return await readFile(inputPath, 'utf8');
  } catch (error) {
    throw createPublicError(
      'INVALID_INPUT',
      'failed to read input file',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

/**
 * Protects a single JavaScript file and publishes validated artifacts atomically.
 *
 * @param {Object} params
 * @param {string} params.inputPath
 * @param {string} params.outputPath
 * @param {string} [params.reportPath]
 * @param {import('./config.js').ProtectOptions} [params.options]
 * @returns {Promise<import('./config.js').ProtectResult>}
 */
export async function protectFile({ inputPath, outputPath, reportPath, options = {} }) {
  validateInputExtension(inputPath);
  await assertNoOutputConflict({ inputPath, outputPath, reportPath });

  const sourceCode = await readInputFile(inputPath);
  const result = await protect(sourceCode, options);

  try {
    await writeFileAtomically(outputPath, result.code);

    if (reportPath !== undefined) {
      await writeFileAtomically(reportPath, `${JSON.stringify(result.metadata, null, 2)}\n`);
    }
  } catch (error) {
    await rm(normalizePath(outputPath), { force: true });
    if (reportPath !== undefined) {
      await rm(normalizePath(reportPath), { force: true });
    }
    throw error;
  }

  return result;
}
