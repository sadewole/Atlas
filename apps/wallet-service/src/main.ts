// Load .env before config reads env vars.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fine when env vars are provided by the environment.
}

import { CONFIG } from '@atlas/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app/app.module.js';
import { AtlasExceptionFilter } from './app/common/atlas-exception.filter.js';
import { WalletServiceConfig } from './config/wallet-service-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const config = app.get<WalletServiceConfig>(CONFIG);
  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new AtlasExceptionFilter());
  const logger = app.get(PinoLogger);
  logger.log(
    `🚀 WalletService running on: http://localhost:${config.SERVICE_PORT}/api`,
  );

  await app.listen(config.SERVICE_PORT, '0.0.0.0');
}

bootstrap();
