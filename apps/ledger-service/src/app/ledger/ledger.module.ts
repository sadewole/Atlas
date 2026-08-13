import { PubSubEventPublisher, TOPICS, type EventPublisher } from '@atlas/events';
import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
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
      useFactory: () =>
        new PubSubEventPublisher(TOPICS.ledger) as EventPublisher,
    },
  ],
  exports: [PostJournalUseCase, GetBalanceUseCase, EVENT_PUBLISHER],
})
export class LedgerModule implements OnApplicationBootstrap {
  constructor(
    private readonly seeder: SeedChartOfAccountsUseCase,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /** Seed the chart of accounts + ensure the topic exists when the service boots. */
  async onApplicationBootstrap(): Promise<void> {
    await this.seeder.execute();
    if (this.publisher instanceof PubSubEventPublisher) {
      await this.publisher.ensureTopic();
    }
  }
}
