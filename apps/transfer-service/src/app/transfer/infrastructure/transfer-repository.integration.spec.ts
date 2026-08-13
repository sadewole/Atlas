import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { Sql } from 'postgres';
import { Currency, newId } from '@atlas/shared';
import { transferSchema } from './transfer-schema.js';
import { TransferRepository } from './transfer-repository.js';
import { CreateTransferUseCase } from '../application/create-transfer.use-case.js';
import { WalletClient } from './wallet.client.js';
import { LedgerClient } from './ledger.client.js';

/**
 * Saga integration tests.
 *
 * The Transfer repository runs against real PostgreSQL (Testcontainers).
 * The Wallet and Ledger "clients" are fakes that simulate the real services'
 * behavior — including the ability to make a step fail so we can exercise
 * compensation deterministically.
 */

jest.setTimeout(30_000);

let container: StartedPostgreSqlContainer;
let pool: Sql;
let repo: TransferRepository;
let useCase: CreateTransferUseCase;

/** Fake wallet service that tracks reservations and balance. */
class FakeWalletClient extends WalletClient {
  balances = new Map<string, number>();
  reservations = new Map<string, { walletId: string; amount: number; status: string }>();
  failReserve = false;
  failCapture = false;

  constructor() {
    super('http://fake-wallet');
  }

  override async reserve(walletId: string, input: { reference: string; amount: number; currency: string }) {
    if (this.failReserve) throw new Error('reserve failed');
    const available = this.balances.get(walletId) ?? 0;
    if (input.amount > available) throw new Error('Insufficient available balance');
    const id = newId();
    this.reservations.set(id, { walletId, amount: input.amount, status: 'PENDING' });
    this.balances.set(walletId, available - input.amount);
    return { reservationId: id, status: 'PENDING' };
  }

  override async capture(reservationId: string): Promise<void> {
    if (this.failCapture) throw new Error('capture failed');
    const res = this.reservations.get(reservationId);
    if (!res || res.status !== 'PENDING') throw new Error('not pending');
    res.status = 'CAPTURED';
    // balance already reduced by reserve; capture just finalizes
  }

  override async release(reservationId: string): Promise<void> {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error('reservation not found');
    this.balances.set(res.walletId, (this.balances.get(res.walletId) ?? 0) + res.amount);
    res.status = 'RELEASED';
  }
}

/** Fake ledger that records journals and can be made to fail. */
class FakeLedgerClient extends LedgerClient {
  journals: Array<{ reference: string; postings: Array<{ direction: string; amount: number }> }> = [];
  failPost = false;

  constructor() {
    super('http://fake-ledger');
  }

  override async postJournal(input: Parameters<LedgerClient['postJournal']>[0]) {
    if (this.failPost) throw new Error('ledger down');
    this.journals.push({ reference: input.reference, postings: input.postings });
    return { journalId: newId(), reference: input.reference };
  }
}

let fakeWallet: FakeWalletClient;
let fakeLedger: FakeLedgerClient;

function command(overrides: Partial<Parameters<CreateTransferUseCase['execute']>[0]> = {}) {
  return {
    reference: `TX-${newId()}`,
    type: 'INTERNAL' as const,
    sourceWalletId: newId(),
    destinationWalletId: newId(),
    currency: 'NGN' as Currency,
    amount: 25000,
    idempotencyKey: `idem-${newId()}`,
    sourceAccountId: newId(),
    destinationAccountId: newId(),
    ...overrides,
  };
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
  const db = drizzle(pool, { schema: transferSchema });
  await migrate(db, { migrationsFolder: './migrations' });
  repo = new TransferRepository(db as never);
  fakeWallet = new FakeWalletClient();
  fakeLedger = new FakeLedgerClient();
  useCase = new CreateTransferUseCase(repo, fakeWallet, fakeLedger);
});

afterAll(async () => {
  await pool.end();
  await container.stop();
});

beforeEach(() => {
  // Fresh fake-client state per test so journals/balances don't leak.
  fakeWallet.balances.clear();
  fakeWallet.reservations.clear();
  fakeWallet.failReserve = false;
  fakeWallet.failCapture = false;
  fakeLedger.journals = [];
  fakeLedger.failPost = false;
});

describe('CreateTransferUseCase — Saga', () => {
  it('completes the happy path: reserve → journal → capture', async () => {
    const cmd = command();
    fakeWallet.balances.set(cmd.sourceWalletId, 100000);

    const { transfer } = await useCase.execute(cmd);

    expect(transfer.status).toBe('COMPLETED');
    expect(fakeLedger.journals).toHaveLength(1);
    expect(fakeWallet.balances.get(cmd.sourceWalletId)).toBe(75000);

    const stored = await repo.findById(transfer.id);
    expect(stored?.status).toBe('COMPLETED');
  });

  it('is idempotent — same idempotency key returns the original transfer', async () => {
    const cmd = command();
    fakeWallet.balances.set(cmd.sourceWalletId, 100000);

    const first = await useCase.execute(cmd);
    const second = await useCase.execute(cmd);

    expect(second.transfer.id).toBe(first.transfer.id);
    expect(fakeLedger.journals.length).toBe(1); // no duplicate journal
  });

  it('fails without compensation when reserve fails (nothing to undo)', async () => {
    const cmd = command();
    fakeWallet.balances.set(cmd.sourceWalletId, 10000); // insufficient
    fakeWallet.failReserve = true;

    await expect(useCase.execute(cmd)).rejects.toThrow();

    const stored = await repo.findByReference(cmd.reference);
    expect(stored?.status).toBe('FAILED');
    expect(fakeLedger.journals).toHaveLength(0);
    fakeWallet.failReserve = false;
  });

  it('compensates: releases the reservation when the ledger post fails', async () => {
    const cmd = command();
    fakeWallet.balances.set(cmd.sourceWalletId, 100000);
    fakeLedger.failPost = true;

    await expect(useCase.execute(cmd)).rejects.toThrow();

    const stored = await repo.findByReference(cmd.reference);
    expect(stored?.status).toBe('FAILED');
    // Compensation released the reservation → balance fully restored.
    expect(fakeWallet.balances.get(cmd.sourceWalletId)).toBe(100000);
    fakeLedger.failPost = false;
  });

  it('compensates when the capture step fails', async () => {
    const cmd = command();
    fakeWallet.balances.set(cmd.sourceWalletId, 100000);
    fakeWallet.failCapture = true;

    await expect(useCase.execute(cmd)).rejects.toThrow();

    const stored = await repo.findByReference(cmd.reference);
    expect(stored?.status).toBe('FAILED');
    expect(fakeWallet.balances.get(cmd.sourceWalletId)).toBe(100000);
    fakeWallet.failCapture = false;
  });
});
