/**
 * @fileoverview Definição de erros públicos padronizados e sanitização para o js-condom.
 *
 * Garante que qualquer erro exposto pela API ou pela CLI contenha apenas códigos
 * e mensagens aprovados, removendo dados sensíveis como código-fonte, segredos,
 * tokens e stack traces antes da serialização.
 */

/**
 * Catálogo canônico de códigos de erro públicos do js-condom.
 * Qualquer erro exposto para consumidores deve utilizar exclusivamente um destes códigos.
 */
export const PUBLIC_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'INVALID_CONFIG',
  'UNSUPPORTED_SYNTAX',
  'SEMANTIC_HAZARD',
  'PROTECTION_FAILED',
  'OUTPUT_CONFLICT',
  'INTERNAL_ERROR',
]);

const PUBLIC_ERROR_CODE_SET = new Set(PUBLIC_ERROR_CODES);

/**
 * Chaves explicitamente bloqueadas no payload de detalhes de erros para
 * evitar vazamento acidental de código-fonte, credenciais e stack traces.
 */
const BLOCKED_DETAIL_KEYS = new Set([
  'sourceCode',
  'outputCode',
  'code',
  'stack',
  'stackTrace',
  'secret',
  'token',
  'password',
  'credentials',
  'apiKey',
  'auth',
]);

/**
 * Verifica se a chave de detalhe é considerada potencialmente sensível.
 *
 * @param {string} key - Nome da chave a ser verificada.
 * @returns {boolean} True se a chave deve ser descartada.
 */
function isBlockedDetailKey(key) {
  const normalized = key.toLowerCase();
  return (
    BLOCKED_DETAIL_KEYS.has(key) ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('credential') ||
    normalized.includes('apikey')
  );
}

/**
 * Sanitiza recursivamente valores de detalhes de erro, truncando strings longas
 * e filtrando chaves ou estruturas sensíveis.
 *
 * @param {unknown} value - Valor a ser sanitizado.
 * @param {number} [depth=0] - Nível atual de recursão (limite de 4 níveis).
 * @returns {unknown} Valor sanitizado ou undefined se descartado.
 */
function sanitizeValue(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.length > 200 ? undefined : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return sanitizedArray.length > 0 ? sanitizedArray : undefined;
  }

  if (typeof value === 'object') {
    const sanitizedObj = {};
    for (const [k, v] of Object.entries(value)) {
      if (isBlockedDetailKey(k)) {
        continue;
      }
      const sanitizedChild = sanitizeValue(v, depth + 1);
      if (sanitizedChild !== undefined) {
        sanitizedObj[k] = sanitizedChild;
      }
    }
    return Object.keys(sanitizedObj).length > 0 ? sanitizedObj : undefined;
  }

  return undefined;
}

/**
 * Sanitiza o objeto de detalhes de um erro público.
 *
 * @param {Record<string, unknown> | undefined} details - Objeto original de detalhes.
 * @returns {Record<string, unknown> | undefined} Objeto sanitizado ou undefined.
 */
function sanitizeDetails(details) {
  if (details === null || details === undefined || typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }

  const result = sanitizeValue(details, 0);
  return result && typeof result === 'object' && !Array.isArray(result) ? result : undefined;
}

/**
 * Classe base de erro do js-condom com código padronizado.
 */
export class JsCondomError extends Error {
  /**
   * @param {string} code - Código canônico de erro (deve estar em PUBLIC_ERROR_CODES).
   * @param {string} message - Mensagem descritiva e segura.
   * @param {Record<string, unknown>} [details={}] - Metadados de diagnóstico adicionais.
   */
  constructor(code, message, details = {}) {
    if (!PUBLIC_ERROR_CODE_SET.has(code)) {
      throw new TypeError(`unknown public error code: ${code}`);
    }

    super(message);
    this.name = 'JsCondomError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Construtor auxiliar para criar instâncias padronizadas de JsCondomError.
 *
 * @param {string} code - Código de erro canônico.
 * @param {string} message - Mensagem pública segura.
 * @param {Record<string, unknown>} [details] - Detalhes opcionais de diagnóstico.
 * @returns {JsCondomError}
 */
export function createPublicError(code, message, details) {
  return new JsCondomError(code, message, details ?? {});
}

/**
 * Serializa um erro em um payload seguro e auditável, garantindo que
 * nenhuma informação interna ou sigilosa seja vazada no stdout/stderr ou em respostas.
 *
 * @param {unknown} error - O erro capturado.
 * @returns {{ code: string, message: string, details?: Record<string, unknown> }}
 */
export function serializePublicError(error) {
  if (!(error instanceof JsCondomError)) {
    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  const serialized = {
    code: error.code,
    message: error.message,
  };

  const details = sanitizeDetails(error.details);
  if (details !== undefined) {
    serialized.details = details;
  }

  return serialized;
}

