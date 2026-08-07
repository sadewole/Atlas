import { bigint, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * The Ledger Service's own schema. Per the "services own their data" principle,
 * this lives in the service, not in @atlas/database.
 *
 * Money columns are stored as minor-unit integers (kobo/cents) — never floats.
 * Using `bigint` in PostgreSQL guarantees 64-bit integer range.
 */

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountCode: varchar('account_code', { length: 20 }).notNull().unique(),
  name: text('name').notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const journals = pgTable('journals', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull().unique(),
  description: text('description'),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp('posted_at', { withTimezone: true }),
});

export const journalPostings = pgTable('journal_postings', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalId: uuid('journal_id')
    .notNull()
    .references(() => journals.id),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  direction: varchar('direction', { length: 6 }).notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  sequenceNumber: bigint('sequence_number', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const balanceProjection = pgTable('balance_projection', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The schema object passed to DatabaseModule.forRoot(). */
export const ledgerSchema = {
  accounts,
  journals,
  journalPostings,
  balanceProjection,
};

export type AccountRow = typeof accounts.$inferSelect;
export type JournalRow = typeof journals.$inferSelect;
export type JournalPostingRow = typeof journalPostings.$inferSelect;
export type BalanceProjectionRow = typeof balanceProjection.$inferSelect;
