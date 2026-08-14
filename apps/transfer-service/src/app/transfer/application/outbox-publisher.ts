import { type EventEnvelope, type EventPublisher } from '@atlas/events';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { OutboxRepository } from '../infrastructure/outbox-repository.js';
import { EVENT_PUBLISHER } from '../tokens.js';

/**
 * The transfer outbox publisher: a background worker that drains
 * `outbox_events` to Pub/Sub. Events are written atomically with the transfer,
 * so nothing is lost even if this worker never runs. Pub/Sub is at-least-once;
 * consumers dedupe by eventId.
 */
@Injectable()
export class OutboxPublisher implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisher.name);
  private pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: OutboxRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly publisher: EventPublisher,
  ) {
    this.pollIntervalMs = 1000;
  }

  /** Override the poll interval (used by tests). */
  setPollInterval(ms: number): this {
    this.pollIntervalMs = ms;
    return this;
  }

  /** Start polling. Call from the module's onApplicationBootstrap. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drain().catch((err) => {
        this.logger.error(`Outbox drain failed: ${String(err)}`);
      });
    }, this.pollIntervalMs);
    this.timer.unref();
  }

  async drain(): Promise<void> {
    const batch = await this.repository.claimPending(10);
    for (const row of batch) {
      try {
        const envelope = JSON.parse(row.payload) as EventEnvelope;
        await this.publisher.publish(envelope);
        await this.repository.markPublished(row.id);
        this.logger.log(
          `Published outbox event ${envelope.eventType} (${row.eventId})`,
        );
      } catch (err) {
        // Leave the row pending — the next poll retries it. Never drop it.
        await this.repository.recordAttempt(row.id);
        this.logger.error(
          `Failed to publish outbox event ${row.eventId}: ${String(err)}`,
        );
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
