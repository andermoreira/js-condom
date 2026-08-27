/**
 * @fileoverview Orquestrador principal de proteção (core protect) do js-condom.
 *
 * Executa o pipeline determinístico e seguro de proteção:
 * 1. Validação de formato da entrada (string não vazia).
 * 2. Resolução de configuração e projeção de seed (config v1 estável).
 * 3. Análise estática de AST para detecção de riscos semânticos (eval, Function, with, toString).
 * 4. Ofuscação via engine qualificada (`javascript-obfuscator@4.1.0`).
 * 5. Validação sintática do código gerado.
 * 6. Smoke test de carregamento em isolamento temporário.
 * 7. Geração de metadados reprodutíveis e hashes criptográficos SHA-256.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { resolveProtectionConfig, validateProtectInput } from './config.js';
import { createPublicError } from './errors.js';
import {
  analyzeSemanticHazards,
  detectSourceType,
  validateProtectedSyntax,
} from './hazard-policy.js';
import { buildProtectionMetadata } from './metadata.js';

/**
 * Realiza teste de fumaça (smoke load) para validar que o código protegido
 * é carregável como módulo ou script sem quebrar a inicialização do runtime.
 *
 * @param {string} sourceCode - Código protegido gerado.
 * @throws {import('./errors.js').JsCondomError} Caso o código falhe na carga.
 */
async function smokeLoadProtectedCode(sourceCode) {
  const sourceType = detectSourceType(sourceCode);
  const extension = sourceType === 'module' ? '.mjs' : '.cjs';
  const workDir = await mkdtemp(join(tmpdir(), 'js-condom-smoke-'));

  try {
    const filePath = join(workDir, `smoke${extension}`);
    await writeFile(filePath, sourceCode, 'utf8');
    await import(pathToFileURL(filePath).href);
  } catch (error) {
    throw createPublicError(
      'PROTECTION_FAILED',
      'protected code failed execution smoke test',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Protege código-fonte JavaScript utilizando o preset de proteção versionado.
 *
 * @param {string} sourceCode - Código-fonte JavaScript (bundle único ESM ou CJS).
 * @param {import('./config.js').ProtectOptions} [options={}] - Opções de execução (ex: seed).
 * @returns {Promise<import('./config.js').ProtectResult>} Código protegido e metadados de auditoria.
 * @throws {import('./errors.js').JsCondomError} Em caso de falha de validação, sintaxe ou ofuscação.
 */
export async function protect(sourceCode, options = {}) {
  // 1. Validação de tipo e conteúdo da entrada
  validateProtectInput(sourceCode);

  // 2. Resolução da configuração v1 e seed efetiva
  const resolvedConfig = resolveProtectionConfig(options);

  // 3. Análise semântica preventiva de construções perigosas
  analyzeSemanticHazards(sourceCode);

  // 4. Execução da ofuscação com o preset congelado
  let outputCode;
  try {
    outputCode = JavaScriptObfuscator.obfuscate(sourceCode, {
      ...resolvedConfig.preset,
      seed: resolvedConfig.seedUsed,
    }).getObfuscatedCode();
  } catch (error) {
    throw createPublicError(
      'PROTECTION_FAILED',
      'javascript-obfuscator failed to protect input',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  // 5. Validação sintática da AST do artefato resultante
  validateProtectedSyntax(outputCode);

  // 6. Teste de fumaça de importação
  await smokeLoadProtectedCode(outputCode);

  // 7. Composição e retorno do resultado com metadados e hashes auditáveis
  return {
    code: outputCode,
    metadata: buildProtectionMetadata({
      sourceCode,
      outputCode,
      resolvedConfig,
    }),
  };
}

