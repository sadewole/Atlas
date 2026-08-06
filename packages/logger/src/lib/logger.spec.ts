import { describe, expect, it } from 'vitest';
import { Writable } from 'stream';
import { createLogger } from './logger.js';

interface LogLine {
  level: number;
  service: string;
  msg: string;
  [key: string]: unknown;
}

/** Collect pino's JSON output into an array of parsed lines. */
function captureLogger(options: Parameters<typeof createLogger>[0]): {
  logger: ReturnType<typeof createLogger>;
  lines: () => LogLine[];
} {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs.push(chunk.toString().trim());
      cb();
    },
  });
  const logger = createLogger({ ...options, pretty: false, destination: stream });
  return {
    logger,
    lines: () => logs.map((l) => JSON.parse(l)),
  };
}

describe('createLogger', () => {
  it('emits structured JSON with the service name', () => {
    const { logger, lines } = captureLogger({ serviceName: 'ledger' });
    logger.info('hello');
    const line = lines()[0];
    expect(line.service).toBe('ledger');
    expect(line.level).toBe(30); // pino info
    expect(line.msg).toBe('hello');
    expect(line.time).toBeDefined();
  });

  it('honors the configured level', () => {
    const { logger, lines } = captureLogger({
      serviceName: 'test',
      level: 'warn',
    });
    logger.info('should be filtered');
    logger.warn('should appear');
    expect(lines().map((l) => l.msg)).toEqual(['should appear']);
  });

  it('merges base fields', () => {
    const { logger, lines } = captureLogger({
      serviceName: 'test',
      base: { env: 'test' },
    });
    logger.info('x');
    expect(lines()[0].env).toBe('test');
  });

  it('redacts sensitive paths by default', () => {
    const { logger, lines } = captureLogger({ serviceName: 'test' });
    logger.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'x');
    const line = lines()[0];
    const req = line.req as { headers: { authorization: string } };
    expect(req.headers.authorization).toBe('[Redacted]');
  });
});
