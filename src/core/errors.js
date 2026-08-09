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
]);

function isBlockedDetailKey(key) {
  const normalized = key.toLowerCase();
  return (
    BLOCKED_DETAIL_KEYS.has(key) ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('token')
  );
}

function sanitizeDetails(details) {
  if (details === null || details === undefined) {
    return undefined;
  }

  if (typeof details !== 'object' || Array.isArray(details)) {
    return undefined;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(details)) {
    if (isBlockedDetailKey(key)) {
      continue;
    }

    if (typeof value === 'string' && value.length > 200) {
      continue;
    }

    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export class JsCondomError extends Error {
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

export function createPublicError(code, message, details) {
  return new JsCondomError(code, message, details ?? {});
}

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
