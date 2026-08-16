# observability

OpenTelemetry bootstrap for Atlas services.

`setupTelemetry({ serviceName })` initialises the Node OpenTelemetry SDK with:

- an OTLP HTTP trace exporter (the local Docker Compose collector listens on `:4318` and forwards traces to Jaeger at `localhost:16686`)
- auto-instrumentation for HTTP, pino (adds `traceId`/`spanId` to every log line), postgres, gRPC, and NestJS core
- a `service.name` resource tag so traces are filterable per service

Call it **before** `NestFactory.create` so instrumentation patches modules in time.

```ts
import { setupTelemetry } from '@atlas/observability';

const shutdown = setupTelemetry({ serviceName: 'ledger-service' });
```

## Building

Run `nx build observability` to build the library.

## Running unit tests

Run `nx test observability` to execute the tests via [Vitest](https://vitest.dev/).
