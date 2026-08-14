import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { outboxEvents, ledgerSchema } from './ledger-schema.js';

type TxClient = Parameters<
  Parameters<PostgresJsDatabase<typeof ledgerSchema>['transaction']>[0]
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
 * Outbox repository. The outbox is a transactionally-written queue of events
 * to publish. Writes happen inside the SAME transaction as the business data
 * (guaranteed by the caller passing `tx`); a background publisher drains it.
 */
@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDatabase<typeof ledgerSchema>,
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

  /**
   * Claim a batch of pending rows. Uses `FOR UPDATE SKIP LOCKED` so concurrent
   * publishers each get disjoint rows without blocking.
   */
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
