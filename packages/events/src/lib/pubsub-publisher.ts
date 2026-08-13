import { PubSub, Topic } from '@google-cloud/pubsub';
import { EventEnvelope } from './envelope.js';
import { EventPublisher } from './publisher.js';

export interface PubSubClientOptions {
  /**
   * Emulator host, e.g. "localhost:8085" (Docker Compose dev). When set, the
   * client talks to the local emulator instead of real GCP.
   */
  emulatorHost?: string;
  /** GCP project id, e.g. "atlas-dev". Only used with a real backend. */
  projectId?: string;
}

/**
 * Google Pub/Sub transport for publishing domain events.
 *
 * In development this points at the local emulator (PUBSUB_EMULATOR_HOST);
 * in production it uses real Pub/Sub (GOOGLE_APPLICATION_CREDENTIALS).
 */
export class PubSubEventPublisher implements EventPublisher {
  readonly topic: string;
  private readonly topicRef: Topic;

  constructor(topic: string, options: PubSubClientOptions = {}) {
    this.topic = topic;
    const pubsub = new PubSub({
      projectId: options.projectId ?? process.env.PUBSUB_PROJECT_ID,
      apiEndpoint: options.emulatorHost ?? process.env.PUBSUB_EMULATOR_HOST,
      ...(options.emulatorHost || process.env.PUBSUB_EMULATOR_HOST
        ? { projectId: options.projectId ?? process.env.PUBSUB_PROJECT_ID ?? 'atlas-dev' }
        : {}),
    });
    this.topicRef = pubsub.topic(topic);
  }

  /** Create the topic if it doesn't exist (idempotent). Call at boot. */
  async ensureTopic(): Promise<void> {
    try {
      const [exists] = await this.topicRef.exists();
      if (!exists) {
        await this.topicRef.create();
      }
    } catch (err) {
      // A concurrent creator may have won the race; ALREADY_EXISTS is fine.
      if ((err as { code?: number }).code === 6) return;
      throw err;
    }
  }

  async publish<TData>(envelope: EventEnvelope<TData>): Promise<void> {
    const dataBuffer = Buffer.from(JSON.stringify(envelope));
    const messageId = await this.topicRef.publishMessage({
      data: dataBuffer,
      attributes: {
        eventType: envelope.eventType,
        eventVersion: String(envelope.eventVersion),
        producer: envelope.producer,
      },
    });
    // At-least-once: treat a resolved publish as delivered. Pub/Sub retries
    // internally; consumers must be idempotent (dedupe by eventId).
    void messageId;
  }
}
