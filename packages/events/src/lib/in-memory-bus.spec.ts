import { describe, expect, it } from 'vitest';
import { createEnvelope } from './envelope.js';
import { InMemoryEventBus } from './in-memory-bus.js';

describe('InMemoryEventBus', () => {
  it('delivers events to subscribed handlers on the same topic', async () => {
    const bus = new InMemoryEventBus('transfer.events');
    const received: string[] = [];

    await bus.subscribe({
      topic: 'transfer.events',
      handle: async (e) => {
        received.push(e.eventType);
      },
    });

    await bus.publish(
      createEnvelope({
        eventType: 'TransferCompleted',
        correlationId: 'c',
        producer: 'transfer-service',
        data: {},
      }),
    );

    expect(received).toEqual(['TransferCompleted']);
  });

  it('does not deliver to subscriptions on other topics', async () => {
    const bus = new InMemoryEventBus('payment.events');
    const received: string[] = [];
    await bus.subscribe({
      topic: 'transfer.events',
      handle: async (e) => {
        received.push(e.eventType);
      },
    });
    await bus.publish(
      createEnvelope({
        eventType: 'PaymentCaptured',
        correlationId: 'c',
        producer: 'payment-service',
        data: {},
      }),
    );
    expect(received).toEqual([]);
  });

  it('filters by eventTypes when provided', async () => {
    const bus = new InMemoryEventBus('transfer.events');
    const received: string[] = [];
    await bus.subscribe({
      topic: 'transfer.events',
      eventTypes: ['TransferFailed'],
      handle: async (e) => {
        received.push(e.eventType);
      },
    });
    await bus.publish(
      createEnvelope({
        eventType: 'TransferCompleted',
        correlationId: 'c',
        producer: 'transfer-service',
        data: {},
      }),
    );
    expect(received).toEqual([]);
  });

  it('records published events for assertions', async () => {
    const bus = new InMemoryEventBus('transfer.events');
    await bus.publish(
      createEnvelope({
        eventType: 'TransferCompleted',
        correlationId: 'c',
        producer: 'transfer-service',
        data: {},
      }),
    );
    expect(bus.published).toHaveLength(1);
    expect(bus.eventsOfType('TransferCompleted')).toHaveLength(1);
  });

  it('runs handlers concurrently and awaits them', async () => {
    const bus = new InMemoryEventBus('transfer.events');
    let completed = false;
    await bus.subscribe({
      topic: 'transfer.events',
      handle: async () => {
        await new Promise((r) => setTimeout(r, 5));
        completed = true;
      },
    });
    await bus.publish(
      createEnvelope({
        eventType: 'TransferCompleted',
        correlationId: 'c',
        producer: 'transfer-service',
        data: {},
      }),
    );
    expect(completed).toBe(true);
  });
});
