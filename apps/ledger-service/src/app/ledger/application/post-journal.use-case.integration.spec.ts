import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { newId } from '@atlas/shared';
import { InMemoryEventBus, TOPICS } from '@atlas/events';
import { Account } from '../domain/account.js';
import { ledgerSchema } from '../infrastructure/ledger-schema.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';
import { PostJournalUseCase } from './post-journal.use-case.js';
import { UnbalancedJournalError, AccountNotFoundError } from '../domain/ledger-errors.js';

// Testcontainers can exceed jest's 5s default when starting Postgres in
// parallel with other tasks. Raise the limit for this suite.
jest.setTimeout(30_000);

/**
 * End-to-end financial correctness tests through the real PostJournalUseCase
 * (aggregate validation → repository transaction → event publication).
 */

let container: StartedPostgreSqlContainer;
let pool: Sql;
let repo: LedgerRepository;
let publisher: InMemoryEventBus;
let useCase: PostJournalUseCase;

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
    max: 5,
  });
  const db = drizzle(pool, { schema: ledgerSchema });
  await migrate(db, { migrationsFolder: './migrations' });
  repo = new LedgerRepository(db as never);
  publisher = new InMemoryEventBus(TOPICS.ledger);
  useCase = new PostJournalUseCase(repo, publisher as never);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

beforeEach(() => {
  // Each test asserts on the events IT produced; reset the bus between tests.
  publisher = new InMemoryEventBus(TOPICS.ledger);
  useCase = new PostJournalUseCase(repo, publisher as never);
});

describe('PostJournalUseCase (financial correctness)', () => {
  it('posts a balanced journal and publishes JournalPosted', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    const result = await useCase.execute({
      reference: `ref-${newId()}`,
      currency: 'NGN',
      postings: [
        { accountId: b.id, direction: 'debit', amount: 50000 },
        { accountId: w.id, direction: 'credit', amount: 50000 },
      ],
    });

    expect(result.journalId).toBeDefined();

    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBe(50000);
    expect(balances.get(w.id)?.balance).toBe(50000);

    const events = publisher.eventsOfType('JournalPosted');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      journalId: result.journalId,
      currency: 'NGN',
      totalAmount: 50000,
    });
    expect(events[0].producer).toBe('ledger-service');
  });

  it('rejects an unbalanced journal before touching the database', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    await expect(
      useCase.execute({
        reference: `ref-${newId()}`,
        currency: 'NGN',
        postings: [
          { accountId: b.id, direction: 'debit', amount: 100000 },
          { accountId: w.id, direction: 'credit', amount: 90000 },
        ],
      }),
    ).rejects.toBeInstanceOf(UnbalancedJournalError);

    // Nothing persisted, no event published.
    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBeUndefined();
    expect(publisher.eventsOfType('JournalPosted')).toHaveLength(0);
  });

  it('rejects a journal referencing an unknown account', async () => {
    const w = wallet();
    await repo.seedAccounts([w]);

    await expect(
      useCase.execute({
        reference: `ref-${newId()}`,
        currency: 'NGN',
        postings: [
          { accountId: newId(), direction: 'debit', amount: 100000 },
          { accountId: w.id, direction: 'credit', amount: 100000 },
        ],
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('replays idempotently and only publishes once', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);
    const reference = `ref-${newId()}`;

    const first = await useCase.execute({
      reference,
      currency: 'NGN',
      postings: [
        { accountId: b.id, direction: 'debit', amount: 30000 },
        { accountId: w.id, direction: 'credit', amount: 30000 },
      ],
    });
    const second = await useCase.execute({
      reference,
      currency: 'NGN',
      postings: [
        { accountId: b.id, direction: 'debit', amount: 30000 },
        { accountId: w.id, direction: 'credit', amount: 30000 },
      ],
    });

    expect(second.journalId).toBe(first.journalId);
    expect(publisher.eventsOfType('JournalPosted')).toHaveLength(1);

    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBe(30000);
  });
});
