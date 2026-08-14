import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { outboxEvents, transferSchema } from './transfer-schema.js';

type TxClient = Parameters<
  Parameters<PostgresJsDatabase<typeof transferSchema>['transaction']>[0]
>[0];

export interface OutboxRow {
  id: string;
  eventId: string;
  eventType: string;
  payload: string;
  status: string;
  attempts: number;
}

/**
 * Transfer outbox repository. Events are written atomically with the transfer
 * (same transaction); a background publisher drains pending rows to Pub/Sub.
 */
@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDatabase<typeof transferSchema>,
  ) {}

  /** Insert an outbox row inside an existing transaction. */
  async insert(
    eventId: string,
    eventType: string,
    payload: string,
    tx: TxClient,
  ): Promise<void> {
    await tx.insert(outboxEvents).values({
      eventId,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
    });
  }

  /** Claim a batch of pending rows (`FOR UPDATE SKIP LOCKED`). */
  async claimPending(limit = 10): Promise<OutboxRow[]> {
    const rows = await this.db
      .select({
        id: outboxEvents.id,
        eventId: outboxEvents.eventId,
        eventType: outboxEvents.eventType,
        payload: outboxEvents.payload,
        status: outboxEvents.status,
        attempts: outboxEvents.attempts,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, 'pending'))
      .limit(limit)
      .for('update', { skipLocked: true });
    return rows;
  }

  /** Mark an outbox row published after the event reaches the bus. */
  async markPublished(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({
        status: 'published',
        publishedAt: new Date(),
        attempts: sql`${outboxEvents.attempts} + 1`,
      })
      .where(eq(outboxEvents.id, id));
  }

  /** Increment the attempt counter without publishing (for observability). */
  async recordAttempt(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ attempts: sql`${outboxEvents.attempts} + 1` })
      .where(eq(outboxEvents.id, id));
  }
}
