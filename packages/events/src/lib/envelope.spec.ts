import { describe, expect, it } from 'vitest';
import { isUuidV7 } from '@atlas/shared';
import { createEnvelope, EventEnvelope } from './envelope.js';

describe('createEnvelope', () => {
  const base = {
    eventType: 'TransferCompleted',
    correlationId: 'corr-123',
    producer: 'transfer-service',
    tenantId: 'org_abc',
    data: { transferId: 'txn_1', amount: 100000 },
  };

  it('builds a complete envelope', () => {
    const env = createEnvelope(base);
    expect(env.eventType).toBe('TransferCompleted');
    expect(env.eventVersion).toBe(1);
    expect(env.correlationId).toBe('corr-123');
    expect(env.producer).toBe('transfer-service');
    expect(env.tenantId).toBe('org_abc');
    expect(env.data).toEqual(base.data);
    expect(isUuidV7(env.eventId)).toBe(true);
    expect(new Date(env.occurredAt).toISOString()).toBe(env.occurredAt);
  });

  it('propagates causationId', () => {
    const env = createEnvelope({ ...base, causationId: 'parent-event-1' });
    expect(env.causationId).toBe('parent-event-1');
  });

  it('honors explicit eventVersion', () => {
    const env = createEnvelope({ ...base, eventVersion: 2 });
    expect(env.eventVersion).toBe(2);
  });

  it('respects an eventId override', () => {
    const env = createEnvelope({ ...base, eventId: 'fixed-id' });
    expect(env.eventId).toBe('fixed-id');
  });

  it('allows omission of tenantId', () => {
    const { tenantId, ...rest } = base;
    const env = createEnvelope(rest);
    expect(env.tenantId).toBeUndefined();
  });

  it('types the data payload', () => {
    interface TransferData {
      transferId: string;
      amount: number;
    }
    const env: EventEnvelope<TransferData> = createEnvelope<TransferData>(base);
    expect(env.data.transferId).toBe('txn_1');
  });
});
