import { Money } from '@atlas/shared';
import { InvalidAmountError } from './ledger-errors.js';

export type PostingDirection = 'debit' | 'credit';

export interface PostingProps {
  accountId: string;
  direction: PostingDirection;
  amount: Money;
}

/**
 * A single debit or credit line in a journal. Immutable value object.
 * The smallest accounting record in the ledger.
 */
export class Posting {
  readonly accountId: string;
  readonly direction: PostingDirection;
  readonly amount: Money;

  constructor(props: PostingProps) {
    if (!props.amount.isPositive()) {
      throw new InvalidAmountError();
    }
    this.accountId = props.accountId;
    this.direction = props.direction;
    this.amount = props.amount;
  }

  get isDebit(): boolean {
    return this.direction === 'debit';
  }
}
