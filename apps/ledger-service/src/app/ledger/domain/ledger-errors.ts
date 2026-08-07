import { ConflictError, DomainError, NotFoundError } from '@atlas/shared';

/** Account with the given id or code does not exist. */
export class AccountNotFoundError extends NotFoundError {
  constructor(reference: string) {
    super('LEDGER_ACCOUNT_NOT_FOUND', `Account not found: ${reference}`);
  }
}

/** Account exists but is closed. */
export class AccountClosedError extends ConflictError {
  constructor(accountCode: string) {
    super('LEDGER_ACCOUNT_CLOSED', `Account is closed: ${accountCode}`);
  }
}

/** A journal must have at least two postings. */
export class InsufficientPostingsError extends DomainError {
  constructor() {
    super(
      'LEDGER_INSUFFICIENT_POSTINGS',
      'A journal must contain at least two postings (a debit and a credit)',
    );
  }
}

/** Total debits do not equal total credits. */
export class UnbalancedJournalError extends DomainError {
  constructor(debits: number, credits: number) {
    super(
      'LEDGER_UNBALANCED',
      `Journal is unbalanced: debits (${debits}) do not equal credits (${credits})`,
    );
  }
}

/** A journal may only contain one currency. */
export class CurrencyMismatchError extends DomainError {
  constructor() {
    super(
      'LEDGER_CURRENCY_MISMATCH',
      'A journal may only contain postings in a single currency',
    );
  }
}

/** A posting amount must be positive. */
export class InvalidAmountError extends DomainError {
  constructor() {
    super('LEDGER_INVALID_AMOUNT', 'Posting amounts must be greater than zero');
  }
}

/** A journal with this reference already exists (idempotency replay). */
export class JournalAlreadyExistsError extends ConflictError {
  constructor(reference: string) {
    super('LEDGER_JOURNAL_ALREADY_EXISTS', `Journal already exists: ${reference}`);
  }
}
