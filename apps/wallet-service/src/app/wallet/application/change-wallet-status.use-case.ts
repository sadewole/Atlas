import { Injectable } from '@nestjs/common';
import {
  InvalidWalletTransitionError,
  Wallet,
  WalletNotFoundError,
  WalletStatus,
} from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';
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
  constructor(private readonly repository: WalletRepository) {}

  async execute(
    command: ChangeWalletStatusCommand,
  ): Promise<ChangeWalletStatusResult> {
    let result: Wallet | null = null;

    await withWalletLock(
      this.repository,
      command.walletId,
      async (wallet: Wallet) => {
        if (!wallet.canTransitionTo(command.nextStatus)) {
          throw new InvalidWalletTransitionError(
            wallet.status,
            command.nextStatus,
          );
        }
        result = wallet.withStatus(command.nextStatus);
        return result;
      },
    );

    if (result === null) {
      throw new WalletNotFoundError(command.walletId);
    }
    return { wallet: result };
  }
}
