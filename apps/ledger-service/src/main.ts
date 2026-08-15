// Load .env before config reads env vars (process.loadEnvFile does not
// override variables already present in the environment).
try {
  process.loadEnvFile();
} catch {
  // No .env file — fine when env vars are provided by the environment.
}

import { CONFIG } from '@atlas/config';
import { LEDGER_PROTO_PATH } from '@atlas/protobuf';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app/app.module.js';
import { LedgerConfig } from './config/ledger-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const config = app.get<LedgerConfig>(CONFIG);
  app.useLogger(app.get(PinoLogger));
  const logger = app.get(PinoLogger);

  // Internal gRPC transport — service-to-service calls (REST stays external).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'ledger.v1',
      protoPath: LEDGER_PROTO_PATH,
      url: `0.0.0.0:${config.LEDGER_GRPC_PORT}`,
      loader: { keepCase: true, longs: Number, defaults: true },
    },
  });

  logger.log(
    `🚀 Ledger Service running on: http://localhost:${config.LEDGER_PORT}/v1/ledger`,
  );
  logger.log(
    `🛰  Ledger gRPC running on: ${config.LEDGER_GRPC_PORT}`,
  );

  await app.startAllMicroservices();
  await app.listen(config.LEDGER_PORT, '0.0.0.0');
}

bootstrap();
