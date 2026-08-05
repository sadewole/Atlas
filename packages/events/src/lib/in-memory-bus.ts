import { EventEnvelope } from './envelope.js';
import { EventPublisher } from './publisher.js';
import { EventSubscriber, EventSubscription } from './subscriber.js';

/**
 * In-memory event bus. Used by unit tests and the Docker Compose dev setup
 * before Google Pub/Sub emulator is wired in. Not durable — do not use for
 * production financial workflows (use the Outbox pattern + real Pub/Sub).
 */
export class InMemoryEventBus implements EventPublisher, EventSubscriber {
  readonly topic: string;
  private readonly subscriptions: EventSubscription[] = [];
  /** All events ever published, for assertions in tests. */
  readonly published: EventEnvelope[] = [];

  constructor(topic: string) {
    this.topic = topic;
  }

  async publish<TData>(envelope: EventEnvelope<TData>): Promise<void> {
    this.published.push(envelope);
    await Promise.all(
      this.subscriptions
        .filter(
          (s) =>
            s.topic === this.topic &&
            (!s.eventTypes ||
              s.eventTypes.length === 0 ||
              s.eventTypes.includes(envelope.eventType)),
        )
        .map(async (s) => s.handle(envelope)),
    );
  }

  async subscribe(subscription: EventSubscription): Promise<void> {
    this.subscriptions.push(subscription);
  }

  /** Events of a given type, for test assertions. */
  eventsOfType<T>(eventType: string): EventEnvelope<T>[] {
    return this.published.filter(
      (e) => e.eventType === eventType,
    ) as EventEnvelope<T>[];
  }
}
