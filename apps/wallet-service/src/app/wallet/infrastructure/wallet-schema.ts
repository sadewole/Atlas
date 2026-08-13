import { bigint, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * The Wallet Service's own schema (services own their data).
 * Money is stored as minor-unit integers — never floats.
 *
 * DOMAIN QUICK-REFERENCE:
 *   wallet     — a business-rules facade over the ledger. Holds customer
 *                balances as PROJECTIONS (ledger is the source of truth).
 *   reservation (a.k.a. hold) — temporarily locks available funds without
 *                moving money. e.g. a card auth or marketplace escrow.
 */

/**
 * Wallets. A wallet is NOT the accounting engine — it's where business rules
 * (freeze, limits, holds) live. Balances here are projections synced from the
 * ledger.
 */
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Human-readable id, e.g. ATL-NGN-0000000001-3. Never expose the DB id. */
  walletNumber: varchar('wallet_number', { length: 32 }).notNull().unique(),
  /** Who owns this wallet (user or organization id). */
  ownerId: uuid('owner_id').notNull(),
  /** USER | ORGANIZATION. */
  ownerType: varchar('owner_type', { length: 20 }).notNull(),
  /** PERSONAL | BUSINESS | MERCHANT | ESCROW | ... — each type has different policies. */
  type: varchar('type', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  /** INITIALIZING | ACTIVE | FROZEN | SUSPENDED | CLOSED. CLOSED is terminal. */
  status: varchar('status', { length: 20 }).notNull().default('INITIALIZING'),
  /** Total money this wallet owns (projection; source of truth is the ledger). */
  ledgerBalance: bigint('ledger_balance', { mode: 'number' }).notNull().default(0),
  /** Money currently locked by reservations. */
  reservedBalance: bigint('reserved_balance', { mode: 'number' }).notNull().default(0),
  /** Optimistic-lock counter: every write checks it to prevent lost updates. */
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  /** The ledger account this wallet's balance projects from (sync target). */
  ledgerAccountId: uuid('ledger_account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A hold on wallet funds. Locks `amount` out of the available balance without
 * moving money. Lifecycle: PENDING → CAPTURED | RELEASED | EXPIRED.
 * (available = ledger − reserved, so a reservation reduces available.)
 */
export const reservations = pgTable('reservations', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id),
  /** Idempotency key — retrying the same reference returns the same reservation. */
  reference: text('reference').notNull().unique(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  /** PENDING | CAPTURED | RELEASED | EXPIRED. */
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  /** Why the hold exists, e.g. "marketplace escrow". */
  reason: text('reason'),
  /** Auto-expire time — expired reservations auto-release their funds. */
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
