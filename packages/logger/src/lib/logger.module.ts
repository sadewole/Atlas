import { CORRELATION_ID_HEADER } from '@atlas/shared';
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule, Params } from 'nestjs-pino';
import { pino } from 'pino';
import { AtlasLoggerOptions } from './logger.js';

export type AtlasLoggerModuleOptions = AtlasLoggerOptions;

/**
 * NestJS integration for Atlas structured logging.
 *
 * - Emits structured JSON logs via pino.
 * - Uses the `X-Correlation-ID` request header as pino-http's request id, so
 *   every log line in a request carries the correlation id.
 * - Pretty-prints in development.
 *
 * Injected as a global module. Inject pino's `Logger` (from nestjs-pino) or use
 * Nest's built-in `Logger` which delegates to pino.
 */
@Module({})
export class AtlasLoggerModule {
  static forRoot(options: AtlasLoggerModuleOptions) {
    const pinoParams: Params = {
      pinoHttp: {
        logger: pino({
          name: options.serviceName,
          level: options.level ?? 'info',
          base: { service: options.serviceName },
          redact: options.redact,
          timestamp: pino.stdTimeFunctions.isoTime,
        }),
        genReqId: (req, res) => {
          const existing = req.headers[CORRELATION_ID_HEADER];
          if (existing) {
            const value = Array.isArray(existing) ? existing[0] : existing;
            res.setHeader(CORRELATION_ID_HEADER, value);
            return value;
          }
          return req.id;
        },
        autoLogging: true,
      },
    };

    return PinoLoggerModule.forRoot(pinoParams);
  }
}
