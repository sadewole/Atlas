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
import { WALLET_PROTO_PATH } from '@atlas/protobuf';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
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

  // Internal gRPC transport — service-to-service calls (REST stays external).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'wallet.v1',
      protoPath: WALLET_PROTO_PATH,
      url: `0.0.0.0:${config.GRPC_PORT}`,
      loader: { keepCase: true, longs: Number, defaults: true },
    },
  });

  logger.log(
    `🚀 WalletService running on: http://localhost:${config.SERVICE_PORT}/api`,
  );
  logger.log(`🛰  Wallet gRPC running on: ${config.GRPC_PORT}`);

  await app.startAllMicroservices();
  await app.listen(config.SERVICE_PORT, '0.0.0.0');
}

bootstrap();
