import { ConfigModule } from '@atlas/config';
import { DatabaseModule } from '@atlas/database';
import { AtlasLoggerModule } from '@atlas/logger';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { transferServiceConfigSchema } from '../config/transfer-service-config.js';
import { TransferModule } from './transfer/transfer.module.js';
import { transferSchema } from './transfer/infrastructure/transfer-schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: transferServiceConfigSchema }),
    AtlasLoggerModule.forRoot({
      serviceName: 'transfer-service',
      level: 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    DatabaseModule.forRoot({ schema: transferSchema }),
    TransferModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
