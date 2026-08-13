import { PubSub, Subscription } from '@google-cloud/pubsub';
import { EventEnvelope } from './envelope.js';
import { EventSubscriber, EventSubscription } from './subscriber.js';

export interface PubSubSubscriptionOptions {
  /** Emulator host, e.g. "localhost:8085". */
  emulatorHost?: string;
  /** GCP project id. */
  projectId?: string;
  /** Subscription name, e.g. "wallet-service-ledger". */
  subscriptionName: string;
  /** Topic this subscription pulls from, e.g. "ledger.events". */
  topic: string;
}

/**
 * Google Pub/Sub transport for consuming domain events.
 *
 * Binds to one subscription (which pulls from one topic) and routes decoded
 * envelopes to registered handlers by eventType. Handlers must be idempotent
 * (dedupe by eventId): Pub/Sub is at-least-once, so a message may arrive more
 * than once.
 */
export class PubSubEventSubscriber implements EventSubscriber {
  private readonly pubsub: PubSub;
  private readonly subscriptionName: string;
  private readonly topic: string;
  private readonly handlers: EventSubscription[] = [];
  private subscription: Subscription | null = null;

  constructor(options: PubSubSubscriptionOptions) {
    this.subscriptionName = options.subscriptionName;
    this.topic = options.topic;
    this.pubsub = new PubSub({
      projectId: options.projectId ?? process.env.PUBSUB_PROJECT_ID,
      apiEndpoint: options.emulatorHost ?? process.env.PUBSUB_EMULATOR_HOST,
      ...(options.emulatorHost || process.env.PUBSUB_EMULATOR_HOST
        ? { projectId: options.projectId ?? process.env.PUBSUB_PROJECT_ID ?? 'atlas-dev' }
        : {}),
    });
  }

  async subscribe(subscription: EventSubscription): Promise<void> {
    this.handlers.push(subscription);
  }

  /** Create the subscription (if missing) and start the pull loop. */
  async start(): Promise<void> {
    await this.ensureSubscription();
    this.subscription = this.pubsub.subscription(this.subscriptionName);

    this.subscription.on('message', async (message) => {
      try {
        const envelope = JSON.parse(message.data.toString()) as EventEnvelope;
        for (const handler of this.handlers) {
          if (
            !handler.eventTypes ||
            handler.eventTypes.length === 0 ||
            handler.eventTypes.includes(envelope.eventType)
          ) {
            await handler.handle(envelope);
          }
        }
        message.ack();
      } catch (err) {
        // At-least-once: don't ack on failure so the message is redelivered.
        message.nack();
        console.error('Pub/Sub handler failed', err);
      }
    });
    this.subscription.on('error', (err) => {
      console.error('Pub/Sub subscription error', err);
    });
  }

  private async ensureSubscription(): Promise<void> {
    const topicRef = this.pubsub.topic(this.topic);
    try {
      const [topicExists] = await topicRef.exists();
      if (!topicExists) await topicRef.create();
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS ok
    }

    const subRef = this.pubsub.subscription(this.subscriptionName);
    const [subExists] = await subRef.exists();
    if (!subExists) {
      try {
        await this.pubsub.createSubscription(this.topic, this.subscriptionName);
      } catch (err) {
        if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS ok
      }
    }
  }
}
