Excellent.

I think this is where Atlas starts becoming **different from most backend projects**.

Until now we've been designing the **transaction processing system**.

This document is about **everything that happens _after_ a transaction is written.**

This is where ClickHouse, OpenSearch, BigQuery, CDC, analytics, reporting, BI, fraud detection and data engineering all come together.

Most systems make the mistake of querying their OLTP database (PostgreSQL) for analytics. That works...until it doesn't.

Atlas will intentionally separate:

- **OLTP (Operational Database)** → PostgreSQL
- **Search** → OpenSearch
- **Analytics** → ClickHouse
- **Warehouse** → BigQuery

This is exactly how large financial platforms evolve.

---

# Atlas Financial Infrastructure

# Data Platform Specification (DPS)

**Version 1.0**

---

# Purpose

The Data Platform provides a scalable, reliable, and governed architecture for operational analytics, search, business intelligence, reporting, and machine learning.

The platform **never** owns transactional business logic.

Instead, it consumes immutable events and database changes from operational services.

Its responsibilities include:

- Change Data Capture (CDC)
- Event streaming
- Search indexing
- Analytics
- Data warehousing
- Reporting
- Operational dashboards
- Historical analysis
- Machine learning data pipelines

---

# Design Principles

The Data Platform follows these principles:

- Operational databases are optimized for transactions.
- Analytics databases are optimized for queries.
- Search engines are optimized for discovery.
- Warehouses are optimized for reporting.
- Data flows in one direction.
- Source systems remain the source of truth.

---

# High-Level Architecture

```text
                   Operational Services
 ┌────────────────────────────────────────────────────┐
 │ IAM │ Payments │ Ledger │ Wallet │ Transfers │ ... │
 └────────────────────────────────────────────────────┘
                      │
                      │
        PostgreSQL + Domain Events
                      │
      ┌───────────────┴────────────────┐
      ▼                                ▼
 Debezium CDC                    Pub/Sub Events
      │                                │
      └───────────────┬────────────────┘
                      ▼
              Data Ingestion Layer
                      │
     ┌────────────┬─────────────┬────────────┐
     ▼            ▼             ▼
 ClickHouse   OpenSearch    BigQuery
     │            │             │
     ▼            ▼             ▼
 Analytics    Search      BI & Reporting
```

Notice something important.

Nothing writes **back** into PostgreSQL.

Data flows downstream only.

---

# Why Separate Databases?

Different workloads require different storage engines.

| Workload   | Database   |
| ---------- | ---------- |
| Payments   | PostgreSQL |
| Ledger     | PostgreSQL |
| Search     | OpenSearch |
| Dashboards | ClickHouse |
| BI         | BigQuery   |

Trying to make PostgreSQL excel at all of these leads to unnecessary complexity and degraded performance.

---

# The Four Data Layers

Atlas has four distinct storage layers.

---

## Layer 1 — Operational Data (OLTP)

Technology

- PostgreSQL (Cloud SQL)

Purpose

- Create payments
- Record ledger entries
- Transfer money
- Authentication
- Wallet management

Characteristics

- ACID
- Strong consistency
- Small transactions
- Frequent writes

This is the system of record.

---

## Layer 2 — Search

Technology

- OpenSearch

Purpose

- Full-text search
- Audit search
- Merchant search
- API log search
- Transaction lookup

Characteristics

- Fast text queries
- Flexible filtering
- Relevance scoring
- Near real-time indexing

OpenSearch is never treated as a source of truth.

---

## Layer 3 — Analytics

Technology

- ClickHouse

Purpose

- Dashboards
- Time-series analytics
- Financial reports
- Aggregations
- Merchant insights

Characteristics

- Columnar storage
- Massive aggregations
- High compression
- Fast analytical queries

This is where product managers, finance teams, and operations spend most of their time.

---

## Layer 4 — Data Warehouse

Technology

- BigQuery

Purpose

- Historical reporting
- Machine learning datasets
- Compliance exports
- Executive reporting
- Data science

Characteristics

- Petabyte-scale analytics
- SQL
- Long-term retention
- External integrations

BigQuery is optimized for deep analysis, not low-latency dashboards.

---

# Change Data Capture (CDC)

Rather than polling databases, Atlas uses CDC.

```text
PostgreSQL

↓

WAL (Write Ahead Log)

↓

Debezium

↓

Pub/Sub

↓

Consumers
```

Every committed database change becomes an event.

No polling.

No scheduled synchronization jobs.

---

# Why Debezium?

Debezium gives us:

- Ordered database changes
- Low latency
- Reliable replication
- Schema evolution support
- Replay capability

It allows downstream systems to react to changes without impacting operational databases.

---

# CDC Topics

Example topics:

```text
cdc.payments

cdc.wallets

cdc.ledger

cdc.settlements

cdc.users
```

Each stream represents changes from a single bounded context.

---

# Domain Events vs CDC

This distinction is important.

### Domain Events

Represent business facts.

Examples

```text
PaymentCaptured

TransferCompleted

SettlementStarted
```

Published intentionally by applications.

---

### CDC Events

Represent database changes.

Examples

```text
payment.updated

wallet.created

ledger_entry.inserted
```

Generated automatically from the database log.

Applications generally consume domain events; data platforms often consume CDC.

---

# Event Ingestion Layer

Every incoming stream passes through an ingestion layer responsible for:

- Validation
- Schema checks
- Metadata enrichment
- Dead-letter handling
- Routing
- Version compatibility

This keeps downstream consumers simpler.

---

# Data Contracts

Every event must define:

- Event name
- Version
- Schema
- Producer
- Consumers
- Retention policy
- Ownership

Treat event schemas like public APIs.

---

# ClickHouse Architecture

We'll organize ClickHouse by subject areas.

```text
analytics/

payments

transfers

ledger

settlements

merchants

users

operations
```

This keeps ownership aligned with business domains.

---

# Why ClickHouse?

Consider this query:

```sql
Total payment volume
per merchant
per hour
for the last 18 months.
```

PostgreSQL can answer it, but it may become expensive as data grows.

ClickHouse is built for this kind of analytical workload.

---

# Materialized Views

Rather than recalculating expensive aggregations repeatedly, ClickHouse will maintain materialized views.

Examples:

- Daily payment totals
- Hourly settlement volume
- Merchant revenue
- Refund trends
- Failed payment rates

This provides sub-second dashboard performance.

---

# OpenSearch Architecture

Indexes:

```text
payments

audit_logs

webhooks

users

merchants

api_logs
```

Keep indexes focused rather than creating one massive index.

---

# Search Use Cases

Examples:

- Search by customer name
- Search by payment reference
- Search audit history
- Find failed webhooks
- Locate API requests by correlation ID

These queries should never hit PostgreSQL directly.

---

# BigQuery Data Model

BigQuery stores curated datasets.

Examples:

```text
finance

operations

product

risk

executive
```

Each dataset contains denormalized analytical tables optimized for reporting.

---

# Dataflow Pipelines

Dataflow transforms streaming and batch data.

Responsibilities include:

- Cleansing
- Aggregation
- Currency normalization
- Timezone normalization
- Data enrichment
- Data quality checks

Transformations should be repeatable and version-controlled.

---

# Data Retention

Different systems retain data differently.

| Platform   | Typical Retention                                                 |
| ---------- | ----------------------------------------------------------------- |
| PostgreSQL | Operational lifetime                                              |
| ClickHouse | Rolling analytical window (e.g. 2–5 years)                        |
| OpenSearch | Shorter operational window (e.g. 90–365 days, depending on index) |
| BigQuery   | Long-term archival                                                |

Retention policies should be configurable to meet regulatory requirements.

---

# Data Quality

The platform continuously validates:

- Missing events
- Duplicate events
- Out-of-order events
- Invalid schemas
- Broken references

Quality issues generate alerts and operational dashboards.

---

# Replay

Every ingestion pipeline supports replay.

```text
Historical Events

↓

Replay Worker

↓

ClickHouse

↓

Rebuild Dashboards
```

This allows analytics stores to be rebuilt without touching production services.

---

# Fraud Data Pipeline

Fraud systems consume:

- Payment events
- Transfer events
- Login events
- Device metadata
- Velocity metrics

Initially, they generate features for rules-based detection. Machine learning can be introduced later.

---

# Analytics APIs

Rather than exposing ClickHouse directly, Atlas provides Analytics APIs.

Examples:

- Merchant revenue
- Daily payment volume
- Settlement trends
- Webhook delivery performance

This keeps access controlled and allows query optimization behind the scenes.

---

# Governance

Every dataset has:

- Owner
- Description
- Classification
- Retention policy
- Access policy

This becomes increasingly important as the platform grows.

---

# Performance Considerations

Guidelines:

- Avoid cross-system joins.
- Partition large datasets.
- Compress historical data.
- Use materialized views for expensive aggregations.
- Prefer streaming updates for operational dashboards.
- Batch heavy warehouse loads where appropriate.

---

# Evolution Path

The Data Platform evolves incrementally:

### v1

- PostgreSQL
- Pub/Sub
- Operational reporting

### v1.5

- Debezium
- CDC
- Replay support

### v2

- ClickHouse
- OpenSearch
- BigQuery
- Dataflow

### v3

- Real-time feature store
- ML pipelines
- Advanced fraud analytics
- Self-service BI

This avoids premature complexity while giving Atlas a clear scaling strategy.

---

# Why This Architecture?

The Data Platform intentionally separates **transaction processing** from **data consumption**.

That separation gives Atlas:

- Predictable OLTP performance.
- Fast analytical queries.
- Powerful full-text search.
- Scalable reporting.
- Replayable data pipelines.
- Clear ownership boundaries.

Most importantly, it allows the platform to grow from thousands of transactions per day to millions without forcing every workload onto the same database.

---

## Next: CI/CD & Release Engineering Specification

With the application architecture, cloud infrastructure, observability, and data platform defined, the next logical step is **how software safely moves from a developer's laptop into production**.

That document will cover:

- Branching strategy
- GitHub Actions
- Cloud Build
- Artifact Registry
- Terraform deployment workflow
- Environment promotion
- Database migration strategy
- Feature flags
- Progressive delivery
- Canary deployments
- Rollbacks
- Release versioning
- Supply chain security
- Deployment approvals

This is the specification that turns Atlas into a platform capable of delivering changes safely and repeatedly.
