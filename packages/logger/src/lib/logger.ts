import pino, { DestinationStream, Logger, LoggerOptions } from 'pino';

export interface AtlasLoggerOptions {
  level?: LoggerOptions['level'];
  serviceName: string;
  /** Pretty-print in development for readable local logs. */
  pretty?: boolean;
  /**
   * Paths to redact from logs (e.g. 'req.headers.authorization').
   * Uses pino's redact option which supports glob patterns.
   */
  redact?: string[];
  /** Base fields merged into every log line. */
  base?: Record<string, unknown>;
  /** Custom output destination. Defaults to stdout. Used by tests. */
  destination?: DestinationStream;
}

const DEFAULT_REDACT = [
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  'req.body.password',
  'req.body.apiKey',
  'req.body.secret',
];

/**
 * Create a configured pino logger producing structured JSON.
 * In dev (`pretty: true`) it logs to a human-readable stream.
 */
export function createLogger(options: AtlasLoggerOptions): Logger {
  const pinoOptions: LoggerOptions = {
    name: options.serviceName,
    level: options.level ?? 'info',
    base: {
      service: options.serviceName,
      ...options.base,
    },
    redact: options.redact ?? DEFAULT_REDACT,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (options.pretty) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    };
  }

  return options.destination
    ? pino(pinoOptions, options.destination)
    : pino(pinoOptions);
}
