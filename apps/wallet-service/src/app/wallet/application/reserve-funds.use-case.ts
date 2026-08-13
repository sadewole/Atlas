import { Currency, newId } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import {
  Reservation,
  Wallet,
  WalletNotActiveError,
  WalletNotFoundError,
} from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';
import { withWalletLock } from './with-wallet-lock.js';

export interface ReserveFundsCommand {
  walletId: string;
  reference: string;
  amount: number;
  currency: Currency;
  reason?: string;
  /** When the reservation auto-expires. */
  expiresAt?: string;
}

export interface ReserveFundsResult {
  reservation: Reservation;
}

/**
 * Reserve funds on a wallet. Locks `amount` out of the available balance
 * without moving money — only availability changes (WSS §Why Reservations
 * Exist).
 *
 * The wallet update uses optimistic locking; concurrent reservations to the
 * same wallet serialize on the version column, so two simultaneous requests
 * can't both reserve the same balance.
 */
@Injectable()
export class ReserveFundsUseCase {
  constructor(private readonly repository: WalletRepository) {}

  async execute(command: ReserveFundsCommand): Promise<ReserveFundsResult> {
    // Idempotency: same reference → return the existing reservation.
    const existing = await this.repository.findReservationByReference(
      command.reference,
    );
    if (existing) {
      return { reservation: existing };
    }

    let created: Reservation | null = null;

    await withWalletLock(
      this.repository,
      command.walletId,
      async (wallet: Wallet, tx) => {
        if (!wallet.isActive) {
          throw new WalletNotActiveError(wallet.id, wallet.status);
        }
        const updated = wallet.reserve(command.amount);

        const reservation = new Reservation({
          id: newId(),
          walletId: wallet.id,
          reference: command.reference,
          amount: command.amount,
          currency: command.currency,
          status: 'PENDING',
          reason: command.reason,
          expiresAt: command.expiresAt,
        });

        await this.repository.insertReservation(
          {
            id: reservation.id,
            walletId: wallet.id,
            reference: reservation.reference,
            amount: reservation.amount,
            currency: reservation.currency,
            status: reservation.status,
            reason: reservation.reason ?? null,
            expiresAt: reservation.expiresAt
              ? new Date(reservation.expiresAt)
              : null,
          },
          tx,
        );

        created = reservation;
        return updated;
      },
    );

    if (created === null) {
      throw new WalletNotFoundError(command.walletId);
    }
    return { reservation: created };
  }
}
