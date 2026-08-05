# 02 — Architecture Principles & Tradeoffs

## The Big Question: Monolith vs Microservices?

### What We Chose: Microservices

Atlas is built as ~12 independently deployable services. Each service owns its database. Services communicate through APIs and events.

### Why

**Arguments for microservices:**
1. **Independent scaling** — The Ledger Service processes high-volume journal entries. The Notification Service processes lower-volume emails. They scale independently.
2. **Team autonomy** — In a real engineering organization, different teams own different services. We're simulating that.
3. **Fault isolation** — If the Notification Service crashes, payments still process.
4. **Technology flexibility** — Though we standardize on NestJS, services could theoretically use different frameworks.
5. **Deployment independence** — Deploy a ledger bug fix without redeploying the entire platform.

**Arguments against microservices (and why we still chose them):**
1. **Operational complexity** — Distributed tracing, service discovery, deployment coordination. We invest in platform tooling to manage this.
2. **Network overhead** — gRPC calls add latency vs in-process calls. We accept this for the isolation benefits.
3. **Data consistency** — No cross-service transactions. We use the Saga pattern instead.
4. **Learning curve** — Harder to reason about. This is a learning project, so that's a feature.

### The Tradeoff We Made

We chose microservices because this project is designed to teach distributed systems concepts. A monolith would be simpler to build but wouldn't teach Saga patterns, event-driven architecture, service-to-service authentication, or distributed tracing.

> **Decision:** Microservices, because the learning value outweighs the operational complexity for this project.

---

## Communication Patterns: REST vs gRPC vs Events

### What We Chose: All Three (for Different Purposes)

| Context | Protocol | Reasoning |
|---------|----------|-----------|
| External APIs | REST (OpenAPI) | Universal compatibility, easy for developers |
| Internal sync calls | gRPC (Protobuf) | Strong contracts, lower latency, generated clients |
| Async notifications | Pub/Sub events | Decoupling, fan-out, replay capability |

### REST for External APIs

Merchants and SDKs interact through REST. Why?
- Every language has an HTTP client
- Easy to test with curl/Postman
- Familiar patterns (GET /payments, POST /payments)
- OpenAPI for documentation generation

### gRPC for Internal Communication

Services call each other through gRPC. Why?
- Strongly typed contracts (Protobuf) — no ambiguous JSON schemas
- Binary serialization is faster than JSON
- HTTP/2 multiplexing for concurrent requests
- Automatic client/server code generation

**Tradeoff:** gRPC is harder to debug (can't just curl it). We accept this because the benefits (type safety, performance, contract enforcement) matter more for internal service communication.

### Pub/Sub for Events

Asynchronous notifications use Google Pub/Sub. Why?
- **Decoupling:** The Transfer Service publishes `TransferCompleted`. Six services subscribe. The publisher doesn't know or care about subscribers.
- **Reliability:** Pub/Sub retains messages until acknowledged.
- **Replay:** Can replay events for recovery.
- **Managed:** No Kafka cluster to manage (this is on GCP).

> **Tradeoff:** Pub/Sub is eventually consistent. A subscriber might process an event seconds after publication. For financial operations, we combine Pub/Sub with the Outbox pattern (see Event-Driven Architecture doc).

---

## Database Per Service vs Shared Database

### What We Chose: Database Per Service

### Why

**The anti-pattern:**
```
Payment Service ──┐
Wallet Service  ──┼── Shared Database
Ledger Service  ──┘
```

This creates:
- **Schema coupling:** Payment Service depends on Wallet tables
- **Deployment coupling:** Ledger migration might break Wallet Service
- **Scaling bottleneck:** One database for all services
- **No clear ownership:** Who can modify the `wallets` table?

**Our pattern:**
```
Payment Service ── payment_db (payments, refunds, payment_methods)
Wallet Service  ── wallet_db (wallets, reservations, limits)
Ledger Service  ── ledger_db (accounts, journals, postings)
```

**Tradeoff we accept:**
- No SQL JOINs across services
- Data duplication (Wallet has a balance projection copied from Ledger)
- Need Saga for cross-service transactions
- More databases to manage (Cloud SQL instances)

> **Decision:** Database per service. The isolation and independent deployability outweigh the operational complexity.

---

## Node.js/NestJS vs Go vs Java

### What We Chose: TypeScript + NestJS

### Why

**Arguments for TypeScript/NestJS:**
1. **Type safety without ceremony:** TypeScript catches type errors at compile time.
2. **NestJS architecture:** Built-in support for modules, dependency injection, guards, interceptors, pipes. Direct support for CQRS, gRPC, and microservices.
3. **Single language:** Same language for front-end tooling if we build admin dashboards later.
4. **Fastify adapter:** High-performance HTTP server.
5. **Hiring alignment:** Showcases a widely-used stack.

**Arguments against (and why we overruled):**
1. **Not the fastest:** Go or Rust would be faster. But for financial workloads, correctness matters more than raw throughput. We scale horizontally.
2. **Single-threaded:** Node.js event loop can be blocked. We mitigate with worker threads for CPU-intensive tasks and keep services stateless.
3. **Runtime overhead:** Larger memory footprint than Go. Cloud Run handles this with autoscaling.

**Why not Go?**
Go would offer better performance and simpler concurrency (goroutines). But NestJS gives us CQRS, gRPC, validation, and OpenAPI generation out of the box. For a learning project, the framework support matters more than raw performance.

**Why not Java/Spring?**
Spring Boot is the enterprise standard for financial systems. But it carries heavier conceptual overhead, slower startup times, and a steeper learning curve for TypeScript developers.

> **Decision:** TypeScript + NestJS. Framework support and learning focus outweigh raw performance concerns.

---

## Google Cloud vs AWS vs Azure

### What We Chose: Google Cloud Platform

### Why

1. **Cloud Run** — Serverless containers. Deploy Docker images without managing Kubernetes. Scale to zero when idle. Pay per request.
2. **Pub/Sub** — Managed event backbone. No Kafka cluster to operate.
3. **Cloud SQL** — Managed PostgreSQL with high availability, automated backups, and point-in-time recovery.
4. **BigQuery** — Serverless data warehouse for analytics. No cluster sizing.
5. **Workload Identity** — Service-to-service authentication without managing API keys.

**Tradeoff:** GCP has a smaller market share than AWS. But its managed services are more "batteries included," which aligns with our goal of building a platform rather than managing infrastructure.

> **Decision:** GCP. The managed services let us focus on application architecture rather than infrastructure operations.

---

## Cloud Run vs GKE (Kubernetes)

### What We Chose: Cloud Run (Initially)

### Why Cloud Run:

| Concern | Cloud Run | GKE |
|---------|-----------|-----|
| Management | None (serverless) | Node pools, upgrades, networking |
| Scaling | Automatic, including to zero | Requires HPA configuration |
| Cost | Pay per request | Pay for running nodes |
| Deployment | `gcloud run deploy` | kubectl + manifests/Helm |
| Startup | Fast (container already built) | Fast but more moving parts |

### When We'd Switch to GKE:

1. Long-running streaming consumers (WebSocket connections, Kafka streams)
2. Stateful workloads requiring custom scheduling (sticky sessions, local storage)
3. Advanced service mesh (Istio, mTLS between every pod)
4. Extremely high sustained traffic (Cloud Run has per-instance concurrency limits)
5. Multi-cluster deployments across regions

> **Decision:** Start with Cloud Run. Migrate to GKE only when Cloud Run's limitations become real bottlenecks. This mirrors how real engineering organizations evolve: choose simpler managed services first, graduate to Kubernetes when needed.

---

## Why Pub/Sub Instead of Kafka?

### The Tradeoff

| Concern | Pub/Sub | Kafka |
|---------|---------|-------|
| Management | Fully managed | Self-hosted or Confluent Cloud |
| Message ordering | Per-key ordering | Per-partition ordering (stronger) |
| Replay | Limited (7-day retention) | Unlimited (log-based) |
| Throughput | Very high | Extremely high |
| Ecosystem | GCP integration | Broader ecosystem (Kafka Connect, KSQL) |
| Cost | Per-message pricing | Infrastructure cost |

### Why Pub/Sub Wins for Atlas:

1. **Zero operations:** No cluster to manage, no partition rebalancing, no ZooKeeper.
2. **GCP integration:** Native IAM, Cloud Monitoring, dead-letter topics.
3. **Sufficient guarantees:** At-least-once delivery with retries is enough for our event-driven architecture.
4. **Learning focus:** Kafka would teach Kafka operations. Pub/Sub lets us focus on event-driven architecture concepts.

> **Decision:** Pub/Sub. The managed experience lets us focus on event-driven design patterns rather than message broker operations.

---

## Saga Pattern vs Two-Phase Commit (2PC)

### What We Chose: Saga (Orchestrated)

### Why Not 2PC?

Two-phase commit (prepare → commit across databases) is:
- **Blocking:** Locks resources across services, reducing throughput
- **Fragile:** If the coordinator crashes, locks may persist
- **Tightly coupled:** Every participant must support distributed transactions
- **Not cloud-native:** Cloud databases (Cloud SQL, BigQuery) don't participate nicely in 2PC

### How Saga Works in Atlas:

```
Transfer Initiated
  │
  ├─ Step 1: Wallet Service reserves funds ✓
  │     If fails → Transfer marked FAILED (nothing to compensate)
  │
  ├─ Step 2: Ledger Service posts journal ✓
  │     If fails → Step 1 compensated (release reservation)
  │
  ├─ Step 3: Capture reservation ✓
  │     If fails → Step 2 compensated (reverse journal)
  │
  └─ Step 4: Publish TransferCompleted event
        If fails → Retry (event is idempotent)
```

Each step has:
- A **forward action** (do the work)
- A **compensating action** (undo the work if a later step fails)
- **Idempotency** (safe to retry)

The Transfer Service orchestrates the Saga. It tracks each step, knows what to compensate, and handles retries.

> **Decision:** Orchestrated Saga. Provides eventual consistency without tight coupling or resource locking.

---

## Summary of Key Tradeoffs

| Decision | We Chose | Alternative | Why |
|----------|----------|-------------|-----|
| Architecture | Microservices | Monolith | Learning distributed systems |
| External API | REST | GraphQL | Universal compatibility |
| Internal API | gRPC | REST | Strong contracts, performance |
| Async | Pub/Sub events | Direct calls | Decoupling, replay |
| Database | Per service | Shared | Independent deployability |
| Language | TypeScript/NestJS | Go/Java | Framework support, learning |
| Cloud | GCP | AWS/Azure | Managed services focus |
| Compute | Cloud Run | GKE | Simplicity, scale-to-zero |
| Transactions | Saga | 2PC | No blocking, cloud-friendly |
| Messaging | Pub/Sub | Kafka | Zero operations |

Every tradeoff represents a deliberate choice. None of these are "the only right answer" — they're the right answers *for Atlas's goals*.

## Next: [Domain-Driven Design](./03-domain-driven-design.md)
