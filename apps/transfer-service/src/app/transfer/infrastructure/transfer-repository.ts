import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Transfer, TransferStatus } from '../domain/index.js';
import {
  transferStatusHistory,
  transfers,
  transferSchema,
} from './transfer-schema.js';

export interface NewTransferRecord {
  id: string;
  reference: string;
  type: string;
  status: string;
  sourceWalletId: string;
  destinationWalletId: string;
  currency: string;
  amount: number;
  feeAmount?: number;
  description?: string | null;
  idempotencyKey: string;
  correlationId?: string | null;
}

/** Transfer repository. Persists the transfer and its append-only history. */
@Injectable()
export class TransferRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleDatabase<typeof transferSchema>,
  ) {}

  async insertTransfer(record: NewTransferRecord): Promise<void> {
    await this.db.insert(transfers).values({
      ...record,
      feeAmount: record.feeAmount ?? 0,
      description: record.description ?? null,
      correlationId: record.correlationId ?? null,
    });
    await this.recordStatus(record.id, record.status);
  }

  async findById(id: string): Promise<Transfer | null> {
    const row = await this.db.query.transfers.findFirst({
      where: eq(transfers.id, id),
    });
    return row ? this.mapTransfer(row) : null;
  }

  async findByReference(reference: string): Promise<Transfer | null> {
    const row = await this.db.query.transfers.findFirst({
      where: eq(transfers.reference, reference),
    });
    return row ? this.mapTransfer(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Transfer | null> {
    const row = await this.db.query.transfers.findFirst({
      where: eq(transfers.idempotencyKey, key),
    });
    return row ? this.mapTransfer(row) : null;
  }

  /** Update status and append to the history in one go. */
  async updateStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    completedAt?: Date,
  ): Promise<void> {
    await this.db
      .update(transfers)
      .set({
        status: toStatus,
        ...(completedAt ? { completedAt } : {}),
      })
      .where(eq(transfers.id, id));
    await this.recordStatus(id, toStatus, fromStatus);
  }

  private async recordStatus(
    transferId: string,
    toStatus: string,
    fromStatus?: string,
  ): Promise<void> {
    await this.db.insert(transferStatusHistory).values({
      transferId,
      fromStatus: fromStatus ?? null,
      toStatus,
    });
  }

  private mapTransfer(row: {
    id: string;
    reference: string;
    type: string;
    status: string;
    sourceWalletId: string;
    destinationWalletId: string;
    currency: string;
    amount: number;
    feeAmount: number;
    description: string | null;
    idempotencyKey: string;
    correlationId: string | null;
    createdAt: Date;
  }): Transfer {
    return new Transfer({
      id: row.id,
      reference: row.reference,
      type: row.type as Transfer['type'],
      status: row.status as TransferStatus,
      sourceWalletId: row.sourceWalletId,
      destinationWalletId: row.destinationWalletId,
      currency: row.currency as Transfer['currency'],
      amount: row.amount,
      feeAmount: row.feeAmount,
      description: row.description ?? undefined,
      idempotencyKey: row.idempotencyKey,
      correlationId: row.correlationId ?? undefined,
      createdAt: row.createdAt.toISOString(),
    });
  }
}
