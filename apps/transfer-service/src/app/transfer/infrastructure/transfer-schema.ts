import { bigint, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * The Transfer Service's own schema (services own their data).
 * Money is stored as minor-unit integers — never floats.
 *
 * DOMAIN QUICK-REFERENCE:
 *   transfer — one money-movement request between two wallets.
 *   transfer_status_history — every state the transfer passed through,
 *              append-only, so the journey is fully auditable.
 *   outbox_events — pending transfer events written atomically with the
 *              transfer; a background publisher drains them to Pub/Sub.
 */

/**
 * A money movement between two wallets. The Transfer Service ORCHESTRATES the
 * flow (reserve → ledger post → capture) — it never moves money itself.
 */
export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Human-readable reference, e.g. TX-12345. */
  reference: text('reference').notNull().unique(),
  /** INTERNAL | PAYOUT | REFUND | ... each type has its own validation rules. */
  type: varchar('type', { length: 20 }).notNull(),
  /** CREATED → VALIDATING → ... → COMPLETED | FAILED. */
  status: varchar('status', { length: 20 }).notNull().default('CREATED'),
  sourceWalletId: uuid('source_wallet_id').notNull(),
  destinationWalletId: uuid('destination_wallet_id').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  feeAmount: bigint('fee_amount', { mode: 'number' }).notNull().default(0),
  description: text('description'),
  /** Idempotency key — retrying the same key returns the original transfer. */
  idempotencyKey: text('idempotency_key').notNull().unique(),
  correlationId: text('correlation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/**
 * Append-only record of every state the transfer passed through. Never
 * overwrite the transfer's journey — just add rows. Perfect audit trail.
 */
export const transferStatusHistory = pgTable('transfer_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  transferId: uuid('transfer_id')
    .notNull()
    .references(() => transfers.id),
  fromStatus: varchar('from_status', { length: 20 }),
  toStatus: varchar('to_status', { length: 20 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The outbox: transfer events written atomically with the transfer, drained to
 * Pub/Sub by a background publisher. Guarantees no event is lost between the
 * DB commit and the publish.
 */
export const outboxEvents = pgTable('transfer_outbox_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The event's unique id — dedupes redeliveries. */
  eventId: uuid('event_id').notNull().unique(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  /** Full event envelope JSON (published verbatim). */
  payload: text('payload').notNull(),
  /** pending | published. pending rows are the publisher's work queue. */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  /** Publish attempts so far — a crash-safe retry counter. */
  attempts: bigint('attempts', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

/** The schema object passed to DatabaseModule.forRoot(). */
export const transferSchema = {
  transfers,
  transferStatusHistory,
  outboxEvents,
};

export type TransferRow = typeof transfers.$inferSelect;
export type TransferStatusHistoryRow = typeof transferStatusHistory.$inferSelect;
