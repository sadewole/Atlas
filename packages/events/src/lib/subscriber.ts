import { EventEnvelope } from './envelope.js';

export interface EventSubscription<TData = unknown> {
  readonly topic: string;
  /** Event types this handler wants. Empty array = all types on the topic. */
  readonly eventTypes?: string[];
  handle(event: EventEnvelope<TData>): Promise<void>;
}

/**
 * Port for consuming domain events. Services implement this interface and
 * register subscriptions with their transport.
 */
export interface EventSubscriber {
  subscribe(subscription: EventSubscription): Promise<void>;
}
