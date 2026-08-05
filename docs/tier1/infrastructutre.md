Perfect.

I think this is actually the most important document we'll write after the Ledger.

Why?

Because this document decides **how every service is deployed, secured, communicates, scales, and survives failures.**

Everything we've designed so far has assumed an infrastructure.

Now we're going to define it.

---

# Atlas Financial Infrastructure

# Infrastructure & Cloud Architecture Specification (ICAS)

**Version 1.0**

---

# Purpose

The Infrastructure Platform provides the cloud foundation for Atlas.

It is responsible for:

- Compute
- Networking
- Service Discovery
- Databases
- Messaging
- Secrets
- Storage
- CI/CD
- Observability
- Security
- Disaster Recovery

Business services **must not** know how infrastructure is provisioned or managed.

Infrastructure should be reproducible through code.

---

# Design Principles

Atlas infrastructure follows these principles:

- Infrastructure as Code
- Immutable Deployments
- Zero Trust Networking
- Stateless Services
- Managed Services First
- Horizontal Scalability
- Multi-Environment Isolation
- Observability by Default
- Security by Default

---

# Why GCP?

Atlas is intentionally designed for Google Cloud because it offers managed services that align well with event-driven microservices while allowing us to focus on platform engineering rather than infrastructure maintenance.

Primary services we'll use:

| Responsibility     | GCP Service                 |
| ------------------ | --------------------------- |
| Compute            | Cloud Run                   |
| Database           | Cloud SQL (PostgreSQL)      |
| Cache              | Memorystore (Redis)         |
| Messaging          | Pub/Sub                     |
| Storage            | Cloud Storage               |
| Secrets            | Secret Manager              |
| Container Registry | Artifact Registry           |
| Monitoring         | Cloud Monitoring            |
| Logging            | Cloud Logging               |
| Tracing            | Cloud Trace + OpenTelemetry |
| DNS                | Cloud DNS                   |
| Protection         | Cloud Armor                 |
| Identity           | IAM                         |

---

# High-Level Architecture

```text
                    Internet
                        │
                Cloud Armor (WAF)
                        │
              HTTPS Load Balancer
                        │
                 API Gateway/BFF
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
   Payment        Transfer        Wallet Service
    Service         Service
        │               │
        └───────────────┼────────────────┐
                        ▼
                  Ledger Service
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     Cloud SQL      Pub/Sub        Redis
                        │
                        ▼
               Background Workers
```

Notice:

Services **never** communicate directly with databases they do not own.

---

# Deployment Model

Every service is independently deployable.

```text
payment-service

wallet-service

ledger-service

transfer-service

settlement-service

iam-service

notification-service

connector-service
```

Each service has:

- Independent Docker image
- Independent Cloud Run service
- Independent deployment pipeline
- Independent autoscaling policy

---

# Why Cloud Run?

Cloud Run gives us:

- Zero server management
- Fast deployments
- Autoscaling
- Scale-to-zero (for low traffic services)
- Native IAM integration
- Simple networking
- Pay-per-use

For Atlas, this is a better trade-off than managing Kubernetes from day one.

---

# When Would We Use GKE?

Not initially.

I'd introduce Kubernetes only when one of these becomes true:

- Long-running streaming consumers
- Stateful workloads requiring custom scheduling
- Advanced service mesh requirements
- Complex multi-cluster deployments
- Extremely high sustained traffic

The architecture should allow migration without changing application code.

---

# Environment Strategy

We'll maintain isolated environments.

```text
Development

↓

Testing

↓

Staging

↓

Production
```

Each environment has:

- Separate Cloud SQL instance
- Separate Pub/Sub topics
- Separate Redis instance
- Separate Secret Manager namespace
- Separate Cloud Storage buckets

No shared production resources.

---

# Project Structure

Rather than putting everything into a single GCP project, I'd separate environments into different projects.

```text
atlas-dev

atlas-test

atlas-staging

atlas-prod
```

This reduces the blast radius of mistakes and simplifies IAM.

---

# Networking

We'll create a dedicated VPC.

```text
atlas-vpc
```

Inside it:

```text
Public

Private

Management
```

Services remain private unless they explicitly expose public APIs.

---

# Private Communication

Internal service communication should use:

- Private networking
- Service authentication
- mTLS (future)
- IAM-based identity

Never expose internal APIs publicly.

---

# Database Architecture

Each service owns its data.

Example:

```text
Ledger Service
        │
 ledger_db

Wallet Service
        │
 wallet_db

IAM Service
        │
 iam_db
```

No shared schemas.

No cross-service joins.

Communication happens through APIs and events.

---

# PostgreSQL Configuration

Cloud SQL:

- High Availability enabled (production)
- Automated backups
- Point-in-time recovery
- Read replicas where needed
- Partitioning for large financial tables
- Connection pooling via PgBouncer

Financial workloads benefit more from stable, predictable performance than aggressive optimization.

---

# Redis

Redis is **not** a source of truth.

We'll use it for:

- Rate limiting
- Idempotency keys
- Session storage (where appropriate)
- Cached merchant configuration
- Short-lived balance projections
- Distributed locks (only when necessary)

If Redis disappears, Atlas should continue functioning correctly—only more slowly.

---

# Pub/Sub

Pub/Sub is the backbone of the platform.

Example topics:

```text
payments.events

ledger.events

wallet.events

transfer.events

settlement.events

notification.events

audit.events

webhook.events
```

Consumers subscribe independently.

---

# Background Workers

Some operations should never execute synchronously.

Workers handle:

- Settlement processing
- Notification delivery
- Webhook retries
- Report generation
- Reconciliation
- Scheduled cleanup
- Payment expiration

Workers are deployed as separate Cloud Run services subscribed to Pub/Sub topics.

---

# Cloud Storage

Used for durable file storage.

Examples:

- Settlement reports
- CSV exports
- Audit exports
- Invoice PDFs
- Reconciliation files
- Archived webhook payloads

Application binaries and secrets are never stored here.

---

# Secrets Management

Every credential lives in Secret Manager.

Examples:

```text
paystack-api-key

flutterwave-secret

jwt-private-key

database-password

sendgrid-api-key
```

Applications retrieve secrets at startup or through controlled rotation mechanisms.

---

# Configuration

Separate configuration from secrets.

Configuration:

```text
DEFAULT_CURRENCY

MAX_RETRY_COUNT

WEBHOOK_TIMEOUT

SETTLEMENT_BATCH_SIZE
```

Secrets:

```text
API Keys

Passwords

Certificates

Private Keys
```

---

# Container Strategy

Each service has:

```Dockerfile
FROM node:22-alpine

↓

Build

↓

Test

↓

Minimal Runtime Image
```

Images are:

- Versioned
- Immutable
- Stored in Artifact Registry
- Scanned for vulnerabilities

---

# CI/CD Pipeline

Every merge to `main` triggers:

```text
Lint

↓

Unit Tests

↓

Integration Tests

↓

Build Image

↓

Security Scan

↓

Push Artifact Registry

↓

Deploy Staging

↓

Smoke Tests

↓

Manual Approval

↓

Production
```

Production deployments require human approval.

---

# Deployment Strategy

We'll use:

- Rolling deployments
- Canary deployments (later)
- Automatic rollback on failed health checks

Cloud Run traffic splitting enables progressive rollouts.

---

# Health Checks

Every service exposes:

```http
GET /health
```

and

```http
GET /ready
```

Health endpoints should validate only what they need to.

For example:

- Liveness: Is the process running?
- Readiness: Can it serve requests?

Avoid expensive database queries in health checks.

---

# Autoscaling

Each service defines:

- Minimum instances
- Maximum instances
- CPU target
- Concurrency
- Request timeout

Different services have different scaling characteristics.

---

# API Gateway

The gateway provides:

- Authentication
- Rate limiting
- Request validation
- Correlation IDs
- Logging
- Routing
- API versioning

Business services remain focused on domain logic.

---

# Infrastructure as Code

Terraform structure:

```text
infra/

  environments/
    dev/
    staging/
    production/

  modules/
    cloud_run/
    cloud_sql/
    redis/
    pubsub/
    storage/
    networking/
    monitoring/
    iam/
```

Reusable modules prevent duplication and keep environments consistent.

---

# Security

Infrastructure security includes:

- Private networking
- Least-privilege IAM
- Secret Manager
- Cloud Armor
- TLS everywhere
- Audit logging
- Encryption at rest
- Encryption in transit

No service account should have broad project-wide permissions.

---

# Cost Management

We'll define budgets and alerts for:

- Cloud Run
- Cloud SQL
- Pub/Sub
- Cloud Storage
- Networking

Resource labels should include:

- Environment
- Service
- Team
- Cost center (future)

This simplifies operational reporting.

---

# Observability Hooks

Every service automatically exports:

- Logs
- Metrics
- Traces

No service should require custom work just to become observable.

OpenTelemetry SDKs become part of the shared platform libraries.

---

# Platform Standards

Every new service must include:

- Dockerfile
- Health endpoints
- Metrics endpoint
- Structured logging
- Correlation ID support
- OpenTelemetry instrumentation
- Terraform module
- CI/CD pipeline
- Runbook
- Architecture documentation

These become part of the engineering definition of done.

---

# Future Evolution

As Atlas grows, the infrastructure should evolve without major architectural rewrites.

Potential future enhancements include:

- Multi-region active/passive deployment
- Global HTTP Load Balancing
- GKE for specialized workloads
- Service mesh (Istio or Anthos Service Mesh)
- Regional Pub/Sub subscriptions
- Cloud Spanner for globally distributed metadata (only if justified)
- Dedicated analytics clusters
- Internal developer platform automation

Notice that these are evolutionary steps, not prerequisites.

---

# Why This Architecture?

The infrastructure is intentionally **boring** in the best possible way.

Instead of chasing complexity, it emphasizes:

- Managed services over self-hosted infrastructure
- Strong operational practices
- Reproducible deployments
- Clear ownership boundaries
- Incremental evolution

That mirrors how many successful engineering organizations build cloud-native platforms.

---

# Next: Observability Platform Specification (OPS)

Now that we've defined where Atlas runs, the next question is:

> **How do we know it's healthy?**

The Observability Platform will define:

- OpenTelemetry instrumentation
- Structured logging standards
- Distributed tracing
- Prometheus metrics
- Grafana dashboards
- SLI/SLO definitions
- Error budgets
- Alerting strategy
- Correlation IDs
- Incident response workflow
- Operational dashboards
- Performance profiling

This is the document that transforms Atlas from "running" into "operable." It also lays the foundation for introducing ClickHouse and OpenSearch later as specialized analytics and search platforms, without changing the core application architecture.
