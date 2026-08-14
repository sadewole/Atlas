import { Currency, newId } from '@atlas/shared';
import { createEnvelope } from '@atlas/events';
import { Injectable, Logger } from '@nestjs/common';
import { Transfer, TransferType } from '../domain/index.js';
import { TransferRepository } from '../infrastructure/transfer-repository.js';
import { LedgerClient } from '../infrastructure/ledger.client.js';
import { WalletClient } from '../infrastructure/wallet.client.js';

export interface CreateTransferCommand {
  reference: string;
  type: TransferType;
  sourceWalletId: string;
  destinationWalletId: string;
  currency: Currency;
  amount: number;
  feeAmount?: number;
  description?: string;
  idempotencyKey: string;
  correlationId?: string;
}

export interface CreateTransferResult {
  transfer: Transfer;
  journalId?: string;
}

/** Reservations auto-expire after this long if compensation is unreachable. */
const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * The orchestrated Saga for a transfer (TSS §Saga Pattern).
 *
 *   RESERVE (wallet) → POST JOURNAL (ledger) → CAPTURE (wallet) → COMPLETE
 *
 * Each step is followed by its compensating action if a later step fails:
 *   - reserve fails           → nothing to undo, FAILED
 *   - ledger post fails       → RELEASE the reservation (compensate)
 *   - capture fails           → RELEASE the reservation, FAILED
 *
 * The transfer's status is persisted before and after each step so the saga
 * can resume/compensate from the last durable point.
 */
@Injectable()
export class CreateTransferUseCase {
  private readonly logger = new Logger(CreateTransferUseCase.name);

  constructor(
    private readonly repository: TransferRepository,
    private readonly walletClient: WalletClient,
    private readonly ledgerClient: LedgerClient,
  ) {}

  async execute(command: CreateTransferCommand): Promise<CreateTransferResult> {
    // Idempotency: same idempotency key → return the original transfer.
    const existing = await this.repository.findByIdempotencyKey(
      command.idempotencyKey,
    );
    if (existing) {
      this.logger.debug(
        `Idempotent replay of transfer ${command.reference} (${existing.id})`,
      );
      return { transfer: existing };
    }

    const transfer = new Transfer({
      id: newId(),
      reference: command.reference,
      type: command.type,
      status: 'CREATED',
      sourceWalletId: command.sourceWalletId,
      destinationWalletId: command.destinationWalletId,
      currency: command.currency,
      amount: command.amount,
      feeAmount: command.feeAmount,
      description: command.description,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });

    await this.repository.insertTransfer({
      id: transfer.id,
      reference: transfer.reference,
      type: transfer.type,
      status: transfer.status,
      sourceWalletId: transfer.sourceWalletId,
      destinationWalletId: transfer.destinationWalletId,
      currency: transfer.currency,
      amount: transfer.amount,
      feeAmount: transfer.feeAmount,
      description: transfer.description,
      idempotencyKey: transfer.idempotencyKey,
      correlationId: transfer.correlationId,
    });

    let current = await this.transition(transfer, 'VALIDATING');
    let reservationId: string | undefined;
    try {
      // Step 1 — reserve funds on the source wallet.
      current = await this.transition(current, 'RESERVING');
      const reservation = await this.walletClient.reserve(
        current.sourceWalletId,
        {
          reference: `res-${current.reference}`,
          amount: current.amount,
          currency: current.currency,
          // TTL: if compensation is ever unreachable (e.g. process crash before
          // the catch block runs), the reservation auto-releases and funds
          // return to available instead of being locked forever.
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS).toISOString(),
        },
      );
      reservationId = reservation.reservationId;
      current = await this.transition(current, 'RESERVED');

      // Resolve the ledger accounts FROM the wallets (per-wallet account model).
      // The client never supplies account ids — they're owned by the wallets.
      const [sourceWallet, destWallet] = await Promise.all([
        this.walletClient.getWallet(current.sourceWalletId),
        this.walletClient.getWallet(current.destinationWalletId),
      ]);
      const sourceAccountId = sourceWallet.ledgerAccountId;
      const destAccountId = destWallet.ledgerAccountId;
      if (!sourceAccountId || !destAccountId) {
        throw new Error(
          'Wallets are missing ledger accounts (expected after wallet provisioning)',
        );
      }

      // Step 2 — post the balanced journal to the ledger.
      current = await this.transition(current, 'POSTING');
      const { journalId } = await this.ledgerClient.postJournal({
        reference: `journal-${current.reference}`,
        currency: current.currency,
        description: current.description,
        postings: [
          { accountId: sourceAccountId, direction: 'debit', amount: current.amount },
          { accountId: destAccountId, direction: 'credit', amount: current.amount },
        ],
      });
      current = await this.transition(current, 'SETTLING');

      // Step 3 — capture the reservation (money permanently moves).
      await this.walletClient.capture(reservationId);

      // Done — terminal state, written atomically with the outbox event.
      const completed = current.withStatus('COMPLETED');
      await this.repository.markTerminal(
        current.id,
        current.status,
        'COMPLETED',
        this.terminalEvent('TransferCompleted', completed, {
          journalId,
        }),
        new Date(),
      );

      this.logger.log(
        `Transfer ${current.reference} completed (journal ${journalId})`,
      );
      return { transfer: completed, journalId };
    } catch (err) {
      // Compensate any reservation we made before failing.
      await this.compensate(current, reservationId, err);
      throw err;
    }
  }

  /**
   * Compensating action: release any reservation we created, then mark FAILED.
   *
   * The guard is `reservationId`, NOT the transfer's status. A reservation can
   * exist even if the transfer never persisted the RESERVED transition (e.g.
   * the DB write at line 108 fails after the wallet already locked the funds).
   * Keying on status would leave those funds locked forever.
   */
  private async compensate(
    transfer: Transfer,
    reservationId: string | undefined,
    cause: unknown,
  ): Promise<void> {
    this.logger.warn(
      `Compensating transfer ${transfer.reference}: ${String((cause as Error)?.message ?? cause)}`,
    );

    // Release whenever we actually created a reservation.
    if (reservationId) {
      try {
        await this.walletClient.release(reservationId);
      } catch (releaseErr) {
        // If release also fails, the reservation auto-expires (it has a TTL).
        this.logger.error(
          `Release reservation failed for ${transfer.reference}: ${String((releaseErr as Error)?.message)}`,
        );
      }
    }

    // The state machine requires COMPENSATING before FAILED (you can't jump
    // straight from POSTING/SETTLING to FAILED).
    let failed: Transfer;
    try {
      failed = transfer.withStatus('COMPENSATING').withStatus('FAILED');
    } catch {
      // Some states (e.g. CREATED/VALIDATING) go straight to FAILED.
      failed = transfer.withStatus('FAILED');
    }
    await this.repository.markTerminal(
      transfer.id,
      transfer.status,
      'FAILED',
      this.terminalEvent('TransferFailed', failed, {
        reason: String((cause as Error)?.message ?? cause),
      }),
      new Date(),
    );
  }

  /** Build a terminal transfer event envelope (published via the outbox). */
  private terminalEvent(
    eventType: 'TransferCompleted' | 'TransferFailed',
    transfer: Transfer,
    extra: { journalId?: string; reason?: string },
  ): { eventId: string; eventType: string; payload: string } {
    const envelope = createEnvelope({
      eventType,
      eventVersion: 1,
      producer: 'transfer-service',
      correlationId: transfer.correlationId ?? `transfer:${transfer.id}`,
      data: {
        transferId: transfer.id,
        reference: transfer.reference,
        type: transfer.type,
        currency: transfer.currency,
        amount: transfer.amount,
        feeAmount: transfer.feeAmount,
        sourceWalletId: transfer.sourceWalletId,
        destinationWalletId: transfer.destinationWalletId,
        status: transfer.status,
        journalId: extra.journalId,
        reason: extra.reason,
      },
    });
    return {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      payload: JSON.stringify(envelope),
    };
  }

  private async transition(
    transfer: Transfer,
    next: Transfer['status'],
  ): Promise<Transfer> {
    await this.repository.updateStatus(transfer.id, transfer.status, next);
    return transfer.withStatus(next);
  }
}
