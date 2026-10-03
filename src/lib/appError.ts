export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'PAYMENT_FAILED'
  | 'INTERNAL'
  | 'UNAVAILABLE';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly messageKey: string,
    readonly details?: Record<string, string | number>,
  ) {
    super(messageKey);
    this.name = 'AppError';
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string>; requestId: string };
    };
