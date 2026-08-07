import { Money, newId } from '@atlas/shared';
import { Account } from './account.js';
import { Journal } from './journal.js';
import { Posting } from './posting.js';
import {
  CurrencyMismatchError,
  InsufficientPostingsError,
  InvalidAmountError,
  UnbalancedJournalError,
} from './ledger-errors.js';

function assetAccount(code = '1110'): Account {
  return new Account({
    id: newId(),
    accountCode: code,
    name: `Account ${code}`,
    type: 'asset',
    currency: 'NGN',
  });
}

function liabilityAccount(code = '2100'): Account {
  return new Account({
    id: newId(),
    accountCode: code,
    name: `Account ${code}`,
    type: 'liability',
    currency: 'NGN',
  });
}

function post(account: Account, direction: 'debit' | 'credit', amount: number): Posting {
  return new Posting({
    accountId: account.id,
    direction,
    amount: Money.fromMinor(amount, 'NGN'),
  });
}

function makeJournal(postings: Posting[]): Journal {
  return new Journal({
    id: newId(),
    reference: `ref-${Date.now()}`,
    currency: 'NGN',
    status: 'posted',
    postings,
  });
}

describe('Posting', () => {
  it('rejects a non-positive amount', () => {
    expect(() =>
      post(assetAccount(), 'debit', 0),
    ).toThrow(InvalidAmountError);
  });
});

describe('Journal aggregate', () => {
  it('accepts a balanced two-posting journal', () => {
    const bank = assetAccount('1110');
    const wallet = liabilityAccount('2100');
    const journal = makeJournal([
      post(bank, 'debit', 100000),
      post(wallet, 'credit', 100000),
    ]);
    expect(journal.status).toBe('posted');
    expect(journal.totalAmount.amount).toBe(100000);
  });

  it('rejects a journal with fewer than two postings', () => {
    const bank = assetAccount('1110');
    expect(() => makeJournal([post(bank, 'debit', 100000)])).toThrow(
      InsufficientPostingsError,
    );
  });

  it('rejects an unbalanced journal', () => {
    const bank = assetAccount('1110');
    const wallet = liabilityAccount('2100');
    expect(() =>
      makeJournal([
        post(bank, 'debit', 100000),
        post(wallet, 'credit', 90000),
      ]),
    ).toThrow(UnbalancedJournalError);
  });

  it('rejects a journal mixing currencies', () => {
    const ngn = assetAccount('1110');
    const usd = new Account({
      id: newId(),
      accountCode: '1111',
      name: 'USD bank',
      type: 'asset',
      currency: 'USD',
    });
    const ngnPosting = new Posting({
      accountId: ngn.id,
      direction: 'debit',
      amount: Money.fromMinor(100000, 'NGN'),
    });
    const usdPosting = new Posting({
      accountId: usd.id,
      direction: 'credit',
      amount: Money.fromMinor(100000, 'USD'),
    });
    expect(() => makeJournal([ngnPosting, usdPosting])).toThrow(
      CurrencyMismatchError,
    );
  });

  it('sums total amount across postings', () => {
    const bank = assetAccount('1110');
    const walletA = liabilityAccount('2101');
    const walletB = liabilityAccount('2102');
    const journal = makeJournal([
      post(bank, 'debit', 100000),
      post(walletA, 'credit', 60000),
      post(walletB, 'credit', 40000),
    ]);
    expect(journal.totalAmount.amount).toBe(100000);
  });
});
