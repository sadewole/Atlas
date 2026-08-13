import { Injectable } from '@nestjs/common';
import { Wallet, WalletNotFoundError } from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';

export interface GetWalletCommand {
  walletId: string;
}

export interface GetWalletResult {
  wallet: Wallet;
}

/** Read a wallet and its derived balances. */
@Injectable()
export class GetWalletUseCase {
  constructor(private readonly repository: WalletRepository) {}

  async execute(command: GetWalletCommand): Promise<GetWalletResult> {
    const wallet = await this.repository.findWalletById(command.walletId);
    if (!wallet) throw new WalletNotFoundError(command.walletId);
    return { wallet };
  }
}
