import { newId } from '../ids/uuid.js';

/**
 * Correlation IDs tie every request, log line, event, and trace to a single
 * business workflow across all services (per SAS section 11).
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const REQUEST_ID_HEADER = 'x-request-id';

export interface CorrelationContext {
  correlationId: string;
  /** Present when the caller supplied one; generated otherwise. */
  provided?: boolean;
}

/** Generate a fresh correlation ID (UUIDv7). */
export function newCorrelationId(): string {
  return newId();
}

/** Create a correlation context from an incoming header value, if any. */
export function createCorrelationContext(
  headerValue?: string,
): CorrelationContext {
  if (headerValue && headerValue.trim().length > 0) {
    return { correlationId: headerValue.trim(), provided: true };
  }
  return { correlationId: newCorrelationId(), provided: false };
}
