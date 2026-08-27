/**
 * @fileoverview Configuração canônica e preset versionado para o js-condom.
 *
 * Define o PRESET_V1 (versão 1.0.0), a resolução de opções de proteção,
 * a extração de versões de dependências e a serialização canônica e ordenada
 * de metadados para cálculo de hashes criptográficos estáveis.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicError } from './errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PACKAGE_JSON_PATH = join(__dirname, '../../package.json');
const ENGINE_PACKAGE_JSON_PATH = join(
  __dirname,
  '../../node_modules/javascript-obfuscator/package.json',
);

/**
 * Versão do preset de proteção ativo no js-condom.
 * Qualquer alteração de flags no preset requer incremento de versão e requalificação.
 */
export const PRESET_VERSION = '1.0.0';

/**
 * Conjunto de chaves de opções públicas permitidas na API protect().
 */
export const ALLOWED_OPTION_KEYS = Object.freeze(new Set(['seed']));

/**
 * Definição canônica do PRESET_V1.
 *
 * Racional das escolhas de configuração:
 * - compact: true -> Minifica o código gerado.
 * - controlFlowFlattening: false -> Desativado para evitar quebras semânticas e custos de runtime abusivos.
 * - deadCodeInjection: false -> Desativado para preservar integridade de execução e determinismo.
 * - identifierNamesGenerator: 'hexadecimal' -> Renomeia identificadores para padrão hexadecimal estável.
 * - renameGlobals: false -> Garante compatibilidade com ambientes que compartilham escopo global (Node/Browser).
 * - selfDefending: false -> Desativado para evitar armadilhas de runtime, loops infinitos e travamentos em debugging legítimo.
 * - simplify: true -> Simplifica expressões primitivas sem quebra semântica.
 * - stringArray: true -> Extrai strings literais para tabela centralizada.
 * - stringArrayShuffle: true -> Embaralha a tabela de strings com base na seed fornecida.
 * - target: 'browser' -> Produz código compatível com browser e runtimes Node.js modernos.
 * - unicodeEscapeSequence: false -> Mantém legibilidade básica dos caracteres sem inflar o tamanho do bundle.
 */
export const PRESET_V1 = Object.freeze({
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  stringArray: true,
  stringArrayShuffle: true,
  target: 'browser',
  unicodeEscapeSequence: false,
});

/**
 * @typedef {Object} ProtectOptions
 * @property {string} [seed] Seed opcional para builds determinísticos. Quando omitida, uma seed aleatória de 16 bytes é gerada.
 */

/**
 * @typedef {Object} ResolvedProtectionConfig
 * @property {string} seedUsed - Seed efetivamente utilizada no processo.
 * @property {string} presetVersion - Versão do preset aplicado (ex: "1.0.0").
 * @property {string} engineVersion - Versão qualificada do javascript-obfuscator.
 * @property {Readonly<typeof PRESET_V1>} preset - Configuração de flags repassadas à engine.
 */

/**
 * @typedef {Object} ProtectionMetadata
 * @property {string} toolVersion - Versão do js-condom.
 * @property {string} engineVersion - Versão do motor javascript-obfuscator.
 * @property {string} presetVersion - Versão do preset utilizado.
 * @property {string} seedUsed - Seed utilizada na transformação.
 * @property {string} inputSha256 - Hash SHA-256 do código de entrada.
 * @property {string} outputSha256 - Hash SHA-256 do código protegido gerado.
 * @property {string} configSha256 - Hash SHA-256 da configuração canônica ordenada.
 */

/**
 * @typedef {Object} ProtectResult
 * @property {string} code - Código JavaScript protegido.
 * @property {ProtectionMetadata} metadata - Metadados e hashes de auditoria.
 */

/**
 * Ordena recursivamente as chaves de um objeto para garantir serialização determinística em JSON.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function sortValue(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortValue(value[key]);
  }
  return sorted;
}

/**
 * Lê a versão atual do pacote js-condom a partir do package.json raiz.
 *
 * @returns {string}
 */
export function getToolVersion() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

/**
 * Lê a versão qualificada do javascript-obfuscator instalada em node_modules.
 *
 * @returns {string}
 */
export function getEngineVersion() {
  const packageJson = JSON.parse(readFileSync(ENGINE_PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

/**
 * Valida se o código de entrada atende aos requisitos mínimos (string não vazia).
 *
 * @param {unknown} sourceCode
 * @throws {import('./errors.js').JsCondomError} Caso a entrada seja nula, não-string ou vazia.
 */
export function validateProtectInput(sourceCode) {
  if (typeof sourceCode !== 'string' || sourceCode.length === 0) {
    throw createPublicError(
      'INVALID_INPUT',
      'sourceCode must be a non-empty string',
      { sourceCodeType: typeof sourceCode },
    );
  }
}

/**
 * Gera uma seed criptograficamente segura de 16 bytes em formato hexadecimal.
 *
 * @returns {string}
 */
function generateSeedUsed() {
  return randomBytes(16).toString('hex');
}

/**
 * Resolve a seed efetiva a partir das opções fornecidas ou gera uma nova.
 *
 * @param {ProtectOptions} options
 * @returns {string}
 */
function resolveSeedUsed(options) {
  if (!('seed' in options)) {
    return generateSeedUsed();
  }

  const { seed } = options;
  if (typeof seed !== 'string' || seed.length === 0) {
    throw createPublicError(
      'INVALID_CONFIG',
      'seed must be a non-empty string when provided',
      { key: 'seed' },
    );
  }

  return seed;
}

/**
 * Valida o objeto de opções do consumidor e monta a configuração de proteção resolvida.
 *
 * @param {ProtectOptions} [options={}]
 * @returns {ResolvedProtectionConfig}
 * @throws {import('./errors.js').JsCondomError} Caso sejam passadas opções desconhecidas ou inválidas.
 */
export function resolveProtectionConfig(options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw createPublicError(
      'INVALID_CONFIG',
      'options must be a plain object',
      { optionsType: typeof options },
    );
  }

  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw createPublicError(
        'INVALID_CONFIG',
        `unknown option: ${key}`,
        { key },
      );
    }
  }

  const seedUsed = resolveSeedUsed(options);

  return {
    seedUsed,
    presetVersion: PRESET_VERSION,
    engineVersion: getEngineVersion(),
    preset: PRESET_V1,
  };
}

/**
 * Constrói o registro canônico da configuração utilizada para cálculo de hash.
 *
 * @param {ResolvedProtectionConfig} resolvedConfig
 * @returns {Record<string, unknown>}
 */
export function buildConfigRecord(resolvedConfig) {
  return sortValue({
    engineVersion: resolvedConfig.engineVersion,
    presetVersion: resolvedConfig.presetVersion,
    preset: { ...resolvedConfig.preset },
    seedUsed: resolvedConfig.seedUsed,
  });
}

/**
 * Serializa de forma determinística e canônica o registro de configuração.
 *
 * @param {Record<string, unknown>} configRecord
 * @returns {string}
 */
export function serializeConfigRecord(configRecord) {
  return JSON.stringify(sortValue(configRecord));
}

