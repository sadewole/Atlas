import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';
import { eq, inArray, sql } from 'drizzle-orm';
import { Account } from '../domain/index.js';
import {
  accounts,
  balanceProjection,
  journalPostings,
  journals,
  ledgerSchema,
  outboxEvents,
} from './ledger-schema.js';

/** A journal together with its postings, ready to be written. */
export interface NewJournalRecord {
  id: string;
  reference: string;
  description?: string;
  currency: string;
  status: 'posted';
  postings: Array<{
    accountId: string;
    direction: 'debit' | 'credit';
    amount: number;
    currency: string;
  }>;
}

/**
 * Repository for the ledger's aggregate — accounts, journals, and the
 * derived balance projection.
 *
 * Financial correctness is guaranteed by:
 * - writing the journal + postings + projection update in ONE transaction
 * - locking the affected accounts' projection rows with `FOR UPDATE` so two
 *   concurrent postings to the same account cannot lose an update
 * - deriving balances from the projection table which is itself updated
 *   only inside these transactions (never free-form)
 */
@Injectable()
export class LedgerRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDatabase<typeof ledgerSchema>,
  ) {}

  /** Insert the seed chart of accounts (idempotent). */
  async seedAccounts(chart: Array<Account>): Promise<void> {
    await this.db
      .insert(accounts)
      .values(
        chart.map((a) => ({
          id: a.id,
          accountCode: a.accountCode,
          name: a.name,
          type: a.type,
          currency: a.currency,
          status: a.status,
        })),
      )
      .onConflictDoNothing({ target: accounts.accountCode });
  }

  /** Insert a single account. Throws on duplicate account code. */
  async insertAccount(account: Account): Promise<void> {
    await this.db.insert(accounts).values({
      id: account.id,
      accountCode: account.accountCode,
      name: account.name,
      type: account.type,
      currency: account.currency,
      status: account.status,
    });
  }

  async findAccountById(id: string): Promise<Account | null> {
    const row = await this.db.query.accounts.findFirst({
      where: eq(accounts.id, id),
    });
    return row ? this.mapAccount(row) : null;
  }

  async findAccountByCode(code: string): Promise<Account | null> {
    const row = await this.db.query.accounts.findFirst({
      where: eq(accounts.accountCode, code),
    });
    return row ? this.mapAccount(row) : null;
  }

  async findAccountsByIds(ids: string[]): Promise<Account[]> {
    const rows = await this.db
      .select()
      .from(accounts)
      .where(inArray(accounts.id, ids));
    return rows.map((r) => this.mapAccount(r));
  }

  /**
   * Atomically post a journal:
   *   1. insert the journal
   *   2. insert its postings
   *   3. update the balance projection for each affected account
   *   4. write the outbox event (published asynchronously — see OutboxPublisher)
   *
   * The affected projection rows are locked with `FOR UPDATE` so concurrent
   * postings serialize — the classic protection against double-spends.
   *
   * `accountsById` must contain every account referenced by the postings.
   * Its account type determines the sign convention: a debit increases an
   * asset/expense (debit-normal) account but decreases a liability/equity/
   * revenue (credit-normal) account.
   */
  async postJournal(
    record: NewJournalRecord,
    accountsById: ReadonlyMap<string, Account>,
    outboxEvent?: { eventId: string; eventType: string; payload: string },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(journals).values({
        id: record.id,
        reference: record.reference,
        description: record.description,
        currency: record.currency,
        status: record.status,
        postedAt: new Date(),
      });

      await tx.insert(journalPostings).values(
        record.postings.map((p, i) => ({
          journalId: record.id,
          accountId: p.accountId,
          direction: p.direction,
          amount: p.amount,
          currency: p.currency,
          sequenceNumber: i,
        })),
      );

      // The outbox event is written in the SAME transaction as the journal.
      // If the process crashes before the background publisher drains it, the
      // row is still here — the event is never lost.
      if (outboxEvent) {
        await tx.insert(outboxEvents).values({
          eventId: outboxEvent.eventId,
          eventType: outboxEvent.eventType,
          payload: outboxEvent.payload,
          status: 'pending',
          attempts: 0,
        });
      }

      // Update projections with an atomic upsert. `ON CONFLICT DO UPDATE`
      // handles BOTH the "row exists" and "row doesn't exist yet" cases in a
      // single race-free statement. A naive `SELECT FOR UPDATE` first would
      // race: two transactions that both see no row would both try to INSERT
      // the same primary key.
      const deltas = this.groupDeltasByAccount(record.postings, accountsById);
      const accountIds = [...deltas.keys()].sort();
      for (const accountId of accountIds) {
        const delta = deltas.get(accountId);
        if (delta === undefined) {
          // Account came from accountIds (derived from the deltas keys), so
          // this can only happen if the map was mutated between the two lines.
          throw new Error(`Internal error: missing delta for ${accountId}`);
        }
        await tx
          .insert(balanceProjection)
          .values({ accountId, balance: delta })
          .onConflictDoUpdate({
            target: balanceProjection.accountId,
            set: {
              balance: sql`${balanceProjection.balance} + ${delta}`,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  /** Fetch current projected balances for a set of accounts. */
  async getBalances(
    accountIds: string[],
  ): Promise<Map<string, { balance: number; updatedAt: Date | null }>> {
    const rows = await this.db
      .select()
      .from(balanceProjection)
      .where(inArray(balanceProjection.accountId, accountIds));
    return new Map(
      rows.map((r) => [
        r.accountId,
        { balance: r.balance, updatedAt: r.updatedAt },
      ]),
    );
  }

  async journalExists(reference: string): Promise<boolean> {
    const row = await this.db.query.journals.findFirst({
      where: eq(journals.reference, reference),
    });
    return row !== undefined;
  }

  /** Whether a reference belongs to a journal we've already posted. */
  async findJournalByReference(reference: string) {
    return this.db.query.journals.findFirst({
      where: eq(journals.reference, reference),
    });
  }

  /**
   * Compute each account's balance delta using accounting sign conventions.
   *
   * For a debit-normal account (asset, expense): a debit increases it, a
   * credit decreases it. For a credit-normal account (liability, equity,
   * revenue): a credit increases it, a debit decreases it.
   */
  private groupDeltasByAccount(
    postings: Array<{ accountId: string; direction: string; amount: number }>,
    accountsById: ReadonlyMap<string, Account>,
  ): Map<string, number> {
    const deltas = new Map<string, number>();
    for (const p of postings) {
      const account = accountsById.get(p.accountId);
      if (!account) {
        throw new Error(`Missing account in postJournal: ${p.accountId}`);
      }
      const isDebit = p.direction === 'debit';
      // +1 when the posting direction increases this account type, else -1.
      const sign =
        (isDebit && account.debitNormal) || (!isDebit && !account.debitNormal)
          ? 1
          : -1;
      deltas.set(p.accountId, (deltas.get(p.accountId) ?? 0) + sign * p.amount);
    }
    return deltas;
  }

  private mapAccount(row: {
    id: string;
    accountCode: string;
    name: string;
    type: string;
    currency: string;
    status: string;
  }): Account {
    return new Account({
      id: row.id,
      accountCode: row.accountCode,
      name: row.name,
      type: row.type as Account['type'],
      currency: row.currency as Account['currency'],
      status: row.status as Account['status'],
    });
  }
}
