import { InMemoryEventBus, TOPICS } from '@atlas/events';
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { CreateAccountUseCase } from './application/create-account.use-case.js';
import { GetBalanceUseCase } from './application/get-balance.use-case.js';
import { PostJournalUseCase } from './application/post-journal.use-case.js';
import { SeedChartOfAccountsUseCase } from './application/seed-chart-of-accounts.use-case.js';
import { LedgerRepository } from './infrastructure/ledger-repository.js';
import { LedgerController } from './presentation/ledger.controller.js';
import { EVENT_PUBLISHER } from './tokens.js';

@Module({
  controllers: [LedgerController],
  providers: [
    LedgerRepository,
    CreateAccountUseCase,
    PostJournalUseCase,
    GetBalanceUseCase,
    SeedChartOfAccountsUseCase,
    {
      provide: EVENT_PUBLISHER,
      useFactory: () => new InMemoryEventBus(TOPICS.ledger),
    },
  ],
  exports: [PostJournalUseCase, GetBalanceUseCase, EVENT_PUBLISHER],
})
export class LedgerModule implements OnApplicationBootstrap {
  constructor(private readonly seeder: SeedChartOfAccountsUseCase) {}

  /** Seed the chart of accounts when the service boots. */
  async onApplicationBootstrap(): Promise<void> {
    await this.seeder.execute();
  }
}
