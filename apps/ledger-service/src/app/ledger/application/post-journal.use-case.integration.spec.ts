import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { newId } from '@atlas/shared';
import { InMemoryEventBus, TOPICS, type EventPublisher } from '@atlas/events';
import { Account } from '../domain/account.js';
import { ledgerSchema } from '../infrastructure/ledger-schema.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';
import { OutboxRepository } from '../infrastructure/outbox-repository.js';
import { PostJournalUseCase } from './post-journal.use-case.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { UnbalancedJournalError, AccountNotFoundError } from '../domain/ledger-errors.js';

// Testcontainers can exceed jest's 5s default when starting Postgres in
// parallel with other tasks. Raise the limit for this suite.
jest.setTimeout(30_000);

/**
 * Financial correctness tests through the real PostJournalUseCase + the outbox.
 * Verifies: aggregate validation → repository transaction → outbox row written
 * atomically → OutboxPublisher drains it to the bus.
 */

let container: StartedPostgreSqlContainer;
let pool: Sql;
let repo: LedgerRepository;
let outboxRepo: OutboxRepository;
let useCase: PostJournalUseCase;
let bus: InMemoryEventBus;
let publisher: OutboxPublisher;

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
  outboxRepo = new OutboxRepository(db as never);
  useCase = new PostJournalUseCase(repo);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

beforeEach(() => {
  bus = new InMemoryEventBus(TOPICS.ledger);
  publisher = new OutboxPublisher(
    outboxRepo,
    bus as unknown as EventPublisher,
  ).setPollInterval(50);
});

afterEach(async () => {
  // Drain any leftover outbox rows so they don't leak into the next test's bus.
  await publisher.drain();
});

describe('PostJournalUseCase (financial correctness + outbox)', () => {
  it('posts a balanced journal and writes an outbox row', async () => {
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

    // The event is in the OUTBOX, not yet on the bus.
    expect(bus.published).toHaveLength(0);
  });

  it('the OutboxPublisher drains the event to the bus', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    await useCase.execute({
      reference: `ref-${newId()}`,
      currency: 'NGN',
      postings: [
        { accountId: b.id, direction: 'debit', amount: 25000 },
        { accountId: w.id, direction: 'credit', amount: 25000 },
      ],
    });

    await publisher.drain();

    const events = bus.eventsOfType('JournalPosted');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      currency: 'NGN',
      totalAmount: 25000,
    });
    expect(events[0].producer).toBe('ledger-service');
  });

  it('marks the outbox row published after draining', async () => {
    const b = bank();
    const w = wallet();
    await repo.seedAccounts([b, w]);

    await useCase.execute({
      reference: `ref-${newId()}`,
      currency: 'NGN',
      postings: [
        { accountId: b.id, direction: 'debit', amount: 10000 },
        { accountId: w.id, direction: 'credit', amount: 10000 },
      ],
    });

    await publisher.drain();

    // No pending rows remain — everything was published.
    const pending = await outboxRepo.claimPending(10);
    expect(pending).toHaveLength(0);
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

    // Nothing persisted, no outbox row, no event.
    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBeUndefined();
    expect((await outboxRepo.claimPending(10))).toHaveLength(0);
    expect(bus.published).toHaveLength(0);
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

  it('replays idempotently and only writes one outbox row', async () => {
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

    await publisher.drain();
    expect(bus.eventsOfType('JournalPosted')).toHaveLength(1);

    const balances = await repo.getBalances([b.id, w.id]);
    expect(balances.get(b.id)?.balance).toBe(30000);
  });
});
