import { bigint, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * The Ledger Service's own schema. Per the "services own their data" principle,
 * this lives in the service, not in @atlas/database.
 *
 * Money columns are stored as minor-unit integers (kobo/cents) — never floats.
 * Using `bigint` in PostgreSQL guarantees 64-bit integer range.
 *
 * DOMAIN QUICK-REFERENCE:
 *   account   — a "place money lives" in the chart of accounts (e.g. Platform
 *               Cash, Customer Wallets). NOT a user or wallet.
 *   journal   — one balanced accounting transaction (the "double" in
 *               double-entry). Holds the postings together.
 *   posting   — a single debit or credit line inside a journal.
 *   balance_projection — a cached, derived account balance. NOT the source of
 *               truth; the ledger (sum of postings) is.
 */

/** Chart of accounts entries. Money lives in accounts, not users. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable numeric code for hierarchy/reporting, e.g. "1110". */
  accountCode: varchar('account_code', { length: 20 }).notNull().unique(),
  name: text('name').notNull(),
  /** asset | liability | equity | revenue | expense — determines debit/credit sign. */
  type: varchar('type', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  /** active | closed. Closed accounts reject new postings. */
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One balanced accounting transaction. `debits == credits` always.
 * A journal exists only because money moved somewhere — it's the audit record.
 */
export const journals = pgTable('journals', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Client-supplied idempotency key — retrying the same reference returns the same journal. */
  reference: text('reference').notNull().unique(),
  description: text('description'),
  currency: varchar('currency', { length: 3 }).notNull(),
  /** draft | posted | reversed. Only `posted` affects balances. */
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
});

/**
 * The individual debit/credit lines of a journal. A journal typically has two
 * (one debit, one credit) but may have many. Never edited once written.
 */
export const journalPostings = pgTable('journal_postings', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalId: uuid('journal_id')
    .notNull()
    .references(() => journals.id),
  /** Which account this line touches. */
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  /** debit | credit. Direction + account type decides whether balance goes up or down. */
  direction: varchar('direction', { length: 6 }).notNull(),
  /** Minor-unit amount (kobo/cents). Always positive; the sign lives in `direction`. */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  /** Position of this line within the journal — order matters for replay/audit. */
  sequenceNumber: bigint('sequence_number', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cached account balances. A read-model: rebuilt from postings, never written
 * directly. Speeds up balance queries — the source of truth is the ledger.
 */
export const balanceProjection = pgTable('balance_projection', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The outbox: a pending-events queue written atomically with business data.
 * A background publisher drains this to Pub/Sub, so an event is never lost
 * if the process crashes between the DB commit and the publish.
 */
export const outboxEvents = pgTable('outbox_events', {
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
export const ledgerSchema = {
  accounts,
  journals,
  journalPostings,
  balanceProjection,
  outboxEvents,
};

export type AccountRow = typeof accounts.$inferSelect;
export type JournalRow = typeof journals.$inferSelect;
export type JournalPostingRow = typeof journalPostings.$inferSelect;
export type BalanceProjectionRow = typeof balanceProjection.$inferSelect;
