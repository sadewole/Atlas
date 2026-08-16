// Load .env before config reads env vars.
try {
  process.loadEnvFile();
} catch {
  // No .env file — fine when env vars are provided by the environment.
}

// MUST be the first import: initialises OpenTelemetry before any Nest module
// (http, pino, postgres, grpc) loads, so instrumentation can patch them.
import './telemetry.js';

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
