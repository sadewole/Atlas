import { setupTelemetry } from '@atlas/observability';

/**
 * Side-effect entry: initialise OpenTelemetry as the FIRST thing loaded in the
 * process. main.ts imports this before any other module so instrumentation
 * (http, pino, postgres, grpc) patches them in time.
 */
setupTelemetry({
  serviceName: 'transfer-service',
  enabled: process.env.NODE_ENV !== 'test',
});
