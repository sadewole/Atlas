export interface ErrorDetail {
  field?: string;
  reason: string;
}

/**
 * The standardized error response body required by the API Standards:
 * { "error": { "code": "...", "message": "...", "details": [], "requestId": "...", "correlationId": "..." } }
 */
export interface ErrorBody {
  code: string;
  message: string;
  details: ErrorDetail[];
  requestId?: string;
  correlationId?: string;
}

export interface ApiErrorResponse {
  error: ErrorBody;
}

/**
 * Base class for all Atlas domain errors.
 *
 * Every error carries a stable machine-readable `code` (domain-prefixed,
 * e.g. PAYMENT_NOT_FOUND) and an HTTP status so controllers can map it to a
 * response without switch statements.
 */
export class AtlasError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: ErrorDetail[];
  requestId?: string;
  correlationId?: string;

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; details?: ErrorDetail[] } = {},
  ) {
    super(message);
    this.name = 'AtlasError';
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details ?? [];
  }

  /** Attach request metadata and return `this` for chaining. */
  withRequestContext(context: {
    requestId?: string;
    correlationId?: string;
  }): this {
    this.requestId = context.requestId;
    this.correlationId = context.correlationId;
    return this;
  }

  toBody(): ErrorBody {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      requestId: this.requestId,
      correlationId: this.correlationId,
    };
  }

  toResponse(): ApiErrorResponse {
    return { error: this.toBody() };
  }
}

/** Base class for domain errors that map to a specific HTTP status. */
export class DomainError extends AtlasError {
  constructor(
    code: string,
    message: string,
    options: { details?: ErrorDetail[] } = {},
    statusCode = 422,
  ) {
    super(code, message, { ...options, statusCode });
    this.name = 'DomainError';
  }
}

/** 404-style error, e.g. PAYMENT_NOT_FOUND. */
export class NotFoundError extends AtlasError {
  constructor(code: string, message: string) {
    super(code, message, { statusCode: 404 });
    this.name = 'NotFoundError';
  }
}

/** 409-style error, e.g. PAYMENT_ALREADY_CAPTURED. */
export class ConflictError extends AtlasError {
  constructor(code: string, message: string) {
    super(code, message, { statusCode: 409 });
    this.name = 'ConflictError';
  }
}

/** 401-style error. */
export class UnauthorizedError extends AtlasError {
  constructor(code: string, message: string) {
    super(code, message, { statusCode: 401 });
    this.name = 'UnauthorizedError';
  }
}

/** 403-style error. */
export class ForbiddenError extends AtlasError {
  constructor(code: string, message: string) {
    super(code, message, { statusCode: 403 });
    this.name = 'ForbiddenError';
  }
}
