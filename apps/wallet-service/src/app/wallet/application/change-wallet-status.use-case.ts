import { Injectable } from '@nestjs/common';
import {
  InvalidWalletTransitionError,
  Wallet,
  WalletNotFoundError,
  WalletStatus,
} from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';
import { OutboxRepository } from '../infrastructure/outbox-repository.js';
import { walletStatusChangedEnvelope } from './wallet-events.js';
import { withWalletLock } from './with-wallet-lock.js';

export interface ChangeWalletStatusCommand {
  walletId: string;
  nextStatus: WalletStatus;
}

export interface ChangeWalletStatusResult {
  wallet: Wallet;
}

/** Freeze / unfreeze / suspend / close a wallet via the state machine. */
@Injectable()
export class ChangeWalletStatusUseCase {
  constructor(
    private readonly repository: WalletRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  async execute(
    command: ChangeWalletStatusCommand,
  ): Promise<ChangeWalletStatusResult> {
    let result: Wallet | null = null;

    await withWalletLock(
      this.repository,
      command.walletId,
      async (wallet: Wallet, tx) => {
        if (!wallet.canTransitionTo(command.nextStatus)) {
          throw new InvalidWalletTransitionError(
            wallet.status,
            command.nextStatus,
          );
        }
        const next = wallet.withStatus(command.nextStatus);

        // WalletStatusChanged is written to the outbox in the SAME transaction
        // as the status change.
        const envelope = walletStatusChangedEnvelope(
          next,
          wallet.status,
          `wallet:${wallet.id}`,
        );
        await this.outboxRepository.insert(
          envelope.eventId,
          envelope.eventType,
          envelope.payload,
          tx,
        );

        result = next;
        return next;
      },
    );

    if (result === null) {
      throw new WalletNotFoundError(command.walletId);
    }
    return { wallet: result };
  }
}
