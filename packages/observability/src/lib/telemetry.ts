import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';

export interface AtlasTelemetryOptions {
  /** Service name, e.g. "ledger-service". Becomes the OTel service.name resource. */
  serviceName: string;
  /** OTLP HTTP endpoint, e.g. http://localhost:4318. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT. */
  endpoint?: string;
  /** Disable tracing entirely (e.g. in tests). Defaults to false. */
  enabled?: boolean;
  /** Short sampling description only used for logging, not OTel config. */
  environment?: string;
}

/**
 * Initialise OpenTelemetry for an Atlas service.
 *
 * - Configures the Node SDK with the OTLP HTTP trace exporter (the Docker
 *   Compose collector listens on :4318 and forwards traces to Jaeger).
 * - Auto-instruments HTTP, pino (adds traceId/spanId to logs), postgres,
 *   gRPC, and NestJS core — no manual span creation for common operations.
 * - Tags all telemetry with the service name so traces are filterable per
 *   service in Jaeger.
 *
 * IMPORTANT: call this BEFORE NestFactory.create (and before importing Nest
 * modules that open connections) so instrumentation patches the modules in
 * time. Returns a shutdown function for graceful close.
 */
export function setupTelemetry(options: AtlasTelemetryOptions): () => Promise<void> {
  const noop = async () => undefined;
  if (options.enabled === false) {
    return noop;
  }

  const endpoint =
    options.endpoint ??
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://localhost:4318';

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
        options.environment ?? process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-pino': {
          logKeys: {
            traceId: 'traceId',
            spanId: 'spanId',
            traceFlags: 'traceFlags',
          },
        },
      }),
    ],
  });

  try {
    sdk.start();
  } catch (err) {
    // Never crash the service because tracing failed to start.
    console.error(`[observability] failed to start OpenTelemetry SDK: ${String(err)}`);
    return noop;
  }

  return () => sdk.shutdown();
}
