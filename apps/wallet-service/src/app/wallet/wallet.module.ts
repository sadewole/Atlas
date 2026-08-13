import { InMemoryEventBus, TOPICS } from '@atlas/events';
import { Module } from '@nestjs/common';
import { ChangeWalletStatusUseCase } from './application/change-wallet-status.use-case.js';
import { CreateWalletUseCase } from './application/create-wallet.use-case.js';
import { GetWalletUseCase } from './application/get-wallet.use-case.js';
import { ReservationActionUseCase } from './application/reservation-action.use-case.js';
import { ReserveFundsUseCase } from './application/reserve-funds.use-case.js';
import { WalletRepository } from './infrastructure/wallet-repository.js';
import { WalletController } from './presentation/wallet.controller.js';
import { EVENT_PUBLISHER } from './tokens.js';

@Module({
  controllers: [WalletController],
  providers: [
    WalletRepository,
    CreateWalletUseCase,
    GetWalletUseCase,
    ReserveFundsUseCase,
    ReservationActionUseCase,
    ChangeWalletStatusUseCase,
    {
      provide: EVENT_PUBLISHER,
      useFactory: () => new InMemoryEventBus(TOPICS.wallet),
    },
  ],
  exports: [WalletRepository],
})
export class WalletModule {}
