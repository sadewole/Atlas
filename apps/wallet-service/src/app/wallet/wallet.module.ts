import {
  PubSubEventPublisher,
  PubSubEventSubscriber,
  TOPICS,
  type EventEnvelope,
  type EventPublisher,
} from '@atlas/events';
import { CONFIG } from '@atlas/config';
import {
  Inject,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ChangeWalletStatusUseCase } from './application/change-wallet-status.use-case.js';
import { CreateWalletUseCase } from './application/create-wallet.use-case.js';
import { GetWalletUseCase } from './application/get-wallet.use-case.js';
import { JournalPostedConsumer } from './application/journal-posted.consumer.js';
import { OutboxPublisher } from './application/outbox-publisher.js';
import { ReservationActionUseCase } from './application/reservation-action.use-case.js';
import { ReserveFundsUseCase } from './application/reserve-funds.use-case.js';
import { LedgerClient } from './infrastructure/ledger.client.js';
import { OutboxRepository } from './infrastructure/outbox-repository.js';
import { WalletRepository } from './infrastructure/wallet-repository.js';
import { WalletController } from './presentation/wallet.controller.js';
import { WalletGrpcController } from './presentation/wallet-grpc.controller.js';
import { WalletServiceConfig } from '../../config/wallet-service-config.js';
import { EVENT_PUBLISHER } from './tokens.js';

/**
 * The wallet subscribes to `ledger.events` and syncs its balance projections
 * from JournalPosted events — the ledger is authoritative, the wallet reacts.
 * It also PUBLISHES its own domain events (WalletCreated, FundsReserved, ...)
 * to `wallet.events` via the outbox.
 */
export const LEDGER_SUBSCRIBER = Symbol('LEDGER_SUBSCRIBER');

@Module({
  controllers: [WalletController, WalletGrpcController],
  providers: [
    WalletRepository,
    OutboxRepository,
    CreateWalletUseCase,
    GetWalletUseCase,
    ReserveFundsUseCase,
    ReservationActionUseCase,
    ChangeWalletStatusUseCase,
    JournalPostedConsumer,
    OutboxPublisher,
    {
      provide: LedgerClient,
      useFactory: (config: WalletServiceConfig) =>
        new LedgerClient(config.LEDGER_GRPC_URL),
      inject: [CONFIG],
    },
    {
      provide: EVENT_PUBLISHER,
      useFactory: () =>
        new PubSubEventPublisher(TOPICS.wallet) as EventPublisher,
    },
    {
      provide: LEDGER_SUBSCRIBER,
      useFactory: () =>
        new PubSubEventSubscriber({
          topic: TOPICS.ledger,
          subscriptionName: 'wallet-service-ledger',
        }),
    },
  ],
  exports: [WalletRepository, OutboxRepository],
})
export class WalletModule implements OnApplicationBootstrap {
  constructor(
    @Inject(LEDGER_SUBSCRIBER)
    private readonly subscriber: PubSubEventSubscriber,
    private readonly consumer: JournalPostedConsumer,
    private readonly outboxPublisher: OutboxPublisher,
    @Inject(EVENT_PUBLISHER)
    private readonly publisher: EventPublisher,
  ) {}

  /** Subscribe to JournalPosted, ensure the wallet topic, start the outbox. */
  async onApplicationBootstrap(): Promise<void> {
    await this.subscriber.subscribe({
      topic: TOPICS.ledger,
      eventTypes: ['JournalPosted'],
      handle: async (event: EventEnvelope<unknown>) => {
        await this.consumer.handle(event);
      },
    });
    await this.subscriber.start();

    if (this.publisher instanceof PubSubEventPublisher) {
      await this.publisher.ensureTopic();
    }
    this.outboxPublisher.start();
  }
}
