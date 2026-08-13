import { CONFIG } from '@atlas/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app/app.module.js';
import { AtlasExceptionFilter } from './app/common/atlas-exception.filter.js';
import { TransferServiceConfig } from './config/transfer-service-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const config = app.get<TransferServiceConfig>(CONFIG);
  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new AtlasExceptionFilter());
  const logger = app.get(PinoLogger);
  logger.log(
    `🚀 TransferService running on: http://localhost:${config.SERVICE_PORT}/api`,
  );

  await app.listen(config.SERVICE_PORT, '0.0.0.0');
}

bootstrap();
