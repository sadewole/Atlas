import { bigint, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * The Wallet Service's own schema (services own their data).
 * Money is stored as minor-unit integers — never floats.
 */

export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletNumber: varchar('wallet_number', { length: 32 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull(),
  ownerType: varchar('owner_type', { length: 20 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('INITIALIZING'),
  ledgerBalance: bigint('ledger_balance', { mode: 'number' }).notNull().default(0),
  reservedBalance: bigint('reserved_balance', { mode: 'number' }).notNull().default(0),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id),
  reference: text('reference').notNull().unique(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  reason: text('reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The schema object passed to DatabaseModule.forRoot(). */
export const walletSchema = {
  wallets,
  reservations,
};

export type WalletRow = typeof wallets.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
