import { newId } from '@atlas/shared';
import {
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidWalletTransitionError,
  WalletNotActiveError,
} from './wallet-errors.js';
import { Wallet } from './wallet.js';
import { formatWalletNumber, parseWalletNumber } from './wallet-number.js';

function makeWallet(overrides: Partial<ConstructorParameters<typeof Wallet>[0]> = {}): Wallet {
  return new Wallet({
    id: newId(),
    walletNumber: formatWalletNumber('NGN', 1),
    ownerId: newId(),
    ownerType: 'USER',
    type: 'PERSONAL',
    currency: 'NGN',
    status: 'ACTIVE',
    ledgerBalance: 100000,
    ...overrides,
  });
}

describe('Wallet state machine', () => {
  it('starts INITIALIZING', () => {
    const w = makeWallet({ status: 'INITIALIZING' });
    expect(w.status).toBe('INITIALIZING');
    expect(w.isActive).toBe(false);
  });

  it('allows ACTIVE → FROZEN → ACTIVE', () => {
    const w = makeWallet();
    expect(w.freeze().status).toBe('FROZEN');
    expect(w.freeze().activate().status).toBe('ACTIVE');
  });

  it('rejects ACTIVE → ACTIVE', () => {
    expect(() => makeWallet().withStatus('ACTIVE')).toThrow(
      InvalidWalletTransitionError,
    );
  });

  it('treats CLOSED as terminal', () => {
    const closed = makeWallet().close();
    expect(closed.status).toBe('CLOSED');
    expect(() => closed.activate()).toThrow(InvalidWalletTransitionError);
  });
});

describe('Wallet balances', () => {
  it('computes available = ledger - reserved', () => {
    const w = makeWallet({ ledgerBalance: 100000, reservedBalance: 30000 });
    expect(w.availableBalance).toBe(70000);
  });

  it('reserve moves funds from available to reserved', () => {
    const w = makeWallet({ ledgerBalance: 100000 });
    const next = w.reserve(30000);
    expect(next.reservedBalance).toBe(30000);
    expect(next.availableBalance).toBe(70000);
    expect(next.ledgerBalance).toBe(100000); // money hasn't moved
  });

  it('rejects a reserve exceeding available balance', () => {
    const w = makeWallet({ ledgerBalance: 50000 });
    expect(() => w.reserve(50001)).toThrow(InsufficientBalanceError);
  });

  it('rejects reserving on a non-active wallet', () => {
    const w = makeWallet({ status: 'FROZEN' });
    expect(() => w.reserve(1000)).toThrow(WalletNotActiveError);
  });

  it('rejects non-positive amounts', () => {
    expect(() => makeWallet().reserve(0)).toThrow(InvalidAmountError);
    expect(() => makeWallet().credit(0)).toThrow(InvalidAmountError);
  });

  it('capture clears the reservation; the ledger event moves the ledger balance', () => {
    const w = makeWallet({ ledgerBalance: 100000, reservedBalance: 30000 });
    const next = w.captureReservation(30000);
    // Capture only clears the hold — the ledger balance is debited separately
    // by the JournalPosted event (ledger is authoritative).
    expect(next.ledgerBalance).toBe(100000);
    expect(next.reservedBalance).toBe(0);
    expect(next.availableBalance).toBe(100000);

    // ...which is applied via applyLedgerPosting.
    const synced = next.applyLedgerPosting('debit', 30000);
    expect(synced.ledgerBalance).toBe(70000);
  });

  it('applyLedgerPosting credits and debits the projection', () => {
    const w = makeWallet({ ledgerBalance: 100000 });
    expect(w.applyLedgerPosting('credit', 5000).ledgerBalance).toBe(105000);
    expect(w.applyLedgerPosting('debit', 5000).ledgerBalance).toBe(95000);
  });

  it('release returns funds to available without touching ledger', () => {
    const w = makeWallet({ ledgerBalance: 100000, reservedBalance: 30000 });
    const next = w.releaseReservation(30000);
    expect(next.ledgerBalance).toBe(100000);
    expect(next.reservedBalance).toBe(0);
    expect(next.availableBalance).toBe(100000);
  });
});

describe('Wallet number', () => {
  it('formats with padding and checksum', () => {
    expect(formatWalletNumber('NGN', 1)).toMatch(/^ATL-NGN-0000000001-\d$/);
  });

  it('round-trips parse', () => {
    const n = formatWalletNumber('USD', 12345);
    expect(parseWalletNumber(n)).toEqual({ currency: 'USD', sequence: 12345 });
  });

  it('rejects a tampered checksum', () => {
    const n = formatWalletNumber('NGN', 1);
    const tampered = n.slice(0, -1) + (Number(n.slice(-1)) + 1) % 10;
    expect(parseWalletNumber(tampered)).toBeNull();
  });
});
