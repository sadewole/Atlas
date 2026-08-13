import { Injectable } from '@nestjs/common';
import {
  Reservation,
  ReservationNotPendingError,
  ReservationNotFoundError,
  Wallet,
  WalletNotFoundError,
} from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';
import { withWalletLock } from './with-wallet-lock.js';

export interface ReservationActionCommand {
  reservationId: string;
}

export interface ReservationActionResult {
  reservation: Reservation;
}

/**
 * Transition a pending reservation and apply the corresponding balance
 * change to its wallet, all under optimistic locking.
 *
 * - capture: reserved funds become a permanent debit (ledger balance drops)
 * - release: reserved funds return to available
 * - expire: like release, but for timed-out reservations
 */
@Injectable()
export class ReservationActionUseCase {
  constructor(private readonly repository: WalletRepository) {}

  async capture(command: ReservationActionCommand): Promise<ReservationActionResult> {
    return this.transition(command, (res, wallet) => ({
      reservation: res.capture(),
      wallet: wallet.captureReservation(res.amount),
    }));
  }

  async release(command: ReservationActionCommand): Promise<ReservationActionResult> {
    return this.transition(command, (res, wallet) => ({
      reservation: res.release(),
      wallet: wallet.releaseReservation(res.amount),
    }));
  }

  async expire(command: ReservationActionCommand): Promise<ReservationActionResult> {
    return this.transition(command, (res, wallet) => ({
      reservation: res.expire(),
      wallet: wallet.releaseReservation(res.amount),
    }));
  }

  private async transition(
    command: ReservationActionCommand,
    apply: (res: Reservation, wallet: Wallet) => {
      reservation: Reservation;
      wallet: Wallet;
    },
  ): Promise<ReservationActionResult> {
    const reservation = await this.repository.findReservationById(
      command.reservationId,
    );
    if (!reservation) {
      throw new ReservationNotFoundError(command.reservationId);
    }
    if (!reservation.isPending) {
      throw new ReservationNotPendingError(
        reservation.id,
        reservation.status,
      );
    }

    let updatedReservation: Reservation | null = null;

    const walletUpdated = await withWalletLock(
      this.repository,
      reservation.walletId,
      async (wallet: Wallet, tx) => {
        const { reservation: next, wallet: nextWallet } = apply(
          reservation,
          wallet,
        );
        await this.repository.updateReservationStatus(
          next.id,
          next.status,
          tx,
        );
        updatedReservation = next;
        return nextWallet;
      },
    );

    if (walletUpdated === null) {
      throw new WalletNotFoundError(reservation.walletId);
    }
    return { reservation: updatedReservation! };
  }
}
