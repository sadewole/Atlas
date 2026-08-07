import { Currency, Money } from '@atlas/shared';
import { Posting } from './posting.js';
import {
  CurrencyMismatchError,
  InsufficientPostingsError,
  UnbalancedJournalError,
} from './ledger-errors.js';

export type JournalStatus = 'draft' | 'posted' | 'reversed';

export interface JournalProps {
  id: string;
  reference: string;
  description?: string;
  currency: Currency;
  status?: JournalStatus;
  postings: Posting[];
}

/**
 * The Journal is the aggregate root of the ledger.
 *
 * It enforces the financial invariants on creation:
 * - at least two postings (a debit and a credit)
 * - all postings in a single currency
 * - total debits == total credits
 *
 * A journal is immutable once created. Reversals create a NEW journal
 * rather than mutating history.
 */
export class Journal {
  readonly id: string;
  readonly reference: string;
  readonly description?: string;
  readonly currency: Currency;
  readonly status: JournalStatus;
  readonly postings: Posting[];

  constructor(props: JournalProps) {
    if (props.postings.length < 2) {
      throw new InsufficientPostingsError();
    }

    const currencies = new Set(props.postings.map((p) => p.amount.currency));
    if (currencies.size !== 1) {
      throw new CurrencyMismatchError();
    }

    const totalDebits = props.postings
      .filter((p) => p.isDebit)
      .reduce((sum, p) => sum.add(p.amount), Money.zero(props.currency));
    const totalCredits = props.postings
      .filter((p) => !p.isDebit)
      .reduce((sum, p) => sum.add(p.amount), Money.zero(props.currency));

    if (!totalDebits.equals(totalCredits)) {
      throw new UnbalancedJournalError(totalDebits.amount, totalCredits.amount);
    }

    this.id = props.id;
    this.reference = props.reference;
    this.description = props.description;
    this.currency = props.currency;
    this.status = props.status ?? 'draft';
    this.postings = props.postings;
  }

  /** Total value of the journal = total debits (= total credits by construction). */
  get totalAmount(): Money {
    const debits = this.postings
      .filter((p) => p.isDebit)
      .reduce((sum, p) => sum.add(p.amount), Money.zero(this.currency));
    return debits;
  }
}
