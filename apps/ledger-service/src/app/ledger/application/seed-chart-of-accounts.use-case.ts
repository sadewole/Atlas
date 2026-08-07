import { newId } from '@atlas/shared';
import { Injectable, Logger } from '@nestjs/common';
import { CHART_OF_ACCOUNTS, Account } from '../domain/index.js';
import { LedgerRepository } from '../infrastructure/ledger-repository.js';

/**
 * Seed the standard chart of accounts on startup. Idempotent — safe to run
 * on every boot.
 */
@Injectable()
export class SeedChartOfAccountsUseCase {
  private readonly logger = new Logger(SeedChartOfAccountsUseCase.name);

  constructor(private readonly repository: LedgerRepository) {}

  async execute(): Promise<number> {
    const chart = CHART_OF_ACCOUNTS.map(
      (a) =>
        new Account({
          id: newId(),
          accountCode: a.accountCode,
          name: a.name,
          type: a.type,
          currency: a.currency,
        }),
    );
    await this.repository.seedAccounts(chart);
    this.logger.log(`Seeded chart of accounts (${CHART_OF_ACCOUNTS.length} accounts)`);
    return CHART_OF_ACCOUNTS.length;
  }
}
