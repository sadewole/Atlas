import { Currency, newId } from '@atlas/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Wallet, WalletType, OwnerType } from '../domain/index.js';
import { formatWalletNumber } from '../domain/index.js';
import { WalletRepository } from '../infrastructure/wallet-repository.js';
import { OutboxRepository } from '../infrastructure/outbox-repository.js';
import { LedgerClient } from '../infrastructure/ledger.client.js';
import { walletCreatedEnvelope } from './wallet-events.js';

export interface CreateWalletCommand {
  ownerId: string;
  ownerType: OwnerType;
  type: WalletType;
  currency: Currency;
}

export interface CreateWalletResult {
  wallet: Wallet;
}

/** Map a wallet type to its ledger account code prefix (per-wallet accounts). */
const ACCOUNT_CODE_BY_TYPE: Record<WalletType, string> = {
  PERSONAL: '2100',
  BUSINESS: '2100',
  MERCHANT: '2200',
  SYSTEM: '2300',
  ESCROW: '1120',
  SETTLEMENT: '1200',
  FEE: '4100',
  TREASURY: '3100',
};

/** All wallet ledger accounts are liabilities (funds the platform owes). */
const WALLET_ACCOUNT_TYPE = 'liability';

/**
 * Create a wallet and AUTO-PROVISION its dedicated ledger account.
 *
 * The wallet calls the Ledger service to create a per-wallet account
 * (classified under the chart-of-accounts hierarchy), stores the returned
 * `ledgerAccountId`, and links its balance projection to it. No caller-supplied
 * account id is needed — the mapping is automatic.
 *
 * The wallet-number sequence is allocated ATOMICALLY per currency (see
 * WalletRepository.nextWalletSequence), so concurrent creates never collide on
 * the wallet number OR the ledger account code.
 */
@Injectable()
export class CreateWalletUseCase {
  private readonly logger = new Logger(CreateWalletUseCase.name);

  constructor(
    private readonly repository: WalletRepository,
    private readonly ledgerClient: LedgerClient,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  async execute(command: CreateWalletCommand): Promise<CreateWalletResult> {
    // Allocate a unique, monotonic sequence for this currency atomically.
    const sequence = await this.repository.nextWalletSequence(command.currency);
    const walletNumber = formatWalletNumber(command.currency, sequence);

    const wallet = new Wallet({
      id: newId(),
      walletNumber,
      ownerId: command.ownerId,
      ownerType: command.ownerType,
      type: command.type,
      currency: command.currency,
      status: 'ACTIVE',
    });

    // Provision a dedicated ledger account for this wallet.
    // Account code embeds the currency so it is globally unique (the ledger's
    // account_code is unique across all currencies).
    const accountCode = `${ACCOUNT_CODE_BY_TYPE[command.type]}-${command.currency}-${sequence}`;
    const { id: ledgerAccountId } = await this.ledgerClient.createAccount({
      accountCode,
      name: `${command.type} Wallet ${walletNumber}`,
      type: WALLET_ACCOUNT_TYPE,
      currency: command.currency,
    });

    const created = wallet.withLedgerAccount(ledgerAccountId);

    // Build the event envelope BEFORE persisting so its eventId is written to
    // the outbox atomically with the wallet row.
    const envelope = walletCreatedEnvelope(
      created,
      `wallet:${created.id}`,
    );

    // Persist the wallet AND its WalletCreated outbox event atomically.
    await this.repository.transaction(async (tx) => {
      await this.repository.insertWallet(
        {
          id: created.id,
          walletNumber,
          ownerId: created.ownerId,
          ownerType: created.ownerType,
          type: created.type,
          currency: created.currency,
          status: created.status,
          ledgerAccountId,
        },
        tx,
      );
      await this.outboxRepository.insert(
        envelope.eventId,
        envelope.eventType,
        envelope.payload,
        tx,
      );
    });

    this.logger.log(
      `Wallet ${walletNumber} created with ledger account ${accountCode}`,
    );

    return {
      wallet: created,
    };
  }
}
