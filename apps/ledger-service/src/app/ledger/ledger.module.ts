import { PubSubEventPublisher, TOPICS, type EventPublisher } from '@atlas/events';
import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { CreateAccountUseCase } from './application/create-account.use-case.js';
import { GetBalanceUseCase } from './application/get-balance.use-case.js';
import { OutboxPublisher } from './application/outbox-publisher.js';
import { PostJournalUseCase } from './application/post-journal.use-case.js';
import { SeedChartOfAccountsUseCase } from './application/seed-chart-of-accounts.use-case.js';
import { LedgerRepository } from './infrastructure/ledger-repository.js';
import { OutboxRepository } from './infrastructure/outbox-repository.js';
import { LedgerController } from './presentation/ledger.controller.js';
import { EVENT_PUBLISHER } from './tokens.js';

@Module({
  controllers: [LedgerController],
  providers: [
    LedgerRepository,
    OutboxRepository,
    CreateAccountUseCase,
    PostJournalUseCase,
    GetBalanceUseCase,
    SeedChartOfAccountsUseCase,
    OutboxPublisher,
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
    private readonly outboxPublisher: OutboxPublisher,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /** Seed the chart of accounts, ensure the topic exists, start the outbox. */
  async onApplicationBootstrap(): Promise<void> {
    await this.seeder.execute();
    if (this.publisher instanceof PubSubEventPublisher) {
      await this.publisher.ensureTopic();
    }
    this.outboxPublisher.start();
  }
}
