import { EventEnvelope } from './envelope.js';

/**
 * Port for publishing domain events. Services depend on this interface, never
 * on a concrete transport (Google Pub/Sub, in-memory for tests, etc.).
 */
export interface EventPublisher {
  /**
   * Publish an event to the bus. Implementations must provide at-least-once
   * delivery; consumers must be idempotent.
   */
  publish<TData>(envelope: EventEnvelope<TData>): Promise<void>;

  /** The Pub/Sub topic this publisher writes to, e.g. "transfer.events". */
  readonly topic: string;
}
