import { CONFIG } from '@atlas/config';
import { PubSubEventPublisher, TOPICS, type EventPublisher } from '@atlas/events';
import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { CreateTransferUseCase } from './application/create-transfer.use-case.js';
import { OutboxPublisher } from './application/outbox-publisher.js';
import { TransferRepository } from './infrastructure/transfer-repository.js';
import { OutboxRepository } from './infrastructure/outbox-repository.js';
import { WalletClient } from './infrastructure/wallet.client.js';
import { LedgerClient } from './infrastructure/ledger.client.js';
import { TransferController } from './presentation/transfer.controller.js';
import { TransferServiceConfig } from '../../config/transfer-service-config.js';
import { EVENT_PUBLISHER } from './tokens.js';

@Module({
  controllers: [TransferController],
  providers: [
    TransferRepository,
    OutboxRepository,
    CreateTransferUseCase,
    OutboxPublisher,
    {
      provide: EVENT_PUBLISHER,
      useFactory: () =>
        new PubSubEventPublisher(TOPICS.transfer) as EventPublisher,
    },
    {
      provide: WalletClient,
      useFactory: (config: TransferServiceConfig) =>
        new WalletClient(config.WALLET_SERVICE_URL),
      inject: [CONFIG],
    },
    {
      provide: LedgerClient,
      useFactory: (config: TransferServiceConfig) =>
        new LedgerClient(config.LEDGER_SERVICE_URL),
      inject: [CONFIG],
    },
  ],
  exports: [TransferRepository, CreateTransferUseCase, EVENT_PUBLISHER],
})
export class TransferModule implements OnApplicationBootstrap {
  constructor(
    private readonly outboxPublisher: OutboxPublisher,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  /** Ensure the topic exists and start the outbox publisher at boot. */
  async onApplicationBootstrap(): Promise<void> {
    if (this.publisher instanceof PubSubEventPublisher) {
      await this.publisher.ensureTopic();
    }
    this.outboxPublisher.start();
  }
}
