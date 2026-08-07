import { ConfigModule } from '@atlas/config';
import { DatabaseModule, widgets } from '@atlas/database';
import { AtlasLoggerModule } from '@atlas/logger';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { gatewayConfigSchema } from '../config/gateway-config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: gatewayConfigSchema }),
    AtlasLoggerModule.forRoot({
      serviceName: 'gateway',
      level: 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    DatabaseModule.forRoot({ schema: { widgets } }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
