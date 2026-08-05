# 12 — The Shared Packages

This document explains the shared packages we implemented, what each one does, and the design decisions behind them.

## Why Shared Packages?

Atlas has 10+ services that all need the same foundation:
- The same `Money` type (financial correctness is non-negotiable)
- The same error format (the API Standards demand consistency)
- The same logging setup (structured JSON everywhere)
- The same event envelope (SAS §10)

Instead of duplicating this in every service, we build it **once** in `packages/` and every service depends on it.

---

## The Packages

```
packages/
├── shared/     @atlas/shared   — Money, errors, UUIDv7, correlation IDs, pagination
├── config/     @atlas/config   — zod schema validation of env vars
├── logger/     @atlas/logger   — pino structured JSON logging
├── events/     @atlas/events   — event envelope, publisher/subscriber ports
└── testing/    @atlas/testing  — factories & helpers for tests
```

---

## @atlas/shared — The Foundation

Everything else depends on this. It's pure TypeScript with **no NestJS or framework dependencies** — it works anywhere.

### Money

The most important type in the platform.

```typescript
const fee = Money.fromMinor(2500, 'NGN');     // ₦25.00 (2500 kobo)
const rent = Money.fromMajor(1250, 'NGN');    // ₦1,250.00 (125000 kobo)

fee.add(rent);          // same-currency addition
fee.subtract(rent);     // same-currency subtraction
fee.isPositive();       // predicates
fee.toJSON();           // { amount: 2500, currency: 'NGN' }  ← API payload
```

**Key rules enforced by the type:**
1. Amounts are always **integers in minor units** (kobo/cents) — never floats
2. Currency is validated against a fixed set (`SUPPORTED_CURRENCIES`)
3. Cross-currency arithmetic **throws** — you can't accidentally add USD to NGN
4. `fromMajor` uses the currency's exponent (NGN=2, XOF=0) for correct conversion

Why does `Money.fromMinor` throw on `Number.isSafeInteger`? Because money must be exact. JavaScript numbers can represent integers up to 2^53 exactly; beyond that, precision is lost — and losing precision with money is unacceptable.

### Errors

The standardized error format from the API Standards:

```typescript
new NotFoundError('PAYMENT_NOT_FOUND', 'Payment not found')
  .withRequestContext({ requestId: 'req_1', correlationId: 'corr_1' })
  .toResponse();
// → { error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment not found',
//              details: [], requestId: 'req_1', correlationId: 'corr_1' } }
```

**The hierarchy:**
```
AtlasError          — base: code + statusCode + details
├── DomainError     — 422 business rule violation
├── NotFoundError   — 404
├── ConflictError   — 409
├── UnauthorizedError — 401
└── ForbiddenError  — 403
```

Every error carries:
- A **stable machine-readable code** (PAYMENT_NOT_FOUND) — clients match on this, never on the message text
- An **HTTP status** — so controllers map errors to responses without switch statements
- **Details** — structured field-level validation info

### UUIDv7

```typescript
const id = newId();        // 0192ab45-...-7...  (time-ordered)
isUuidV7(id);              // true
extractTimestamp(id);      // milliseconds since epoch, embedded in the id
```

UUIDv7 embeds the creation timestamp, which:
- Makes IDs **time-ordered** (great for database index locality)
- Lets you sort by creation time without a separate timestamp column
- Aligns with the API Standards: "every externally visible resource uses UUIDv7"

### Correlation IDs

```typescript
CORRELATION_ID_HEADER      // 'x-correlation-id'
createCorrelationContext(req.headers[CORRELATION_ID_HEADER]);
// → { correlationId: '...', provided: true/false }
```

The correlation ID ties every request, log, event, and trace to a single business workflow (SAS §11). If the caller sends one, we propagate it; otherwise we generate a fresh one.

### Pagination

Cursor-based pagination per the API Standards:

```typescript
createCursorPage(items, hasMore, (item) => item.id);
// → { data: [...], page: { nextCursor: '...', hasMore: true } }
```

The key pattern: fetch `limit + 1` rows to detect the next page, then slice the extra probe row off. Offsets are unstable when data changes mid-pagination; cursors aren't.

---

## @atlas/config — Typed Environment Configuration

### The Problem

Services need config (ports, DB URLs, feature flags). Two classic failure modes:
1. Typo in an env var name → undefined at runtime → crash later
2. Wrong type (PORT="abc") → subtle bugs

### The Solution: zod + fail-fast

```typescript
// Each service defines its schema by extending the base:
export const gatewayConfigSchema = baseConfigSchema.extend({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  GATEWAY_GLOBAL_PREFIX: z.string().default('api'),
});

// Fail-fast at startup:
const config = loadConfig(schema, process.env);
// Throws ConfigValidationError listing EVERY invalid field if anything's wrong
```

**Why fail-fast?** A misconfigured service should crash **immediately** at boot with a clear message — not limp along with undefined values and fail at request time. That's what `ConfigModule.forRoot()` does in NestJS: it validates when the module initializes, so the service never starts serving traffic with bad config.

**Why zod?** TypeScript-first schemas with excellent inference. The schema IS the type — no duplication between a runtime validator and a `GatewayConfig` interface.

### The NestJS Integration

```typescript
ConfigModule.forRoot({ schema: gatewayConfigSchema })
// → provides CONFIG (the typed config object) globally via DI
```

Any service injects it:
```typescript
@Inject(CONFIG) private config: GatewayConfig
```

---

## @atlas/logger — Structured JSON Logging

### The Problem

Production systems aren't debugged with human-readable text logs. They're debugged with **searchable structured logs** that carry context (service, correlation ID, trace ID).

### The Solution: pino

Pino is the industry-standard fast JSON logger for Node.js. We wrap it with our conventions.

```typescript
const logger = createLogger({ serviceName: 'ledger', level: 'info' });
logger.info({ transferId: 'txn_1', amount: 100000 }, 'transfer completed');
// → {"level":30,"time":"...","service":"ledger","transferId":"txn_1","msg":"transfer completed"}
```

**Key features:**
1. **Structured JSON** — every log line is parseable/searchable
2. **Service name in every line** — `base: { service }` merges it in
3. **Redaction built-in** — `req.headers.authorization`, passwords, API keys are auto-masked:
   ```json
   { "req": { "headers": { "authorization": "[Redacted]" } } }
   ```
4. **Pretty-print in dev** — `pretty: true` uses pino-pretty for readable local logs, JSON in prod

### The NestJS Integration (AtlasLoggerModule)

```typescript
AtlasLoggerModule.forRoot({ serviceName: 'gateway', pretty: true })
```

This wraps `nestjs-pino` and:
- Uses the **`X-Correlation-ID` request header** as pino-http's request id, so every request's logs carry the correlation id automatically
- Emits structured JSON for every incoming request (method, URL, status, response time)
- Replaces Nest's built-in logger — so even framework logs are structured JSON

**Why nestjs-pino?** It's the first-party NestJS integration for pino. It handles the "attach request context to logs" problem elegantly: when you log inside a request handler, the correlation ID and request metadata are automatically included.

---

## @atlas/events — Event Contracts

### The Envelope

Every event in Atlas follows the same shape (SAS §10):

```typescript
interface EventEnvelope<TData> {
  eventId: string;          // unique occurrence id
  eventType: string;        // "TransferCompleted" — a business fact
  eventVersion: number;     // schema version of data
  occurredAt: string;       // ISO timestamp
  correlationId: string;    // ties to the original request
  causationId?: string;     // the eventId that triggered this one
  producer: string;         // "transfer-service"
  tenantId?: string;        // which org this belongs to
  data: TData;              // business payload
}
```

```typescript
createEnvelope({
  eventType: 'TransferCompleted',
  correlationId: 'corr-1',
  producer: 'transfer-service',
  data: { transferId: 'txn_1', amount: 100000 },
});
```

### Ports (Hexagonal Architecture)

The `EventPublisher` and `EventSubscriber` are **interfaces** (ports), not concrete implementations. Services depend on the interface:

```typescript
interface EventPublisher {
  publish<TData>(envelope: EventEnvelope<TData>): Promise<void>;
  readonly topic: string;
}
```

This means:
- In production, a `GooglePubSubPublisher` implements it
- In tests, the `InMemoryEventBus` implements it
- Services don't care which — they depend on the abstraction

The `InMemoryEventBus` also records published events, which makes test assertions trivial:
```typescript
bus.eventsOfType('TransferCompleted');  // events of that type
```

### Canonical Topics

```typescript
TOPICS.transfer   // 'transfer.events'
TOPICS.ledger     // 'ledger.events'
```
Each service owns its topic namespace (SAS §8). No more string-typo bugs for topic names.

---

## @atlas/testing — Test Helpers

Factories that make test setup concise:

```typescript
money(125000)                  // Money.fromMinor(125000, 'NGN')
naira(1250)                    // Money.fromMajor(1250, 'NGN') → ₦1,250.00
eventEnvelope({ data: {...} }) // valid envelope with sensible defaults
testConfig()                   // config loaded from a clean test env
```

---

## Dependency Graph

```
@atlas/shared   (no dependencies)
     ↑
@atlas/config   → zod, @nestjs/common
@atlas/logger   → @atlas/shared, pino, nestjs-pino
@atlas/events   → @atlas/shared
     ↑
@atlas/testing  → @atlas/shared, @atlas/config, @atlas/events

apps/gateway    → @atlas/config, @atlas/logger, @atlas/shared
```

Note how **@atlas/shared has zero dependencies** — it's the leaf that everything builds on. This keeps the graph acyclic and simple.

---

## What We Proved

1. `Money` enforces financial correctness at the type level — no float bugs
2. `AtlasError` gives every service the same standardized error format
3. `ConfigModule` fail-fasts at startup — misconfigured services can't serve traffic
4. `AtlasLoggerModule` produces structured JSON with correlation IDs for every request
5. `events` decouples producers from transport via ports
6. The gateway now runs with all of it wired together (verified live)

## What's Next in Phase 0

1. **Docker Compose** — Postgres, Redis, Pub/Sub emulator, MailHog, Jaeger
2. **CI/CD** — GitHub Actions (lint + test + build on every PR)
3. **Terraform bootstrap** — infrastructure as code skeleton
4. Later: implement `database`, `auth`, `grpc`, `protobuf` when their phases arrive
