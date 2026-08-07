import { Currency } from '@atlas/shared';

/**
 * Account types from a standard chart of accounts.
 * The accounting equation: Assets = Liabilities + Equity.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type AccountStatus = 'active' | 'closed';

export interface AccountProps {
  id: string;
  /** Stable numeric code for hierarchy & reporting, e.g. "1110". */
  accountCode: string;
  name: string;
  type: AccountType;
  currency: Currency;
  status?: AccountStatus;
}

/**
 * An account is a place where money lives in the ledger.
 * The ledger only knows accounts — never users or wallets.
 */
export class Account {
  readonly id: string;
  readonly accountCode: string;
  readonly name: string;
  readonly type: AccountType;
  readonly currency: Currency;
  readonly status: AccountStatus;

  constructor(props: AccountProps) {
    this.id = props.id;
    this.accountCode = props.accountCode;
    this.name = props.name;
    this.type = props.type;
    this.currency = props.currency;
    this.status = props.status ?? 'active';
  }

  get isActive(): boolean {
    return this.status === 'active';
  }

  /** Debits increase assets & expenses; credits increase liabilities, equity & revenue. */
  get debitNormal(): boolean {
    return this.type === 'asset' || this.type === 'expense';
  }
}
