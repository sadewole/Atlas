import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { createEnvelope } from '@atlas/events';
import { Currency, newId } from '@atlas/shared';
import { Wallet } from '../domain/wallet.js';
import { walletSchema } from './wallet-schema.js';
import { WalletRepository } from './wallet-repository.js';
import { CreateWalletUseCase } from '../application/create-wallet.use-case.js';
import { ReserveFundsUseCase } from '../application/reserve-funds.use-case.js';
import { ReservationActionUseCase } from '../application/reservation-action.use-case.js';
import { JournalPostedConsumer } from '../application/journal-posted.consumer.js';

/**
 * Financial correctness integration tests against real PostgreSQL
 * (Testcontainers). These verify the guarantees that matter:
 *   - optimistic locking prevents lost updates under concurrency
 *   - reserve/capture maintain available = ledger - reserved
 *   - concurrent reservations cannot double-spend available balance
 */

jest.setTimeout(30_000);

let container: StartedPostgreSqlContainer;
let pool: Sql;
let repo: WalletRepository;
let createWallet: CreateWalletUseCase;
let reserveFunds: ReserveFundsUseCase;
let reservationAction: ReservationActionUseCase;
let consumer: JournalPostedConsumer;

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
  const db = drizzle(pool, { schema: walletSchema });
  await migrate(db, { migrationsFolder: './migrations' });
  repo = new WalletRepository(db as never);
  createWallet = new CreateWalletUseCase(repo);
  reserveFunds = new ReserveFundsUseCase(repo);
  reservationAction = new ReservationActionUseCase(repo);
  consumer = new JournalPostedConsumer(repo);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

async function activeWallet(ledgerBalance = 100000): Promise<Wallet> {
  const { wallet } = await createWallet.execute({
    ownerId: newId(),
    ownerType: 'USER',
    type: 'PERSONAL',
    currency: 'NGN' as Currency,
  });
  await pool`
    update wallets set ledger_balance = ${ledgerBalance}, version = 1
    where id = ${wallet.id}
  `;
  const fresh = await repo.findWalletById(wallet.id);
  if (!fresh) throw new Error('wallet not created');
  return fresh;
}

describe('WalletRepository — optimistic locking', () => {
  it('applies an update with the correct version', async () => {
    const w = await activeWallet();
    const applied = await repo.updateWalletWithLock(w, w.version + 1);
    expect(applied).toBe(true);
  });

  it('rejects a stale version (lost update protection)', async () => {
    const w = await activeWallet();
    const next = w.reserve(10000);
    expect(await repo.updateWalletWithLock(next, w.version + 1)).toBe(true);
    // Second write using the OLD wallet state must fail.
    expect(await repo.updateWalletWithLock(w, w.version + 1)).toBe(false);
  });
});

describe('ReserveFundsUseCase — financial integrity', () => {
  it('reserves without moving the ledger balance', async () => {
    const w = await activeWallet(100000);
    const { reservation } = await reserveFunds.execute({
      walletId: w.id,
      reference: `ref-${newId()}`,
      amount: 30000,
      currency: 'NGN' as Currency,
    });
    expect(reservation.status).toBe('PENDING');

    const fresh = await repo.findWalletById(w.id);
    expect(fresh?.ledgerBalance).toBe(100000);
    expect(fresh?.reservedBalance).toBe(30000);
    expect(fresh?.availableBalance).toBe(70000);
  });

  it('rejects a reserve beyond the available balance', async () => {
    const w = await activeWallet(50000);
    await expect(
      reserveFunds.execute({
        walletId: w.id,
        reference: `ref-${newId()}`,
        amount: 60000,
        currency: 'NGN' as Currency,
      }),
    ).rejects.toThrow();
    // Nothing was written.
    const fresh = await repo.findWalletById(w.id);
    expect(fresh?.reservedBalance).toBe(0);
  });

  it('capture clears the reservation; the ledger event debits the projection', async () => {
    const w = await activeWallet(100000);
    const { reservation } = await reserveFunds.execute({
      walletId: w.id,
      reference: `ref-${newId()}`,
      amount: 40000,
      currency: 'NGN' as Currency,
    });
    await reservationAction.capture({ reservationId: reservation.id });

    const fresh = await repo.findWalletById(w.id);
    // Capture only cleared the hold.
    expect(fresh?.reservedBalance).toBe(0);

    // The JournalPosted event (ledger is authoritative) applies the debit.
    await repo.applyLedgerPosting(w.id, 'debit', 40000);
    const synced = await repo.findWalletById(w.id);
    expect(synced?.ledgerBalance).toBe(60000);
    expect(synced?.availableBalance).toBe(60000);
  });

  it('release returns funds to available', async () => {
    const w = await activeWallet(100000);
    const { reservation } = await reserveFunds.execute({
      walletId: w.id,
      reference: `ref-${newId()}`,
      amount: 25000,
      currency: 'NGN' as Currency,
    });
    await reservationAction.release({ reservationId: reservation.id });

    const fresh = await repo.findWalletById(w.id);
    expect(fresh?.ledgerBalance).toBe(100000);
    expect(fresh?.reservedBalance).toBe(0);
    expect(fresh?.availableBalance).toBe(100000);
  });

  it('serializes concurrent reservations — no double-spend', async () => {
    const w = await activeWallet(100000);

    // 5 concurrent reservations of 30000 each; only 3 can fit (100000 / 30000).
    const attempts = Array.from({ length: 5 }, (_, i) =>
      reserveFunds.execute({
        walletId: w.id,
        reference: `ref-${newId()}`,
        amount: 30000,
        currency: 'NGN' as Currency,
      }),
    );
    const settled = await Promise.allSettled(attempts);

    const succeeded = settled.filter((s) => s.status === 'fulfilled').length;
    const failed = settled.filter((s) => s.status === 'rejected').length;
    expect(succeeded).toBe(3);
    expect(failed).toBe(2);

    const fresh = await repo.findWalletById(w.id);
    expect(fresh?.reservedBalance).toBe(90000); // 3 × 30000
    expect(fresh?.availableBalance).toBe(10000);
  });
});

describe('JournalPostedConsumer — ledger → wallet sync', () => {
  async function walletWithLedgerAccount(
    ledgerAccountId: string,
  ): Promise<Wallet> {
    const { wallet } = await createWallet.execute({
      ownerId: newId(),
      ownerType: 'USER',
      type: 'PERSONAL',
      currency: 'NGN' as Currency,
      ledgerAccountId,
    });
    return wallet;
  }

  it('credits the wallet projection when the ledger posts to its account', async () => {
    const acct = newId();
    const w = await walletWithLedgerAccount(acct);

    const event = createEnvelope({
      eventType: 'JournalPosted',
      correlationId: newId(),
      producer: 'ledger-service',
      data: {
        journalId: newId(),
        reference: `j-${newId()}`,
        currency: 'NGN',
        totalAmount: 50000,
        postings: [
          { accountId: acct, direction: 'credit', amount: 50000 },
          { accountId: newId(), direction: 'debit', amount: 50000 },
        ],
      },
    });

    const updated = await consumer.handle(event);
    expect(updated).toBe(1);

    const synced = await repo.findWalletById(w.id);
    expect(synced?.ledgerBalance).toBe(50000);
    expect(synced?.availableBalance).toBe(50000);
  });

  it('ignores postings for accounts it does not own', async () => {
    const w = await walletWithLedgerAccount(newId());

    const event = createEnvelope({
      eventType: 'JournalPosted',
      correlationId: newId(),
      producer: 'ledger-service',
      data: {
        journalId: newId(),
        reference: `j-${newId()}`,
        currency: 'NGN',
        totalAmount: 30000,
        postings: [
          { accountId: newId(), direction: 'credit', amount: 30000 },
          { accountId: newId(), direction: 'debit', amount: 30000 },
        ],
      },
    });

    const updated = await consumer.handle(event);
    expect(updated).toBe(0);

    const synced = await repo.findWalletById(w.id);
    expect(synced?.ledgerBalance).toBe(0);
  });

  it('dedupes a redelivered event (at-least-once safety)', async () => {
    const acct = newId();
    const w = await walletWithLedgerAccount(acct);
    const eventId = newId();

    const makeEvent = () =>
      createEnvelope({
        eventId,
        eventType: 'JournalPosted',
        correlationId: newId(),
        producer: 'ledger-service',
        data: {
          journalId: newId(),
          reference: `j-${newId()}`,
          currency: 'NGN',
          totalAmount: 25000,
          postings: [
            { accountId: acct, direction: 'credit', amount: 25000 },
            { accountId: newId(), direction: 'debit', amount: 25000 },
          ],
        },
      });

    expect(await consumer.handle(makeEvent())).toBe(1);
    expect(await consumer.handle(makeEvent())).toBe(0); // duplicate ignored

    const synced = await repo.findWalletById(w.id);
    expect(synced?.ledgerBalance).toBe(25000); // not 50000
  });
});
