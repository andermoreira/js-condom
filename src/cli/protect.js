#!/usr/bin/env node
/**
 * @fileoverview Ponto de entrada da CLI do js-condom (`js-condom protect`).
 *
 * Oferece interface de linha de comando para proteção de arquivos JS únicos,
 * validação rigorosa de argumentos com fail-closed, escrita de relatório opcional
 * e serialização padronizada de erros para stderr em formato JSON.
 */

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { protectFile } from '../core/file-protection.js';
import {
  JsCondomError,
  createPublicError,
  serializePublicError,
} from '../core/errors.js';

/**
 * Esquema de opções suportadas pela CLI.
 */
const CLI_OPTIONS = {
  output: { type: 'string' },
  report: { type: 'string' },
  seed: { type: 'string' },
};

/**
 * @typedef {Object} ParsedProtectCliArgs
 * @property {string} inputPath - Caminho do arquivo de entrada.
 * @property {string} outputPath - Caminho do arquivo protegido gerado.
 * @property {string | undefined} reportPath - Caminho do relatório de auditoria (opcional).
 * @property {import('../core/config.js').ProtectOptions} options - Opções passadas ao core.
 */

/**
 * Realiza o parsing e a validação estrita dos argumentos da CLI.
 *
 * @param {string[]} argv - Array de argumentos do processo (geralmente process.argv).
 * @returns {ParsedProtectCliArgs}
 * @throws {import('../core/errors.js').JsCondomError} Em caso de comando desconhecido ou flag ausente.
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
 * Executa o fluxo da CLI de proteção com tratamento de exceções e código de saída.
 *
 * @param {string[]} argv - Argumentos de linha de comando.
 * @returns {Promise<number>} Código de saída do processo (0 para sucesso, 1 para erro).
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

// Detecção de execução como módulo principal para execução automática
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const exitCode = await runProtectCli(process.argv);
  process.exit(exitCode);
}

