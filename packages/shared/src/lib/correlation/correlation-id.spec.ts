import { describe, expect, it } from 'vitest';
import {
  CORRELATION_ID_HEADER,
  createCorrelationContext,
  newCorrelationId,
} from './correlation-id.js';
import { isUuidV7 } from '../ids/uuid.js';

describe('correlation ids', () => {
  it('generates UUIDv7 correlation ids', () => {
    expect(isUuidV7(newCorrelationId())).toBe(true);
  });

  it('defines the standard header name', () => {
    expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
  });

  it('propagates a provided header value', () => {
    const ctx = createCorrelationContext('provided-id-123');
    expect(ctx.correlationId).toBe('provided-id-123');
    expect(ctx.provided).toBe(true);
  });

  it('generates a fresh id when none is provided', () => {
    const ctx = createCorrelationContext(undefined);
    expect(isUuidV7(ctx.correlationId)).toBe(true);
    expect(ctx.provided).toBe(false);
  });

  it('treats blank headers as absent', () => {
    const ctx = createCorrelationContext('   ');
    expect(ctx.provided).toBe(false);
  });
});
