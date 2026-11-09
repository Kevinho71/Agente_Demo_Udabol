export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_HTTP'
  | 'UPSTREAM_INVALID'
  | 'RESPONSE_TOO_LARGE'
  | 'TOOL_NOT_ALLOWED'
  | 'INVALID_ARGUMENTS'
  | 'LLM_UNAVAILABLE'
  | 'MAX_STEPS'
  | 'CONFIGURATION';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function toPublicError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'CONFIGURATION',
    message: 'Ocurrió un error inesperado. Intenta de nuevo en unos segundos.',
  };
}
