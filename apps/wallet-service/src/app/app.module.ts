import { ConfigModule } from '@atlas/config';
import { DatabaseModule } from '@atlas/database';
import { AtlasLoggerModule } from '@atlas/logger';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { walletServiceConfigSchema } from '../config/wallet-service-config.js';
import { WalletModule } from './wallet/wallet.module.js';
import { walletSchema } from './wallet/infrastructure/wallet-schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: walletServiceConfigSchema }),
    AtlasLoggerModule.forRoot({
      serviceName: 'wallet-service',
      level: 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    DatabaseModule.forRoot({ schema: walletSchema }),
    WalletModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
