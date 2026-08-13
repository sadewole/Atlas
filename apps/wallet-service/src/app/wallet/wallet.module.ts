import {
  PubSubEventSubscriber,
  TOPICS,
  type EventEnvelope,
} from '@atlas/events';
import {
  Inject,
  Module,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ChangeWalletStatusUseCase } from './application/change-wallet-status.use-case.js';
import { CreateWalletUseCase } from './application/create-wallet.use-case.js';
import { GetWalletUseCase } from './application/get-wallet.use-case.js';
import { JournalPostedConsumer } from './application/journal-posted.consumer.js';
import { ReservationActionUseCase } from './application/reservation-action.use-case.js';
import { ReserveFundsUseCase } from './application/reserve-funds.use-case.js';
import { WalletRepository } from './infrastructure/wallet-repository.js';
import { WalletController } from './presentation/wallet.controller.js';

/**
 * The wallet subscribes to `ledger.events` and syncs its balance projections
 * from JournalPosted events — the ledger is authoritative, the wallet reacts.
 */
export const LEDGER_SUBSCRIBER = Symbol('LEDGER_SUBSCRIBER');

@Module({
  controllers: [WalletController],
  providers: [
    WalletRepository,
    CreateWalletUseCase,
    GetWalletUseCase,
    ReserveFundsUseCase,
    ReservationActionUseCase,
    ChangeWalletStatusUseCase,
    JournalPostedConsumer,
    {
      provide: LEDGER_SUBSCRIBER,
      useFactory: () =>
        new PubSubEventSubscriber({
          topic: TOPICS.ledger,
          subscriptionName: 'wallet-service-ledger',
        }),
    },
  ],
  exports: [WalletRepository],
})
export class WalletModule implements OnApplicationBootstrap {
  constructor(
    @Inject(LEDGER_SUBSCRIBER)
    private readonly subscriber: PubSubEventSubscriber,
    private readonly consumer: JournalPostedConsumer,
  ) {}

  /** Subscribe to JournalPosted and start pulling when the service boots. */
  async onApplicationBootstrap(): Promise<void> {
    await this.subscriber.subscribe({
      topic: TOPICS.ledger,
      eventTypes: ['JournalPosted'],
      handle: async (event: EventEnvelope<unknown>) => {
        await this.consumer.handle(event);
      },
    });
    await this.subscriber.start();
  }
}
