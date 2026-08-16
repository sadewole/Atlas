# 26 — Observability: Distributed Traces & Log Correlation

This document explains how we wired OpenTelemetry into the services so that traces flow to Jaeger and logs carry `traceId`/`spanId`. It's the "observability bootstrap" from Phase 0 that had been designed (in `docs/tier1/observability.md`) but never implemented.

## What We Wired

Every service now:

- **Exports distributed traces** over OTLP HTTP to the OpenTelemetry collector (`localhost:4318`), which forwards them to **Jaeger** (`localhost:16686`).
- **Auto-instruments** HTTP, pino, postgres, gRPC, and NestJS core — no manual span creation for common operations. A single transfer produces one trace spanning transfer → wallet → ledger.
- **Correlates logs to traces** — every pino log emitted inside an active span carries `traceId`, `spanId`, and `traceFlags`.

The architecture (from the spec):

```text
Atlas service ──OTLP HTTP──▶ OpenTelemetry Collector ──OTLP──▶ Jaeger
  (SDK, auto-     :4318          (batch processor)       :16686 UI
   instrumented)
```

## The Pieces

### `@atlas/observability` package

New shared package with a single entry point:

```ts
export function setupTelemetry(options: AtlasTelemetryOptions): () => Promise<void>
```

It creates a `NodeSDK` with:
- `resourceFromAttributes({ service.name, deployment.environment })` — every trace is tagged with the service so Jaeger can filter by it
- an `OTLPTraceExporter` pointed at `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
- `getNodeAutoInstrumentations()` with pino configured to inject `traceId`/`spanId`/`traceFlags` log keys

### Per-service bootstrap (`telemetry.ts`)

Each service has a tiny `src/telemetry.ts`:

```ts
import { setupTelemetry } from '@atlas/observability';
setupTelemetry({ serviceName: 'ledger-service', enabled: process.env.NODE_ENV !== 'test' });
```

And `main.ts` imports it as the **very first import**:

```ts
import './telemetry.js'; // MUST be first
import { NestFactory } from '@nestjs/core';
// ...
```

## The ESM Gotcha (the hard-won lesson)

The traces worked from the start (HTTP/gRPC spans appeared in Jaeger), but **pino logs never got `traceId`/`spanId`**. The investigation:

- **CJS works.** A `require('pino')` probe with the SDK showed `trace_id`/`span_id` injected correctly.
- **ESM doesn't.** Our services are ESM (`"type": "module"`). The pino instrumentation patches the `pino` module at load time via `import-in-the-middle`, and in ESM the patch hook must be registered by a **Node loader** *before* any module loads. Calling `setupTelemetry()` inside `bootstrap()` is too late — Nest and pino are already loaded.

**The fix:** run Node with the OTel instrumentation loader:

```sh
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs apps/ledger-service/dist/main.js
```

This flag registers the `import-in-the-middle` hook before the first import, so pino (and http/postgres/grpc) get patched in time. We added it to each service's `serve` target in `project.json` via `runtimeArgs`, so `pnpm nx serve <app>` just works.

Two requirements for the loader to resolve from each app: `@opentelemetry/instrumentation` must be a **direct dependency** of each app (pnpm's strict isolation doesn't expose transitive deps), and the flag must be present whenever the app is started — not just in Nx serve, but in Docker/Cloud Run too.

## What You Should See

1. Start the services (Docker Compose infra must be up).
2. Make a request: create a wallet, post a journal, run a transfer.
3. Open **Jaeger** at `http://localhost:16686`, search by service (`transfer-service`, `wallet-service`, `ledger-service`).
4. You'll see one distributed trace per request spanning all three services: `POST` (transfer HTTP) → gRPC `Reserve`/`GetWallet`/`Capture` (transfer→wallet) → gRPC `PostJournal` (transfer→ledger), plus the server-side gRPC spans.
5. Check any service log — inside an active span, lines carry `traceId` and `spanId`, so you can jump from a log line to its trace in Jaeger.

## The Verified Loop

```
1. curl POST /v1/transfers
2. transfer-service log: "Transfer TX-... completed" WITH traceId/spanId
3. Jaeger: one trace, 3 services, ~20 spans
4. Clicking traceId → full request journey
```

## What We Deliberately Skipped (for now)

- **Metrics** (RED/USE) and **logs pipeline** — the collector config only has a *traces* pipeline. Adding metrics means a Prometheus exporter in the collector + a viewer. See the spec for the roadmap.
- **Manual business spans** — e.g. naming the ledger post as its own named span. Auto-instrumentation covers the plumbing; business-level spans are a future refinement.

## Meta-Lesson

> **ESM changes how instrumentation must be loaded.** With CommonJS, "call setupTelemetry() first" works. With ESM, module patching needs a Node loader registered at process start (`--experimental-loader=.../hook.mjs`). It's invisible until you notice traces are fine but log correlation is missing — then it's a rabbit hole. The tell: if auto-instrumented spans appear but a specific library isn't patched, suspect the ESM loader, not your config.
