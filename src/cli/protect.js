#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { protectFile } from '../core/file-protection.js';
import {
  JsCondomError,
  createPublicError,
  serializePublicError,
} from '../core/errors.js';

const CLI_OPTIONS = {
  output: { type: 'string' },
  report: { type: 'string' },
  seed: { type: 'string' },
};

/**
 * @typedef {Object} ParsedProtectCliArgs
 * @property {string} inputPath
 * @property {string} outputPath
 * @property {string | undefined} reportPath
 * @property {import('../core/config.js').ProtectOptions} options
 */

/**
 * @param {string[]} argv
 * @returns {ParsedProtectCliArgs}
 */
export function parseProtectCliArgs(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    throw createPublicError(
      'INVALID_INPUT',
      'usage: js-condom protect <input> --output <path> [--report <path>] [--seed <seed>]',
    );
  }

  if (args[0] !== 'protect') {
    throw createPublicError(
      'INVALID_INPUT',
      'unknown command; expected "protect"',
      { command: args[0] },
    );
  }

  const { positionals, values } = parseArgs({
    args: args.slice(1),
    options: CLI_OPTIONS,
    allowPositionals: true,
    strict: true,
  });

  if (positionals.length !== 1) {
    throw createPublicError(
      'INVALID_INPUT',
      'exactly one input file is required',
      { inputCount: positionals.length },
    );
  }

  if (!values.output) {
    throw createPublicError(
      'INVALID_INPUT',
      '--output is required',
    );
  }

  const options = {};
  if (values.seed !== undefined) {
    options.seed = values.seed;
  }

  return {
    inputPath: positionals[0],
    outputPath: values.output,
    reportPath: values.report,
    options,
  };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runProtectCli(argv) {
  try {
    const parsed = parseProtectCliArgs(argv);
    await protectFile(parsed);
    return 0;
  } catch (error) {
    const serialized = serializePublicError(
      error instanceof JsCondomError ? error : createPublicError('INTERNAL_ERROR', 'An unexpected error occurred'),
    );
    console.error(JSON.stringify(serialized));
    return 1;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const exitCode = await runProtectCli(process.argv);
  process.exit(exitCode);
}
