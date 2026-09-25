/**
 * @fileoverview Orquestrador principal de proteção (core protect) do js-condom.
 *
 * Executa o pipeline determinístico e seguro de proteção:
 * 1. Validação de formato da entrada (string não vazia).
 * 2. Resolução de configuração e projeção de seed (config v1 estável).
 * 3. Análise estática de AST para detecção de riscos semânticos (eval, Function, with, toString).
 * 4. Ofuscação via engine qualificada (`javascript-obfuscator@4.1.0`).
 * 5. Validação sintática do código gerado, sem executá-lo no processo host.
 * 6. Geração de metadados reprodutíveis e hashes criptográficos SHA-256.
 */

import JavaScriptObfuscator from 'javascript-obfuscator';
import { resolveProtectionConfig, validateProtectInput } from './config.js';
import { createPublicError } from './errors.js';
import { analyzeSemanticHazards, validateProtectedSyntax } from './hazard-policy.js';
import { buildProtectionMetadata } from './metadata.js';

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

  // 5. Validação sintática da AST do artefato resultante.
  // O artefato não é importado nem executado neste processo.
  validateProtectedSyntax(outputCode);

  // 6. Composição e retorno do resultado com metadados e hashes auditáveis
  return {
    code: outputCode,
    metadata: buildProtectionMetadata({
      sourceCode,
      outputCode,
      resolvedConfig,
    }),
  };
}

