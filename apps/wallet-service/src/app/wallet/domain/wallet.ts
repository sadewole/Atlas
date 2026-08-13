import { Currency } from '@atlas/shared';
import {
  InsufficientBalanceError,
  InvalidAmountError,
  InvalidWalletTransitionError,
  WalletNotActiveError,
} from './wallet-errors.js';

/**
 * Wallet lifecycle (WSS §Wallet States).
 * Wallets are never deleted — CLOSED is read-only forever.
 */
export type WalletStatus =
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'FROZEN'
  | 'SUSPENDED'
  | 'CLOSED';

export type WalletType =
  | 'PERSONAL'
  | 'BUSINESS'
  | 'MERCHANT'
  | 'SYSTEM'
  | 'ESCROW'
  | 'SETTLEMENT'
  | 'FEE'
  | 'TREASURY';

export type OwnerType = 'USER' | 'ORGANIZATION';

/** Allowed status transitions (WSS §Wallet State Machine). */
const TRANSITIONS: Record<WalletStatus, WalletStatus[]> = {
  INITIALIZING: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
  ACTIVE: ['FROZEN', 'SUSPENDED', 'CLOSED'],
  FROZEN: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'CLOSED'],
  CLOSED: [], // terminal — nothing can leave CLOSED
};

export interface WalletProps {
  id: string;
  walletNumber: string;
  ownerId: string;
  ownerType: OwnerType;
  type: WalletType;
  currency: Currency;
  status?: WalletStatus;
  ledgerBalance?: number;
  reservedBalance?: number;
  version?: number;
}

/**
 * A wallet is a business-rules facade over the ledger. It is NOT the
 * accounting engine — balances are projections that the ledger (or, for this
 * slice, local bookkeeping) keeps in sync.
 *
 * Financial correctness is protected by:
 * - an explicit state machine (illegal transitions throw)
 * - optimistic locking via `version` (concurrent updates lose, not corrupt)
 * - `available = ledger − reserved` never going negative
 */
export class Wallet {
  readonly id: string;
  readonly walletNumber: string;
  readonly ownerId: string;
  readonly ownerType: OwnerType;
  readonly type: WalletType;
  readonly currency: Currency;
  readonly status: WalletStatus;
  readonly ledgerBalance: number;
  readonly reservedBalance: number;
  readonly version: number;

  constructor(props: WalletProps) {
    this.id = props.id;
    this.walletNumber = props.walletNumber;
    this.ownerId = props.ownerId;
    this.ownerType = props.ownerType;
    this.type = props.type;
    this.currency = props.currency;
    this.status = props.status ?? 'INITIALIZING';
    this.ledgerBalance = props.ledgerBalance ?? 0;
    this.reservedBalance = props.reservedBalance ?? 0;
    this.version = props.version ?? 0;
  }

  get availableBalance(): number {
    return this.ledgerBalance - this.reservedBalance;
  }

  get isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  /** Validate a status transition against the state machine. */
  canTransitionTo(next: WalletStatus): boolean {
    return TRANSITIONS[this.status].includes(next);
  }

  private assertTransition(next: WalletStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new InvalidWalletTransitionError(this.status, next);
    }
  }

  /** Change status, validating the transition. Returns a new Wallet. */
  withStatus(next: WalletStatus): Wallet {
    this.assertTransition(next);
    return new Wallet({ ...this.props(), status: next });
  }

  /** Freeze: can receive, cannot spend. */
  freeze(): Wallet {
    return this.withStatus('FROZEN');
  }

  /** Suspend: nothing allowed. */
  suspend(): Wallet {
    return this.withStatus('SUSPENDED');
  }

  /** Activate from INITIALIZING / FROZEN / SUSPENDED. */
  activate(): Wallet {
    return this.withStatus('ACTIVE');
  }

  /** Close: terminal, read-only. */
  close(): Wallet {
    return this.withStatus('CLOSED');
  }

  /** Reserve funds: move from available to reserved. */
  reserve(amount: number): Wallet {
    if (!this.isActive) {
      throw new WalletNotActiveError(this.id, this.status);
    }
    if (amount <= 0) {
      throw new InvalidAmountError();
    }
    if (amount > this.availableBalance) {
      throw new InsufficientBalanceError(amount, this.availableBalance);
    }
    return new Wallet({
      ...this.props(),
      reservedBalance: this.reservedBalance + amount,
    });
  }

  /** Capture a reservation: reserved funds become permanently debited. */
  captureReservation(amount: number): Wallet {
    if (amount <= 0 || amount > this.reservedBalance) {
      throw new InvalidAmountError();
    }
    return new Wallet({
      ...this.props(),
      ledgerBalance: this.ledgerBalance - amount,
      reservedBalance: this.reservedBalance - amount,
    });
  }

  /** Release a reservation: reserved funds return to available. */
  releaseReservation(amount: number): Wallet {
    if (amount <= 0 || amount > this.reservedBalance) {
      throw new InvalidAmountError();
    }
    return new Wallet({
      ...this.props(),
      reservedBalance: this.reservedBalance - amount,
    });
  }

  /** Deposit (from the ledger): increase the ledger balance. */
  credit(amount: number): Wallet {
    if (amount <= 0) throw new InvalidAmountError();
    return new Wallet({
      ...this.props(),
      ledgerBalance: this.ledgerBalance + amount,
    });
  }

  private props(): WalletProps {
    return {
      id: this.id,
      walletNumber: this.walletNumber,
      ownerId: this.ownerId,
      ownerType: this.ownerType,
      type: this.type,
      currency: this.currency,
      status: this.status,
      ledgerBalance: this.ledgerBalance,
      reservedBalance: this.reservedBalance,
      version: this.version,
    };
  }
}
