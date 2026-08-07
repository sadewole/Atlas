import { Currency, newId } from '@atlas/shared';
import { Injectable } from '@nestjs/common';
import { Account, AccountType } from '../domain/index.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';

export interface CreateAccountCommand {
  accountCode: string;
  name: string;
  type: AccountType;
  currency: Currency;
}

export interface CreateAccountResult {
  account: Account;
}

/**
 * Create a single ledger account (used to extend the seed chart of accounts).
 */
@Injectable()
export class CreateAccountUseCase {
  constructor(private readonly repository: LedgerRepository) {}

  async execute(command: CreateAccountCommand): Promise<CreateAccountResult> {
    const account = new Account({
      id: newId(),
      accountCode: command.accountCode,
      name: command.name,
      type: command.type,
      currency: command.currency,
    });
    await this.repository.insertAccount(account);
    return { account };
  }
}
