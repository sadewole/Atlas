import { Injectable } from '@nestjs/common';
import { Account, AccountNotFoundError } from '../domain/index.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';

export interface GetBalanceCommand {
  accountId: string;
}

export interface GetBalanceResult {
  account: Account;
  /** Balance in minor units (kobo/cents). Negative for credit-normal accounts. */
  balance: number;
  updatedAt: Date | null;
}

/**
 * Read the balance projection for an account.
 *
 * This is a CQRS read model: it is derived from posted journals, NOT the
 * source of truth. If corrupted, it can be rebuilt by replaying journals.
 */
@Injectable()
export class GetBalanceUseCase {
  constructor(private readonly repository: LedgerRepository) {}

  async execute(command: GetBalanceCommand): Promise<GetBalanceResult> {
    const account = await this.repository.findAccountById(command.accountId);
    if (!account) throw new AccountNotFoundError(command.accountId);

    const balances = await this.repository.getBalances([account.id]);
    const projection = balances.get(account.id);

    return {
      account,
      balance: projection?.balance ?? 0,
      updatedAt: projection?.updatedAt ?? null,
    };
  }
}
