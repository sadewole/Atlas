import { newId } from '@atlas/shared';
import {
  createEnvelope,
  EventEnvelope,
  EventEnvelopeOptions,
} from '@atlas/events';

export interface TestEventData {
  id: string;
}

/**
 * Create a ready-to-publish event envelope for tests. Supplies sensible
 * defaults so tests only override what they care about.
 */
export function eventEnvelope<TData = TestEventData>(
  overrides: Partial<EventEnvelopeOptions<TData>> & { data: TData },
): EventEnvelope<TData> {
  return createEnvelope<TData>({
    eventType: 'TestEvent',
    correlationId: newId(),
    producer: 'test-service',
    eventVersion: 1,
    ...overrides,
  });
}
