import {
  AtlasError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@atlas/shared';

/** Wallet with the given id does not exist. */
export class WalletNotFoundError extends NotFoundError {
  constructor(walletId: string) {
    super('WALLET_NOT_FOUND', `Wallet not found: ${walletId}`);
  }
}

/** Wallet exists but is not ACTIVE. */
export class WalletNotActiveError extends ConflictError {
  constructor(walletId: string, status: string) {
    super(
      'WALLET_NOT_ACTIVE',
      `Wallet ${walletId} is not active (current status: ${status})`,
    );
  }
}

/** Wallet is CLOSED — read-only forever. */
export class WalletClosedError extends ConflictError {
  constructor(walletId: string) {
    super('WALLET_CLOSED', `Wallet is closed: ${walletId}`);
  }
}

/** A status transition is not allowed by the state machine. */
export class InvalidWalletTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(
      'WALLET_INVALID_TRANSITION',
      `Invalid wallet transition: ${from} → ${to}`,
    );
  }
}

/** Available balance is insufficient for a reservation. */
export class InsufficientBalanceError extends DomainError {
  constructor(needed: number, available: number) {
    super(
      'WALLET_INSUFFICIENT_BALANCE',
      `Insufficient available balance: need ${needed}, have ${available}`,
    );
  }
}

/** Reservation with the given id does not exist. */
export class ReservationNotFoundError extends NotFoundError {
  constructor(reservationId: string) {
    super(
      'WALLET_RESERVATION_NOT_FOUND',
      `Reservation not found: ${reservationId}`,
    );
  }
}

/** Reservation is not PENDING, so it cannot be captured/released. */
export class ReservationNotPendingError extends ConflictError {
  constructor(reservationId: string, status: string) {
    super(
      'WALLET_RESERVATION_NOT_PENDING',
      `Reservation ${reservationId} is not pending (current status: ${status})`,
    );
  }
}

/** Amounts must be positive. */
export class InvalidAmountError extends DomainError {
  constructor() {
    super('WALLET_INVALID_AMOUNT', 'Amount must be greater than zero');
  }
}

/** Wallet already exists for this owner/type/currency. */
export class WalletAlreadyExistsError extends ConflictError {
  constructor() {
    super(
      'WALLET_ALREADY_EXISTS',
      'A wallet already exists for this owner and currency',
    );
  }
}

/** Generic wallet-domain error base for catch-all handling. */
export class WalletError extends AtlasError {
  constructor(code: string, message: string) {
    super(code, message, { statusCode: 500 });
    this.name = 'WalletError';
  }
}

/** Wrapped error from the Ledger service (e.g. account provisioning failed). */
export class LedgerServiceError extends DomainError {
  constructor(message: string) {
    super('WALLET_LEDGER_ERROR', message);
  }
}
