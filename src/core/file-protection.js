/**
 * @fileoverview Operações de proteção em arquivos e publicação atômica no js-condom.
 *
 * Garante que:
 * 1. Apenas extensões suportadas (.js, .mjs, .cjs) sejam processadas.
 * 2. Nenhuma sobrescrita acidental ocorra (falha fechada para arquivos existentes).
 * 3. O arquivo protegido e o relatório de metadados sejam gravados de forma atômica
 *    (via arquivo temporário único renomeado), impedindo artefatos corrompidos ou parciais.
 * 4. Em caso de falha, qualquer artefato parcial criado seja limpo imediatamente.
 */

import { randomBytes } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { createPublicError } from './errors.js';
import { protect } from './protect.js';

/**
 * Extensões de arquivo oficialmente suportadas no MVP v1.
 */
export const SUPPORTED_EXTENSIONS = Object.freeze(new Set(['.js', '.mjs', '.cjs']));

/**
 * Normaliza um caminho para seu equivalente absoluto.
 *
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return resolve(filePath);
}

/**
 * Verifica de forma assíncrona se um arquivo ou diretório existe no disco.
 *
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida se a extensão do arquivo de entrada pertence ao subconjunto suportado.
 *
 * @param {string} inputPath - Caminho do arquivo de entrada.
 * @throws {import('./errors.js').JsCondomError} Caso a extensão não seja .js, .mjs ou .cjs.
 */
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

/**
 * Valida que os caminhos de entrada, saída e relatório não colidem entre si
 * e que os destinos ainda não existem no sistema de arquivos (fail-closed).
 *
 * @param {Object} params
 * @param {string} params.inputPath - Caminho de entrada.
 * @param {string} params.outputPath - Caminho do arquivo protegido de destino.
 * @param {string} [params.reportPath] - Caminho opcional do arquivo de relatório.
 * @throws {import('./errors.js').JsCondomError} Em caso de colisão ou arquivo existente.
 */
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

/**
 * Escreve um arquivo de forma atômica: grava primeiro em um arquivo temporário
 * com sufixo aleatório no mesmo diretório e realiza um rename atômico.
 *
 * @param {string} targetPath - Caminho final do arquivo.
 * @param {string} content - Conteúdo em texto UTF-8.
 * @throws {import('./errors.js').JsCondomError} Em caso de falha de gravação ou renomeação.
 */
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

/**
 * Gera um caminho temporário único no mesmo diretório do arquivo de destino.
 *
 * @param {string} directory
 * @param {string} fileName
 * @returns {string}
 */
function joinTempPath(directory, fileName) {
  const suffix = randomBytes(8).toString('hex');
  return resolve(directory, `.${fileName}.${suffix}.tmp`);
}

/**
 * Lê o conteúdo do arquivo de entrada com tratamento seguro de erros.
 *
 * @param {string} inputPath
 * @returns {Promise<string>}
 */
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
 * Protege um arquivo JavaScript no disco e publica o código e relatório atomicamente.
 *
 * @param {Object} params
 * @param {string} params.inputPath - Arquivo JavaScript de entrada (.js, .mjs, .cjs).
 * @param {string} params.outputPath - Caminho onde o arquivo protegido será gravado.
 * @param {string} [params.reportPath] - Caminho opcional para gravação do relatório JSON.
 * @param {import('./config.js').ProtectOptions} [params.options] - Opções de proteção (ex: seed).
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

