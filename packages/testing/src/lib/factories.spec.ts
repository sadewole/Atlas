import { describe, expect, it } from 'vitest';
import { isUuidV7 } from '@atlas/shared';
import { defaultTestConfig, testConfig } from './config-factories.js';
import { eventEnvelope } from './event-factories.js';
import { dollars, money, naira } from './money-factories.js';

describe('money factories', () => {
  it('creates money in minor units', () => {
    expect(money(125000).amount).toBe(125000);
    expect(money(1000, 'USD').currency).toBe('USD');
  });

  it('creates money from major units', () => {
    expect(naira(1250).amount).toBe(125000);
    expect(dollars(10).amount).toBe(1000);
  });
});

describe('event factory', () => {
  it('creates a valid envelope with defaults', () => {
    const env = eventEnvelope({ data: { id: '1' } });
    expect(env.eventType).toBe('TestEvent');
    expect(env.producer).toBe('test-service');
    expect(env.eventVersion).toBe(1);
    expect(isUuidV7(env.eventId)).toBe(true);
    expect(isUuidV7(env.correlationId)).toBe(true);
  });

  it('allows overriding fields', () => {
    const env = eventEnvelope({
      data: { id: '1' },
      eventType: 'TransferCompleted',
      eventVersion: 2,
    });
    expect(env.eventType).toBe('TransferCompleted');
    expect(env.eventVersion).toBe(2);
  });
});

describe('config factories', () => {
  it('produces a test config', () => {
    const config = testConfig();
    expect(config.NODE_ENV).toBe('test');
    expect(config.SERVICE_NAME).toBe('test-service');
  });

  it('returns default values ready for tests', () => {
    expect(defaultTestConfig().LOG_LEVEL).toBe('silent');
    expect(defaultTestConfig().PORT).toBe(0);
  });
});
