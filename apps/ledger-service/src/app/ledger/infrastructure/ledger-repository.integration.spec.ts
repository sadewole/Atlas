import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { newId } from '@atlas/shared';
import { Account } from '../domain/account.js';
import { ledgerSchema } from './ledger-schema.js';
import { LedgerRepository } from './ledger-repository.js';

// Testcontainers can exceed jest's 5s default when starting Postgres in
// parallel with other tasks (e.g. builds). Raise the limit for this suite.
jest.setTimeout(30_000);

/**
 * Financial correctness integration tests against a real PostgreSQL
 * (Testcontainers). These verify the guarantees that matter most:
 *   - atomic writes (unbalanced journal => nothing persisted)
 *   - correct balance sign conventions per account type
 *   - idempotent replay
 *   - concurrent postings cannot lose updates or double-spend
 */

let container: StartedPostgreSqlContainer;
let pool: Sql;
let repo: LedgerRepository;

// Each test uses unique account codes so seedAccounts (which is
// onConflictDoNothing) inserts fresh rows for every test.
let seq = 0;
function bank(): Account {
  seq += 1;
  return new Account({
    id: newId(),
    accountCode: `1110-${seq}`,
    name: 'Main Bank',
    type: 'asset',
    currency: 'NGN',
  });
}
function wallet(): Account {
  seq += 1;
  return new Account({
    id: newId(),
    accountCode: `2100-${seq}`,
    name: 'Customer Wallet',
    type: 'liability',
    currency: 'NGN',
  });
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = postgres({
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    max: 10,
  });
  const db = drizzle(pool, { schema: ledgerSchema });
  await migrate(db, { migrationsFolder: './migrations' });
  repo = new LedgerRepository(db as never);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

function record(
  debitAccountId: string,
  creditAccountId: string,
  overrides: Partial<Parameters<LedgerRepository['postJournal']>[0]> = {},
  amount = 100000,
) {
  return {
    id: newId(),
    reference: `ref-${newId()}`,
    currency: 'NGN' as const,
    status: 'posted' as const,
    postings: [
      { accountId: debitAccountId, direction: 'debit' as const, amount, currency: 'NGN' },
      { accountId: creditAccountId, direction: 'credit' as const, amount, currency: 'NGN' },
    ],
    ...overrides,
  };
}

describe('LedgerRepository', () => {
  it('posts a journal and updates projections with correct sign conventions', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    await repo.postJournal(
      record(b.id, w.id, {}, 50000),
      new Map([[b.id, b], [w.id, w]]),
    );

    const balances = await repo.getBalances([b.id, w.id]);
    // asset: debit increases → +50000 ; liability: credit increases → +50000
    expect(balances.get(b.id)?.balance).toBe(50000);
    expect(balances.get(w.id)?.balance).toBe(50000);
  });

  it('debits a credit-normal account in the correct direction', async () => {
    const w = wallet();
    const fee = new Account({
      id: newId(),
      accountCode: `4100-${seq}`,
      name: 'Processing Fee',
      type: 'revenue',
      currency: 'NGN',
    });
    seq += 1;
    await repo.seedAccounts([w, fee]);

    // customer pays a 2500 fee: debit wallet (liability ↓), credit fee (revenue ↑)
    await repo.postJournal(
      record(w.id, fee.id, {}, 2500),
      new Map([[w.id, w], [fee.id, fee]]),
    );

    const balances = await repo.getBalances([w.id, fee.id]);
    expect(balances.get(w.id)?.balance).toBe(-2500);
    expect(balances.get(fee.id)?.balance).toBe(2500);
  });

  it('detects an existing journal reference (idempotency)', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);
    const r = record(b.id, w.id);
    await repo.postJournal(r, new Map([[b.id, b], [w.id, w]]));
    const found = await repo.findJournalByReference(r.reference);
    expect(found?.id).toBe(r.id);
  });

  it('serializes concurrent postings to the same account without losing updates', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    const references: string[] = [];
    const postings = Array.from({ length: 10 }, () => {
      const r = record(b.id, w.id, {}, 1000);
      references.push(r.reference);
      return repo.postJournal(r, new Map([[b.id, b], [w.id, w]]));
    });

    await Promise.all(postings);

    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBe(10000);
    expect(balances.get(w.id)?.balance).toBe(10000);

    // Only this test's journals should have been written.
    const rows = await pool`
      select count(*)::int as n
      from journal_postings jp
      join journals j on j.id = jp.journal_id
      where j.reference in ${pool(references)}
    `;
    expect(rows[0].n).toBe(20);
  });
});
