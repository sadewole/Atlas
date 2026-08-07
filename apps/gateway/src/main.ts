import { CONFIG } from '@atlas/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app/app.module.js';
import { GatewayConfig } from './config/gateway-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const config = app.get<GatewayConfig>(CONFIG);
  app.setGlobalPrefix(config.GATEWAY_GLOBAL_PREFIX);

  app.useLogger(app.get(PinoLogger));
  const logger = app.get(PinoLogger);
  logger.log(
    `🚀 Application is running on: http://localhost:${config.GATEWAY_PORT}/${config.GATEWAY_GLOBAL_PREFIX}`,
  );

  await app.listen(config.GATEWAY_PORT, '0.0.0.0');
}

bootstrap();
