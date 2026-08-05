# 06 — Cloud Infrastructure

## Platform Overview

Atlas runs on Google Cloud Platform. The infrastructure is designed around managed services — we operate as little infrastructure as possible.

```
                 Internet
                     │
             Cloud Armor (WAF)
                     │
           HTTPS Load Balancer
                     │
              API Gateway
                     │
    ┌────────────────┼────────────────┐
    ▼                ▼                ▼
Cloud Run        Cloud Run        Cloud Run
(Payment)        (Transfer)       (Wallet)
    │                │                │
    └────────────────┼────────────────┘
                     │
              Ledger Service (Cloud Run)
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Cloud SQL     Pub/Sub      Memorystore
  (PostgreSQL)                (Redis)

Background Workers (Cloud Run):
  - Outbox Publisher
  - Settlement Processor
  - Notification Worker
  - Webhook Delivery Worker
```

---

## Service Isolation

Each service is independently deployed:

```
payment-service:
  - Cloud Run service (us-central1)
  - Cloud SQL instance: payment-db
  - Pub/Sub topics: payment.events
  - Service account: payment-sa@atlas.iam.gserviceaccount.com

ledger-service:
  - Cloud Run service (us-central1)
  - Cloud SQL instance: ledger-db
  - Pub/Sub topics: ledger.events
  - Service account: ledger-sa@atlas.iam.gserviceaccount.com
```

No service can access another's database. The Payment Service cannot query `ledger-db`. It must call the Ledger Service API. This is enforced by Cloud SQL IAM and network policies.

---

## Environment Strategy

```
Development (atlas-dev)
  │
  ▼
Testing (atlas-test)
  │
  ▼
Staging (atlas-staging)
  │
  ▼
Production (atlas-prod)
```

Each environment is a separate GCP project. Why separate projects (not just separate resources in one project)?

1. **Blast radius:** Accidentally deleting development resources can't affect production
2. **IAM isolation:** Developers can have broad access to dev but restricted access to prod
3. **Billing:** Track costs per environment
4. **Quotas:** Each project has its own quota limits

---

## Networking

### VPC Design

```
atlas-vpc
  ├── Public Subnet
  │     └── Load Balancer (only public-facing component)
  │
  ├── Private Subnet
  │     ├── Cloud Run services (internal)
  │     ├── Cloud SQL instances
  │     └── Redis instances
  │
  └── Management Subnet
        └── Bastion host (emergency access)
```

Services are private by default. Only the load balancer and API Gateway expose public endpoints. Internal services (Ledger, Settlement) have no public IPs.

### Service-to-Service Communication

Internal communication uses:
- **gRPC over private networking** (Cloud Run → Cloud Run)
- **IAM-based authentication** (service accounts identify callers)
- **Pub/Sub** (no direct networking needed — push/pull subscription)

---

## Cloud Run Configuration

### Per-Service Settings

| Service | Min Instances | Max Instances | Concurrency | Memory |
|---------|---------------|---------------|-------------|--------|
| API Gateway | 2 | 100 | 80 | 512MB |
| Payment | 1 | 50 | 40 | 1GB |
| Transfer | 1 | 50 | 40 | 1GB |
| Ledger | 2 | 100 | 20 | 2GB |
| Settlement | 1 | 20 | 10 | 1GB |
| Notification | 1 | 20 | 40 | 512MB |
| Webhook | 1 | 30 | 40 | 512MB |

**Ledger gets higher memory/lower concurrency** because financial operations are CPU-intensive (validation, double-entry checking) and correctness-critical. **API Gateway gets higher concurrency** because it does lightweight routing + auth.

### Scaling

Cloud Run scales based on:
- **Request rate:** New instances spin up as traffic increases
- **Concurrency:** Each instance handles N concurrent requests
- **CPU utilization:** If instances are CPU-bound, more are added

Scale-to-zero: Services with zero traffic scale to zero instances. In development/staging, this saves cost.

---

## Database Architecture

### Cloud SQL (PostgreSQL)

Each service gets its own database instance (or logical database within a shared instance for cost optimization in development):

```
Production:
  ledger-db (dedicated instance, HA, 4 vCPU, 26GB)
  payment-db (dedicated instance, HA, 2 vCPU, 13GB)
  wallet-db (dedicated instance, HA, 2 vCPU, 13GB)
  ...

Development:
  dev-db (shared instance, single zone, 1 vCPU, 3.75GB)
    ├── ledger
    ├── payment
    ├── wallet
    └── ...
```

### PostgreSQL Features We Rely On

1. **ACID transactions** — Every journal posting is atomic
2. **Row-level locking** — `SELECT ... FOR UPDATE` for optimistic locking
3. **Partitioning** — Large tables (journal_postings) partitioned by date
4. **Materialized views** — For accounting summaries
5. **Logical replication** — CDC to Pub/Sub (v2)
6. **Point-in-time recovery** — Restore database to any moment in the retention window

### Connection Pooling

Cloud Run instances are stateless and short-lived. Without connection pooling, each instance would open dozens of database connections, exhausting PostgreSQL's connection limit.

**PgBouncer** sits between Cloud Run and Cloud SQL, pooling connections:
```
Cloud Run instances (hundreds of ephemeral connections)
  ↓
PgBouncer (maintains ~50 persistent connections to PostgreSQL)
  ↓
Cloud SQL
```

---

## Redis (Memorystore)

Redis is a performance layer, NEVER a source of truth.

### What Goes in Redis

| Use Case | Key Pattern | TTL | Notes |
|----------|-------------|-----|-------|
| Balance cache | `wallet:balance:{id}` | 30s | Invalidated on JournalPosted |
| Idempotency keys | `idempotency:{key}` | 24h | Durable backup in PostgreSQL |
| Rate limiting | `ratelimit:{org}:{endpoint}` | 1m | Sliding window counters |
| Sessions | `session:{id}` | 15m | Access token metadata |
| DLQ status | `dlq:{eventId}` | 7d | Processing state for dead letters |

### What Happens If Redis Disappears

Every value in Redis can be reconstructed:
- **Balance cache** → Recompute from ledger (slower, but correct)
- **Idempotency keys** → Fall back to PostgreSQL
- **Rate limiting** → Temporarily permissive, then recovers
- **Sessions** → Users re-authenticate
- **DLQ status** → Lost (acceptable — operational data, not financial)

Atlas continues functioning correctly without Redis — just more slowly. This is by design.

---

## Secrets Management

### Secret Manager

Every credential lives in Google Secret Manager:

```
paystack-api-key        → Banking Connector reads at startup
flutterwave-secret      → Banking Connector reads at startup
jwt-private-key         → IAM Service reads at startup
database-password       → Injected into Cloud Run as env var
sendgrid-api-key        → Notification Service reads at startup
webhook-signing-secret  → Webhook Service reads at startup
```

### Key Rotation

```
1. Generate new key → Store in Secret Manager as NEW_VERSION
2. Application loads BOTH keys (current + previous)
3. Application signs with NEW, verifies with BOTH
4. After grace period → Remove old key
```

Zero-downtime rotation. Application code handles multiple versions during transition.

---

## Infrastructure as Code (Terraform)

### Repository Structure

```
infra/
  modules/
    cloud_run/         # Reusable Cloud Run module
    cloud_sql/         # Reusable Cloud SQL module
    redis/             # Reusable Memorystore module
    pubsub/            # Reusable Pub/Sub module
    storage/           # Reusable Cloud Storage module
    networking/        # Reusable VPC module
    monitoring/        # Reusable monitoring module
    iam/               # Reusable IAM module

  environments/
    dev/               # Development environment
    staging/           # Staging environment
    production/        # Production environment
```

### Terraform Workflow

```
1. Developer modifies Terraform files
2. PR created → terraform plan runs in CI
3. Reviewer sees: "This will create 3 Cloud Run services, 1 database"
4. PR merged → terraform apply runs
5. Infrastructure is provisioned
```

Infrastructure changes follow the same PR → review → merge → deploy workflow as application code.

---

## CI/CD Pipeline

### Pipeline Flow

```
Developer pushes to feature branch
  ↓
GitHub Actions:
  ├── Lint (ESLint)
  ├── Type Check (tsc)
  ├── Unit Tests (Jest)
  ├── Build (Docker image)
  ├── Container Scan (Trivy/Grype)
  └── Push to Artifact Registry
  ↓
PR merged to main
  ↓
GitHub Actions:
  ├── Integration Tests (Testcontainers)
  ├── Deploy to Staging (Cloud Run)
  ├── Smoke Tests (critical flows)
  └── [Manual Approval]
  ↓
Deploy to Production (Cloud Run with traffic splitting)
  ↓
Health Check Verification
  ├── Error rate monitoring
  ├── Latency monitoring
  └── Automatic rollback if unhealthy
```

### What Gets Deployed

**Artifacts, not source code.** The same Docker image that ran in staging deploys to production. We never rebuild between environments — that would invalidate testing.

---

## Observability

### Three Pillars

```
Metrics (Prometheus + Cloud Monitoring)
  → What is happening? (request rate, error rate, latency)

Logs (Cloud Logging → OpenSearch in v2)
  → Why is it happening? (structured JSON logs with correlation IDs)

Traces (Cloud Trace + OpenTelemetry)
  → Where is it happening? (spans across services in a single trace)
```

### OpenTelemetry Pipeline

```
Atlas Service (NestJS + OTel SDK)
  ↓ OTLP (gRPC)
OpenTelemetry Collector
  ├── Traces → Cloud Trace / Grafana Tempo
  ├── Metrics → Prometheus
  └── Logs → Cloud Logging
```

Services instrument once with OpenTelemetry. The collector routes data to different backends. This means we can swap backends (e.g., switch from Cloud Trace to Grafana Tempo) without changing application code.

### Standard Log Format

```json
{
  "timestamp": "2026-07-30T12:00:00.000Z",
  "level": "INFO",
  "service": "payment-service",
  "traceId": "abc123...",
  "spanId": "def456...",
  "correlationId": "ghi789...",
  "tenantId": "org_xyz",
  "message": "Payment intent created",
  "paymentId": "pi_123"
}
```

Every log is JSON. Every log has trace + correlation IDs. Logs are structured, not prose.

---

## Multi-Region (v2)

In v1, Atlas runs in a single region (us-central1). In v2, we add cross-region:

```
Primary Region (us-central1)
  ├── Cloud Run services (active)
  ├── Cloud SQL (primary, read/write)
  └── Pub/Sub

Standby Region (us-east1)
  ├── Cloud Run services (warm, not serving traffic)
  ├── Cloud SQL (read replica)
  └── Cross-region backup
```

Failover: If us-central1 goes down, DNS switches to us-east1, read replica is promoted to primary, and Cloud Run services begin serving traffic.

---

## Key Takeaways

1. **Managed services first.** Cloud Run, Cloud SQL, Pub/Sub — we operate as little infrastructure as possible.
2. **Service isolation is enforced at infrastructure level.** IAM, VPC, separate databases.
3. **Environments are separate GCP projects.** Blast radius containment.
4. **Redis is a cache, never a source of truth.** Everything can be reconstructed.
5. **Secrets live in Secret Manager, never in code or config files.**
6. **Terraform manages infrastructure.** Infrastructure changes follow the same PR workflow as code.
7. **Observability is built in, not bolted on.** OpenTelemetry, structured logging, correlation IDs.
8. **Deploy artifacts, not source code.** Same image from staging to production.

## Next: [Security & Multi-Tenancy](./07-security-and-multitenancy.md)
