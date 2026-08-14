import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';
import { Inject, Injectable } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import { Reservation, Wallet } from '../domain/index.js';
import {
  reservations,
  wallets,
  walletSchema,
  walletSequences,
} from './wallet-schema.js';

type TxClient = Parameters<
  Parameters<PostgresJsDatabase<typeof walletSchema>['transaction']>[0]
>[0];

export interface NewWalletRecord {
  id: string;
  walletNumber: string;
  ownerId: string;
  ownerType: string;
  type: string;
  currency: string;
  status: string;
  ledgerAccountId?: string | null;
}

export interface NewReservationRecord {
  id: string;
  walletId: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  reason?: string | null;
  expiresAt?: Date | null;
}

/**
 * Wallet repository.
 *
 * Optimistic locking: every write includes `WHERE version = <expected>`. If
 * zero rows update, another request modified the wallet concurrently — the
 * caller retries with the fresh state. This prevents lost updates without
 * database-level locks.
 *
 * A change that also writes related rows (e.g. a reservation) MUST run inside
 * a transaction so the version guard and the side effect commit (or rollback)
 * together.
 */
@Injectable()
export class WalletRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDatabase<typeof walletSchema>,
  ) {}

  /** Run work inside a database transaction. */
  async transaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /**
   * Atomically allocate the next wallet-number sequence for a currency.
   *
   * Implemented as a single upsert: INSERT a fresh row with value 1, or on
   * conflict bump the existing row's value by 1. Postgres serializes
   * conflicting upserts on the same primary key, so two concurrent calls can
   * never return the same value — no check-then-act race.
   */
  async nextWalletSequence(currency: string): Promise<number> {
    const [row] = await this.db
      .insert(walletSequences)
      .values({ currency, value: 1 })
      .onConflictDoUpdate({
        target: walletSequences.currency,
        set: { value: sql`${walletSequences.value} + 1` },
      })
      .returning({ value: walletSequences.value });
    if (!row) throw new Error('failed to allocate wallet sequence');
    return row.value;
  }

  async insertWallet(
    wallet: NewWalletRecord,
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.db;
    await db.insert(wallets).values(wallet);
  }

  async findWalletById(
    id: string,
    tx?: TxClient,
  ): Promise<Wallet | null> {
    const db = tx ?? this.db;
    const row = await db.query.wallets.findFirst({
      where: eq(wallets.id, id),
    });
    return row ? this.mapWallet(row) : null;
  }

  /** Find the wallet whose projection maps to a ledger account. */
  async findWalletByLedgerAccountId(
    ledgerAccountId: string,
  ): Promise<Wallet | null> {
    const row = await this.db.query.wallets.findFirst({
      where: eq(wallets.ledgerAccountId, ledgerAccountId),
    });
    return row ? this.mapWallet(row) : null;
  }

  /**
   * Persist a wallet change with optimistic locking.
   * Returns true when the update applied; false when the version moved on
   * (a concurrent write happened) and the caller must retry.
   */
  async updateWalletWithLock(
    wallet: Wallet,
    nextVersion: number,
    tx?: TxClient,
  ): Promise<boolean> {
    const db = tx ?? this.db;
    const result = await db
      .update(wallets)
      .set({
        status: wallet.status,
        ledgerBalance: wallet.ledgerBalance,
        reservedBalance: wallet.reservedBalance,
        version: nextVersion,
        updatedAt: new Date(),
      })
      .where(
        sql`${wallets.id} = ${wallet.id} AND ${wallets.version} = ${wallet.version}`,
      )
      .returning({ id: wallets.id });
    return result.length > 0;
  }

  /**
   * Apply a ledger posting delta to a wallet's projection atomically.
   * Used by the JournalPosted event consumer. Optimistic-lock safe: reads the
   * wallet, applies the delta, writes back with the version guard.
   */
  async applyLedgerPosting(
    walletId: string,
    direction: 'debit' | 'credit',
    amount: number,
  ): Promise<boolean> {
    const wallet = await this.findWalletById(walletId);
    if (!wallet) return false;
    const next = wallet.applyLedgerPosting(direction, amount);
    return this.updateWalletWithLock(next, wallet.version + 1);
  }

  async insertReservation(
    record: NewReservationRecord,
    tx?: TxClient,
  ): Promise<void> {
    const db = tx ?? this.db;
    await db.insert(reservations).values({
      ...record,
      reason: record.reason ?? null,
      expiresAt: record.expiresAt ?? null,
    });
  }

  async findReservationById(
    id: string,
    tx?: TxClient,
  ): Promise<Reservation | null> {
    const db = tx ?? this.db;
    const row = await db.query.reservations.findFirst({
      where: eq(reservations.id, id),
    });
    return row ? this.mapReservation(row) : null;
  }

  async findReservationByReference(
    reference: string,
  ): Promise<Reservation | null> {
    const row = await this.db.query.reservations.findFirst({
      where: eq(reservations.reference, reference),
    });
    return row ? this.mapReservation(row) : null;
  }

  async updateReservationStatus(
    id: string,
    status: string,
    tx?: TxClient,
  ): Promise<boolean> {
    const db = tx ?? this.db;
    const result = await db
      .update(reservations)
      .set({ status, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning({ id: reservations.id });
    return result.length > 0;
  }

  async reservationsForWallet(walletId: string): Promise<Reservation[]> {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(eq(reservations.walletId, walletId));
    return rows.map((r) => this.mapReservation(r));
  }

  private mapWallet(row: {
    id: string;
    walletNumber: string;
    ownerId: string;
    ownerType: string;
    type: string;
    currency: string;
    status: string;
    ledgerBalance: number;
    reservedBalance: number;
    version: number;
    ledgerAccountId: string | null;
  }): Wallet {
    return new Wallet({
      id: row.id,
      walletNumber: row.walletNumber,
      ownerId: row.ownerId,
      ownerType: row.ownerType as Wallet['ownerType'],
      type: row.type as Wallet['type'],
      currency: row.currency as Wallet['currency'],
      status: row.status as Wallet['status'],
      ledgerBalance: row.ledgerBalance,
      reservedBalance: row.reservedBalance,
      version: row.version,
      ledgerAccountId: row.ledgerAccountId ?? undefined,
    });
  }

  private mapReservation(row: {
    id: string;
    walletId: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    expiresAt: Date | null;
  }): Reservation {
    return new Reservation({
      id: row.id,
      walletId: row.walletId,
      reference: row.reference,
      amount: row.amount,
      currency: row.currency as Reservation['currency'],
      status: row.status as Reservation['status'],
      reason: row.reason ?? undefined,
      expiresAt: row.expiresAt?.toISOString(),
    });
  }
}
