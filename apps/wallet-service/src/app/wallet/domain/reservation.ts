import { Currency } from '@atlas/shared';
import { ReservationNotPendingError } from './wallet-errors.js';

/**
 * Reservation lifecycle (WSS §Reservation Lifecycle).
 * A reservation locks funds without moving them — only availability changes.
 */
export type ReservationStatus =
  | 'PENDING'
  | 'CAPTURED'
  | 'RELEASED'
  | 'EXPIRED';

const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['CAPTURED', 'RELEASED', 'EXPIRED'],
  CAPTURED: [],
  RELEASED: [],
  EXPIRED: [],
};

export interface ReservationProps {
  id: string;
  walletId: string;
  reference: string;
  amount: number;
  currency: Currency;
  status?: ReservationStatus;
  reason?: string;
  expiresAt?: string;
}

export class Reservation {
  readonly id: string;
  readonly walletId: string;
  readonly reference: string;
  readonly amount: number;
  readonly currency: Currency;
  readonly status: ReservationStatus;
  readonly reason?: string;
  readonly expiresAt?: string;

  constructor(props: ReservationProps) {
    this.id = props.id;
    this.walletId = props.walletId;
    this.reference = props.reference;
    this.amount = props.amount;
    this.currency = props.currency;
    this.status = props.status ?? 'PENDING';
    this.reason = props.reason;
    this.expiresAt = props.expiresAt;
  }

  get isPending(): boolean {
    return this.status === 'PENDING';
  }

  /** True when the reservation has passed its expiry. */
  isExpired(now = new Date()): boolean {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt).getTime() <= now.getTime();
  }

  withStatus(next: ReservationStatus): Reservation {
    if (!TRANSITIONS[this.status].includes(next)) {
      throw new ReservationNotPendingError(this.id, this.status);
    }
    return new Reservation({ ...this.props(), status: next });
  }

  capture(): Reservation {
    if (this.isExpired()) {
      throw new ReservationNotPendingError(this.id, 'EXPIRED');
    }
    return this.withStatus('CAPTURED');
  }

  release(): Reservation {
    return this.withStatus('RELEASED');
  }

  expire(): Reservation {
    return this.withStatus('EXPIRED');
  }

  private props(): ReservationProps {
    return {
      id: this.id,
      walletId: this.walletId,
      reference: this.reference,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      reason: this.reason,
      expiresAt: this.expiresAt,
    };
  }
}
