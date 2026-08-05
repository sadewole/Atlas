# AGENTS.md — Atlas Financial Infrastructure Platform

## Project Overview

**Atlas** is a cloud-native financial infrastructure platform. It is **not** a banking app — it is the backend infrastructure behind banking apps. Think Stripe Treasury, Modern Treasury, or Unit.

The platform enables businesses to build wallets, accounts, transfers, payments, settlements, and financial products through APIs.

**Owner:** Samuel Adewole

---

## Quick Context for Any Agent

This project has completed ~55-60% of its design phase. We have NOT started coding yet. All work so far is architecture specifications and design documents.

### What's Done (Design)
- Product vision, scope, non-functional requirements
- Architecture specifications for all 10 core domain services (IAM, Ledger, Wallet, Transfer, Payment, Settlement, Banking Connector, Notification/Webhook, Fraud, Analytics)
- Infrastructure platform (GCP, Cloud Run, Terraform)
- Observability platform (OpenTelemetry, Prometheus, Grafana)
- Data platform (CDC, ClickHouse, OpenSearch, BigQuery)
- CI/CD & Release Engineering
- Disaster Recovery & Business Continuity
- API Standards & Engineering Guidelines
- Testing Strategy & Quality Engineering

### What's NOT Done Yet
- Security Platform Specification
- Developer Platform Specification
- Event Catalog
- Any code or implementation

### Current State
We are ready to start Phase 0 (Project Foundation) after any remaining specifications the user wants to complete. Phase 0 involves monorepo setup, Docker Compose local dev environment, CI/CD pipeline, and shared libraries.

---

## Architecture Summary

### Design Principles
1. **Money is immutable** — Never edit financial history. Use compensating transactions.
2. **Every action is auditable** — Everything leaves an audit trail.
3. **Every operation is idempotent** — Retrying cannot produce duplicate financial effects.
4. **Services own their data** — No service reads another service's database directly.
5. **Events are contracts** — Events are versioned and backward compatible.
6. **Financial correctness over speed** — Analytics can be eventually consistent. Ledger entries cannot.

### Service Architecture (10 Bounded Contexts)

| Service | Responsibility | Key Patterns |
|---------|---------------|--------------|
| **API Gateway** | Auth, rate limiting, routing, correlation IDs | Single entry point, no business logic |
| **IAM** | Users, orgs, roles, permissions, API keys, OAuth | RBAC, tenant isolation, short-lived tokens |
| **Ledger** | Double-entry accounting, immutable journals | CQRS, replay, snapshots, projections |
| **Wallet** | Wallet lifecycle, holds/reserves, balance queries | Optimistic locking, cache-first reads |
| **Transfer** | Orchestrates money movement between accounts | Saga, idempotency, compensation, DLQ |
| **Payment** | Payment intents, checkout sessions, refunds | Provider abstraction, async processing |
| **Settlement** | Payouts, batching, net settlement, fees/taxes | Batch processing, maker-checker |
| **Banking Connector** | External provider abstraction | Hexagonal architecture, circuit breakers, routing |
| **Notification/Webhook** | Email, SMS, push + signed webhooks | Template engine, retry schedules, replay API |
| **Analytics** | Reports, BI, dashboards | CDC, ClickHouse, BigQuery (v2+) |

### Communication
- **External:** REST (OpenAPI)
- **Internal Sync:** gRPC (Protobuf)
- **Async:** Google Pub/Sub (event envelope with versioning)

### Key Technical Patterns
- **Outbox Pattern:** Write business data + outbox event in same DB transaction. Background publisher sends to Pub/Sub.
- **Saga (Orchestrated):** Transfer Service coordinates multi-step workflows with compensation on failure.
- **CQRS:** Separate command models (ledger postings) from read models (balance projections, dashboards).
- **Event Envelope:** Every event carries `eventId`, `eventType`, `eventVersion`, `occurredAt`, `correlationId`, `causationId`, `producer`, `tenantId`, `data`.

### Data Architecture

```
                    Cloud SQL (Source of Truth)
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
       CDC / Events                 Read Replicas
            │
            ▼
         Pub/Sub
            │
     ┌──────┼───────────────┐
     ▼      ▼               ▼
   Redis  ClickHouse   OpenSearch
  (Cache) (Analytics)  (Search)
```

- **PostgreSQL** — OLTP, financial source of truth (ACID, partitioning)
- **Redis** — Cache, idempotency keys, rate limiting, session storage (NOT source of truth)
- **ClickHouse** — Analytics (v2, not in MVP)
- **OpenSearch** — Full-text search, API log search (v2, not in MVP)
- **BigQuery** — Long-term data warehouse, BI

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript |
| Framework | NestJS + Fastify |
| Primary DB | PostgreSQL (Cloud SQL) |
| Cache | Redis (Memorystore) |
| Messaging | Google Pub/Sub |
| Storage | Cloud Storage |
| Secrets | Secret Manager |
| Runtime | Cloud Run (stateless services) |
| CI/CD | GitHub Actions + Cloud Build |
| IaC | Terraform |
| Containers | Docker |
| Observability | OpenTelemetry, Prometheus, Grafana |
| Local Dev | Docker Compose (Postgres, Redis, Pub/Sub emulator, Jaeger, MailHog) |

---

## File Structure (Planned Monorepo)

```
atlas/
├── apps/
│   ├── gateway/
│   ├── auth-service/
│   ├── identity-service/
│   ├── wallet-service/
│   ├── ledger-service/
│   ├── transfer-service/
│   ├── payment-service/
│   ├── settlement-service/
│   ├── webhook-service/
│   ├── notification-service/
│   ├── fraud-service/
│   ├── analytics-service/
│   └── audit-service/
├── packages/
│   ├── shared/
│   ├── config/
│   ├── database/
│   ├── logger/
│   ├── auth/
│   ├── events/
│   ├── grpc/
│   ├── testing/
│   └── protobuf/
├── infra/
│   ├── terraform/
│   ├── kubernetes/
│   ├── docker/
│   └── helm/
├── docs/          # Architecture specifications (current phase)
├── _learn/        # Educational documentation for the user
├── tools/
│   ├── scripts/
│   └── generators/
└── AGENTS.md      # This file
```

---

## Roadmap

### Atlas v1 — Production-ready Financial Infrastructure (5-7 months)
1. **Phase 0:** Monorepo, CI/CD, local infra, shared libs, observability bootstrap
2. **Phase 1:** Identity & Access Management
3. **Phase 2:** Ledger Engine (double-entry, journals, posting engine)
4. **Phase 3:** Wallet Platform
5. **Phase 4:** Transfer Engine (Saga, idempotency, retries)
6. **Phase 5:** Payment Platform
7. **Phase 6:** Settlement Platform
8. **Phase 7:** Banking Connector Platform
9. **Phase 8:** Notification & Webhook Platform
10. **Phase 9:** Operations & Hardening

### Atlas v2 — Enterprise Platform
- ClickHouse analytics, OpenSearch, CDC pipelines, multi-region, developer platform

### Atlas v3 — Commercial Fintech Platform
- Multi-currency, FX, fraud ML, SDKs, enterprise SSO

---

## Key Conventions

### Money
- Always stored/transmitted in minor units (e.g., kobo for NGN)
- Never use floating-point for financial values
- `{ "amount": 125000, "currency": "NGN" }` means ₦1,250.00

### IDs
- External resources use UUIDv7 (time-ordered, URL-safe)
- Internal surrogate keys may also exist

### Errors
- Standardized error format: `{ "error": { "code": "PAYMENT_NOT_FOUND", "message": "...", "details": [], "requestId": "...", "correlationId": "..." } }`
- Error codes are domain-prefixed (PAYMENT_*, LEDGER_*, WALLET_*, etc.)

### API Versioning
- Public REST: URL-based (`/v1/payments`, `/v2/payments`)
- Internal gRPC: Protobuf package versioning (`payment.v1`)

### Every Service Must Have
- Health endpoint (`/health`, `/ready`, `/live`)
- OpenAPI specification
- gRPC definitions
- Structured logging (JSON)
- Distributed tracing (OpenTelemetry)
- Metrics
- Dockerfile
- CI workflow
- Integration tests

---

## Documentation Map

| File | Purpose |
|------|---------|
| `docs/prd.md` | Product Requirements Document (vision, goals, users) |
| `docs/readme.md` | High-level project overview and learning objectives |
| `docs/roadmap.md` | Full v1/v2/v3 roadmap with phases |
| `docs/architecture/sas.md` | System Architecture Specification (principles, domains, patterns) |
| `docs/architecture/iam.md` | Identity & Access Management spec |
| `docs/architecture/ledger.md` | Ledger Service spec (double-entry, journals, replay) |
| `docs/architecture/wallet.md` | Wallet Service spec (holds, reservations, lifecycle) |
| `docs/architecture/transfer.md` | Transfer Service spec (Saga, compensation, state machine) |
| `docs/architecture/payment.md` | Payment Service spec (intents, checkout, refunds) |
| `docs/architecture/settlement.md` | Settlement Service spec (batches, payouts, netting) |
| `docs/architecture/banking-connector.md` | Banking Connector spec (provider abstraction, routing) |
| `docs/architecture/notification.md` | Notification & Webhook Platform spec |
| `docs/tier1/infrastructutre.md` | Infrastructure & Cloud Architecture (GCP, Cloud Run, Terraform) |
| `docs/tier1/observability.md` | Observability Platform (OpenTelemetry, metrics, alerts, SLOs) |
| `docs/tier1/data-specifications.md` | Data Platform (CDC, ClickHouse, OpenSearch, BigQuery) |
| `docs/tier1/disaster-recovery-specifications.md` | Disaster Recovery & Business Continuity |
| `docs/tier1/release-specifications.md` | CI/CD & Release Engineering |
| `docs/tier2/security-specifications.md` | Security Platform (encryption, secrets, audit, compliance) |
| `docs/tier2/api-guidelines.md` | API Standards & Engineering Guidelines |
| `docs/tier2/testling-strategy.md` | Testing Strategy & Quality Engineering |
| `tiers.md` | Document progress tracker (tier classifications) |
| `misc-arc.md` | Data architecture evolution (ClickHouse, OpenSearch decisions) |
| `final-flow.md` | Wrap-up assessment and next-implementation steps |

---

## Agent Instructions

### When starting a new session on this project:
1. Review `AGENTS.md` (this file) for project context
2. Check `docs/roadmap.md` and `final-flow.md` to understand current state
3. Architecture decisions are in `docs/architecture/` — read relevant service specs before writing code
4. Engineering standards are in `docs/tier1/` and `docs/tier2/`

### Before writing any code:
1. **Discuss tradeoffs** with the user first — this is a learning project
2. Reference existing architecture specs for that service
3. Follow the conventions in this file
4. Use NestJS patterns (modules, dependency injection, CQRS where specified)

### Code style:
- TypeScript strict mode
- NestJS conventions (controllers, services, modules, guards, interceptors)
- No comments unless explaining a genuinely non-obvious decision
- Structured JSON logging everywhere
- Every write endpoint needs idempotency support
- Every service needs correlation ID propagation

### Testing:
- Jest for unit/integration tests
- Testcontainers for infrastructure-dependent tests
- Financial operations need dedicated correctness tests (debits == credits, idempotency, no double-spends)

### Deployment:
- Docker Compose for local development
- Each service gets its own Cloud Run deployment
- Infrastructure managed by Terraform (see `infra/`)
