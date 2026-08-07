import { ConfigModule } from '@atlas/config';
import { DatabaseModule } from '@atlas/database';
import { AtlasLoggerModule } from '@atlas/logger';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { ledgerSchema } from './ledger/infrastructure/ledger-schema.js';
import { ledgerConfigSchema } from '../config/ledger-config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: ledgerConfigSchema }),
    AtlasLoggerModule.forRoot({
      serviceName: 'ledger-service',
      level: 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    DatabaseModule.forRoot({ schema: ledgerSchema }),
    LedgerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
