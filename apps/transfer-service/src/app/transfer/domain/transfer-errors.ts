import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '@atlas/shared';

/** Transfer with the given id or reference does not exist. */
export class TransferNotFoundError extends NotFoundError {
  constructor(reference: string) {
    super('TRANSFER_NOT_FOUND', `Transfer not found: ${reference}`);
  }
}

/** A transfer status transition is not allowed. */
export class InvalidTransferTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      'TRANSFER_INVALID_TRANSITION',
      `Invalid transfer transition: ${from} → ${to}`,
    );
  }
}

/** A transfer with this idempotency key already exists. */
export class TransferAlreadyExistsError extends ConflictError {
  constructor(key: string) {
    super(
      'TRANSFER_ALREADY_EXISTS',
      `A transfer with this idempotency key already exists: ${key}`,
    );
  }
}

/** Wrapped error from the Wallet service (e.g. insufficient balance). */
export class WalletServiceError extends DomainError {
  constructor(message: string) {
    super('TRANSFER_WALLET_ERROR', message);
  }
}

/** Wrapped error from the Ledger service (e.g. unbalanced journal). */
export class LedgerServiceError extends DomainError {
  constructor(message: string) {
    super('TRANSFER_LEDGER_ERROR', message);
  }
}
