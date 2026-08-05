import { describe, expect, it } from 'vitest';
import {
  AtlasError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from './atlas-error.js';

describe('AtlasError', () => {
  it('carries a stable code and HTTP status', () => {
    const err = new AtlasError('PAYMENT_NOT_FOUND', 'Payment not found', {
      statusCode: 404,
    });
    expect(err.code).toBe('PAYMENT_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Payment not found');
    expect(err.name).toBe('AtlasError');
  });

  it('defaults to 500 when no status is provided', () => {
    expect(new AtlasError('INTERNAL', 'boom').statusCode).toBe(500);
  });

  it('attaches request context for correlation', () => {
    const err = new AtlasError('PAYMENT_NOT_FOUND', 'Payment not found', {
      statusCode: 404,
    });
    err.withRequestContext({ requestId: 'req_1', correlationId: 'corr_1' });
    expect(err.requestId).toBe('req_1');
    expect(err.correlationId).toBe('corr_1');
  });

  it('serializes to the standard API error body', () => {
    const err = new AtlasError('PAYMENT_NOT_FOUND', 'Payment not found', {
      statusCode: 404,
      details: [{ field: 'paymentId', reason: 'Unknown payment' }],
    }).withRequestContext({ requestId: 'req_1', correlationId: 'corr_1' });

    expect(err.toResponse()).toEqual({
      error: {
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment not found',
        details: [{ field: 'paymentId', reason: 'Unknown payment' }],
        requestId: 'req_1',
        correlationId: 'corr_1',
      },
    });
  });
});

describe('typed errors', () => {
  it('maps NotFoundError to 404', () => {
    expect(new NotFoundError('WALLET_NOT_FOUND', 'x').statusCode).toBe(404);
  });
  it('maps ConflictError to 409', () => {
    expect(new ConflictError('WALLET_FROZEN', 'x').statusCode).toBe(409);
  });
  it('maps UnauthorizedError to 401', () => {
    expect(new UnauthorizedError('AUTH_INVALID', 'x').statusCode).toBe(401);
  });
  it('maps ForbiddenError to 403', () => {
    expect(new ForbiddenError('AUTH_FORBIDDEN', 'x').statusCode).toBe(403);
  });
  it('maps DomainError to 422', () => {
    expect(new DomainError('LEDGER_UNBALANCED', 'x').statusCode).toBe(422);
  });
});
