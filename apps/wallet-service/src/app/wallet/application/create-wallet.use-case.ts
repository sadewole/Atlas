import { Currency, newId } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import { Wallet, WalletType, OwnerType } from '../domain/index.js';
import { formatWalletNumber } from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';

export interface CreateWalletCommand {
  ownerId: string;
  ownerType: OwnerType;
  type: WalletType;
  currency: Currency;
  /** The ledger account this wallet's balance projects from. */
  ledgerAccountId?: string;
}

export interface CreateWalletResult {
  wallet: Wallet;
}

/**
 * Create a wallet. Generates a human-readable wallet number
 * (ATL-NGN-0000012345-7) instead of exposing the DB id.
 */
@Injectable()
export class CreateWalletUseCase {
  constructor(private readonly repository: WalletRepository) {}

  async execute(command: CreateWalletCommand): Promise<CreateWalletResult> {
    // Determine the next sequence for this currency. For the projection-first
    // slice we derive it from the count of existing wallets; a dedicated
    // sequence table is the production-grade approach (see notes).
    const wallet = new Wallet({
      id: newId(),
      walletNumber: '',
      ownerId: command.ownerId,
      ownerType: command.ownerType,
      type: command.type,
      currency: command.currency,
      status: 'ACTIVE',
      ledgerAccountId: command.ledgerAccountId,
    });

    // Ensure the wallet number is unique by retrying on the (unlikely) collision.
    let sequence = 1;
    for (;;) {
      const walletNumber = formatWalletNumber(command.currency, sequence);
      const existing = await this.repository.findWalletByNumber(walletNumber);
      if (!existing) {
        await this.repository.insertWallet({
          id: wallet.id,
          walletNumber,
          ownerId: wallet.ownerId,
          ownerType: wallet.ownerType,
          type: wallet.type,
          currency: wallet.currency,
          status: wallet.status,
          ledgerAccountId: wallet.ledgerAccountId ?? null,
        });
        return {
          wallet: new Wallet({
            id: wallet.id,
            walletNumber,
            ownerId: wallet.ownerId,
            ownerType: wallet.ownerType,
            type: wallet.type,
            currency: wallet.currency,
            status: wallet.status,
            ledgerAccountId: wallet.ledgerAccountId,
          }),
        };
      }
      sequence += 1;
    }
  }
}
