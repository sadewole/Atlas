import { ConfigModule } from '@atlas/config';
import { AtlasLoggerModule } from '@atlas/logger';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { gatewayConfigSchema } from '../config/gateway-config';

@Module({
  imports: [
    ConfigModule.forRoot({ schema: gatewayConfigSchema }),
    AtlasLoggerModule.forRoot({
      serviceName: 'gateway',
      level: 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
