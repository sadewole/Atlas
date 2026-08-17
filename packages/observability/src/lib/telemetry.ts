import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';

export interface AtlasTelemetryOptions {
  /** Service name, e.g. "ledger-service". Becomes the OTel service.name resource. */
  serviceName: string;
  /** OTLP HTTP endpoint, e.g. http://localhost:4318. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT. */
  endpoint?: string;
  /** Disable telemetry entirely (e.g. in tests). Defaults to false. */
  enabled?: boolean;
  /** Deployment environment, e.g. "development". Defaults to NODE_ENV. */
  environment?: string;
}

/**
 * Initialise OpenTelemetry for an Atlas service.
 *
 * - Configures the Node SDK with the OTLP HTTP trace + metric exporters (the
 *   Docker Compose collector listens on :4318 and forwards traces to Jaeger
 *   and metrics to Prometheus).
 * - Auto-instruments HTTP (RED metrics: request duration histograms), pino
 *   (adds traceId/spanId to logs), postgres, gRPC, and NestJS core.
 * - Tags all telemetry with the service name so traces/metrics are filterable
 *   per service.
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

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options.serviceName,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      options.environment ?? process.env.NODE_ENV ?? 'development',
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 5000,
    }),
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
    // Never crash the service because telemetry failed to start.
    console.error(`[observability] failed to start OpenTelemetry SDK: ${String(err)}`);
    return noop;
  }

  return () => sdk.shutdown();
}
