import { Currency } from '@atlas/shared';

/**
 * Transfer lifecycle (TSS §Transfer Lifecycle).
 *
 *   CREATED → VALIDATING → RESERVING → RESERVED → POSTING → SETTLING → COMPLETED
 *                                          │          │
 *                                          ▼          ▼
 *                                      COMPENSATING → FAILED
 *
 * Every transfer reaches a terminal state (COMPLETED or FAILED). Nothing is
 * ever deleted.
 */
export type TransferStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'RESERVING'
  | 'RESERVED'
  | 'POSTING'
  | 'SETTLING'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'FAILED';

export type TransferType =
  | 'INTERNAL'
  | 'EXTERNAL'
  | 'BANK_TRANSFER'
  | 'MERCHANT_PAYMENT'
  | 'PAYOUT'
  | 'REFUND'
  | 'REVERSAL'
  | 'ESCROW'
  | 'SETTLEMENT'
  | 'FEE'
  | 'ADJUSTMENT';

/** Allowed forward transitions. */
const FORWARD: Record<TransferStatus, TransferStatus[]> = {
  CREATED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['RESERVING', 'FAILED', 'COMPENSATING'],
  RESERVING: ['RESERVED', 'FAILED', 'COMPENSATING'],
  RESERVED: ['POSTING', 'COMPENSATING'],
  POSTING: ['SETTLING', 'COMPENSATING'],
  SETTLING: ['COMPLETED', 'COMPENSATING'],
  COMPLETED: [],
  COMPENSATING: ['FAILED'],
  FAILED: [],
};

export interface TransferProps {
  id: string;
  reference: string;
  type: TransferType;
  status?: TransferStatus;
  sourceWalletId: string;
  destinationWalletId: string;
  currency: Currency;
  /** Amount in minor units (kobo/cents). */
  amount: number;
  feeAmount?: number;
  description?: string;
  idempotencyKey: string;
  correlationId?: string;
  createdAt?: string;
}

export class Transfer {
  readonly id: string;
  readonly reference: string;
  readonly type: TransferType;
  readonly status: TransferStatus;
  readonly sourceWalletId: string;
  readonly destinationWalletId: string;
  readonly currency: Currency;
  readonly amount: number;
  readonly feeAmount: number;
  readonly description?: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly createdAt: string;

  constructor(props: TransferProps) {
    if (props.amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }
    this.id = props.id;
    this.reference = props.reference;
    this.type = props.type;
    this.status = props.status ?? 'CREATED';
    this.sourceWalletId = props.sourceWalletId;
    this.destinationWalletId = props.destinationWalletId;
    this.currency = props.currency;
    this.amount = props.amount;
    this.feeAmount = props.feeAmount ?? 0;
    this.description = props.description;
    this.idempotencyKey = props.idempotencyKey;
    this.correlationId = props.correlationId;
    this.createdAt = props.createdAt ?? new Date().toISOString();
  }

  canTransitionTo(next: TransferStatus): boolean {
    return FORWARD[this.status].includes(next);
  }

  withStatus(next: TransferStatus): Transfer {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Invalid transfer transition: ${this.status} → ${next}`);
    }
    return new Transfer({ ...this.props(), status: next });
  }

  /** When we've started the saga and are moving through steps. */
  get isActive(): boolean {
    return !['COMPLETED', 'FAILED', 'COMPENSATING'].includes(this.status);
  }

  private props(): TransferProps {
    return {
      id: this.id,
      reference: this.reference,
      type: this.type,
      status: this.status,
      sourceWalletId: this.sourceWalletId,
      destinationWalletId: this.destinationWalletId,
      currency: this.currency,
      amount: this.amount,
      feeAmount: this.feeAmount,
      description: this.description,
      idempotencyKey: this.idempotencyKey,
      correlationId: this.correlationId,
      createdAt: this.createdAt,
    };
  }
}
