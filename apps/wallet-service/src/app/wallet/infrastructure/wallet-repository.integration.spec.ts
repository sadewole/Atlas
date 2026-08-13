import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { Currency, newId } from '@atlas/shared';
import { Wallet } from '../domain/wallet.js';
import { walletSchema } from './wallet-schema.js';
import { WalletRepository } from './wallet-repository.js';
import { CreateWalletUseCase } from '../application/create-wallet.use-case.js';
import { ReserveFundsUseCase } from '../application/reserve-funds.use-case.js';
import { ReservationActionUseCase } from '../application/reservation-action.use-case.js';

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

  it('capture moves funds from reserved to a permanent debit', async () => {
    const w = await activeWallet(100000);
    const { reservation } = await reserveFunds.execute({
      walletId: w.id,
      reference: `ref-${newId()}`,
      amount: 40000,
      currency: 'NGN' as Currency,
    });
    await reservationAction.capture({ reservationId: reservation.id });

    const fresh = await repo.findWalletById(w.id);
    expect(fresh?.ledgerBalance).toBe(60000);
    expect(fresh?.reservedBalance).toBe(0);
    expect(fresh?.availableBalance).toBe(60000);
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
