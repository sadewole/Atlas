import { CONFIG } from '@atlas/config';
import { Module } from '@nestjs/common';
import { CreateTransferUseCase } from './application/create-transfer.use-case.js';
import { TransferRepository } from './infrastructure/transfer-repository.js';
import { WalletClient } from './infrastructure/wallet.client.js';
import { LedgerClient } from './infrastructure/ledger.client.js';
import { TransferController } from './presentation/transfer.controller.js';
import { TransferServiceConfig } from '../../config/transfer-service-config.js';

@Module({
  controllers: [TransferController],
  providers: [
    TransferRepository,
    CreateTransferUseCase,
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
  exports: [TransferRepository, CreateTransferUseCase],
})
export class TransferModule {}
