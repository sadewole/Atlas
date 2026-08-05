Absolutely. In fact, I **would** use both—but **not in the MVP**.

One thing I want Atlas to demonstrate is engineering maturity. One of the biggest mistakes engineers make is throwing every trendy technology into a project. A real staff engineer chooses technology because of a specific problem, not because it's popular.

For Atlas, I'd evolve the architecture in phases.

---

# MVP (Months 1–2)

Keep it simple.

### Primary Database

- PostgreSQL (Cloud SQL)

Why?

- ACID transactions
- Financial correctness
- Mature ecosystem
- Excellent indexing
- Partitioning
- Logical replication
- JSON support

This is where all transactional data lives.

---

### Cache

Redis

For:

- Balance cache
- Sessions
- Rate limiting
- Idempotency
- Distributed locks (sparingly)
- Frequently accessed merchant configuration

---

### Event Bus

Google Pub/Sub

---

### Object Storage

Cloud Storage

For

- payout reports
- reconciliation files
- exports
- invoices
- webhook payload archives

---

### Analytics

BigQuery

Initially

ETL

```
Postgres

↓

BigQuery

↓

Looker
```

---

At this stage

No

ClickHouse

No

OpenSearch

---

# Phase 2 (Growth)

Let's imagine Atlas reaches

- 100 million ledger entries
- 20 million transfers
- 5 TB logs

Now Postgres begins doing too much.

---

## Introduce ClickHouse

This is where ClickHouse becomes amazing.

Not as a transactional database.

As an analytics database.

Think

```
Cloud SQL

↓

CDC

↓

Pub/Sub

↓

Dataflow

↓

ClickHouse
```

or

```
Postgres

↓

Debezium

↓

Kafka/PubSub

↓

ClickHouse
```

Every transfer

Every ledger posting

Every payment

Every settlement

gets streamed.

---

## Why ClickHouse?

Imagine a dashboard asking

> "Show transfer volume by merchant, by hour, for the last 18 months."

Postgres

Slow.

ClickHouse

Ridiculously fast.

---

Example queries

```
Top 100 merchants

by

revenue
```

---

```
Transfer volume

per minute

for

last year
```

---

```
Average settlement time

per provider

last 24 months
```

---

```
Fraud score

distribution

per country
```

---

ClickHouse can answer those in milliseconds.

---

# ClickHouse Data

I'd store

```
ledger_events

payment_events

transfer_events

audit_events

api_requests

provider_requests

webhook_deliveries

settlements
```

Notice

Not

Users.

Not

Wallets.

Those remain transactional.

---

# Materialized Views

One of ClickHouse's biggest strengths.

Instead of calculating

```
Total Daily Revenue
```

every query,

ClickHouse computes incrementally as new events arrive.

Example

```
Transfer Events

↓

Materialized View

↓

Daily Revenue
```

Same for

```
Merchant KPIs

Provider Metrics

Hourly Transfers

Settlement Statistics

Fraud Metrics
```

---

# OpenSearch

This solves a completely different problem.

Search.

Not analytics.

---

Think

Operations Dashboard.

Customer Support.

Compliance.

Developers.

---

Search examples

```
Find transfer

containing

"Samuel"
```

---

```
reference:TX_12345
```

---

```
merchantId:abc

status:FAILED

currency:NGN
```

---

```
provider:Paystack

last 7 days
```

---

```
wallet:ATL00012
```

---

Try doing those with SQL.

Painful.

---

# OpenSearch Architecture

```
Cloud SQL

↓

CDC

↓

Pub/Sub

↓

Indexer

↓

OpenSearch
```

Notice

Read-only.

Never write directly.

---

# Indexes

I'd create

```
transfers

payments

merchants

wallets

audit_logs

api_logs

provider_logs

webhooks
```

---

Each document

might look like

```json
{
  "transferId": "TX123",

  "merchant": "FoodHub",

  "status": "COMPLETED",

  "amount": 25000,

  "currency": "NGN",

  "provider": "Paystack",

  "createdAt": "..."
}
```

---

# Why Not Search Postgres?

Could.

Shouldn't.

Postgres excels at transactions.

OpenSearch excels at

- fuzzy search
- autocomplete
- filtering
- aggregations
- highlighting
- full-text search

---

# Logs

I would NOT store application logs in PostgreSQL.

Instead

```
Cloud Run

↓

OpenTelemetry

↓

Fluent Bit

↓

OpenSearch
```

Operations dashboard

can search

```
correlationId

walletId

providerReference

transferId

merchantId
```

instantly.

---

# Audit Search

Compliance officer asks

> "Show every operation performed by Merchant X between January and March."

OpenSearch.

Milliseconds.

---

# API Request Search

Every request

indexed

```
POST /payments

↓

Response

↓

Latency

↓

User

↓

CorrelationID

↓

Searchable
```

Great for debugging.

---

# Complete Data Architecture

```
                 Cloud SQL
        (Source of Truth)

                │

        ┌───────┴────────┐

        ▼                ▼

   CDC / Events      Read Replicas

        │

        ▼

      Pub/Sub

        │

 ┌──────┼───────────────┐

 ▼      ▼               ▼

Redis ClickHouse   OpenSearch

(Cache) (Analytics) (Search)

        ▼

   Looker / Grafana

```

Each technology has a single, well-defined responsibility.

---

# Another Technology I'd Add

If this grows even larger...

I'd introduce

## Apache Pinot

for

real-time operational analytics

or

## Apache Druid

depending on the use case.

But I actually think

**ClickHouse is enough**.

---

# What about Kafka?

People will ask.

I would intentionally **not** use Kafka.

Why?

Because this project is on GCP.

Pub/Sub already gives us:

- durable messaging
- ordering keys
- retries
- dead-letter queues
- auto scaling
- managed infrastructure

Adding Kafka would increase operational complexity without demonstrating a meaningful architectural advantage for Atlas.

---

# What I'd use by the time Atlas reaches "v3"

| Category       | Technology                   | Why                                    |
| -------------- | ---------------------------- | -------------------------------------- |
| API            | NestJS + Fastify             | High-performance services              |
| Transactions   | PostgreSQL                   | Financial source of truth              |
| Cache          | Redis                        | Fast reads and idempotency             |
| Event Bus      | Google Pub/Sub               | Managed event backbone                 |
| Search         | OpenSearch                   | Operational search and log exploration |
| Analytics      | ClickHouse                   | High-speed analytical queries          |
| Warehouse      | BigQuery                     | Historical BI and reporting            |
| Object Storage | Cloud Storage                | Files and archives                     |
| Observability  | OpenTelemetry                | Unified traces, metrics, logs          |
| Metrics        | Prometheus                   | Service metrics                        |
| Dashboards     | Grafana                      | Operational dashboards                 |
| Logging        | Fluent Bit → OpenSearch      | Centralized searchable logs            |
| Secrets        | Secret Manager               | Credential management                  |
| CI/CD          | GitHub Actions + Cloud Build | Build and deployment                   |
| Runtime        | Cloud Run                    | Stateless microservices                |
| Containers     | Docker                       | Packaging                              |
| Infrastructure | Terraform                    | Infrastructure as Code                 |

## One thing I'd also add

Given your goal is to showcase **backend architecture, distributed systems, cloud engineering, and GCP expertise**, I would eventually include **Change Data Capture (CDC)** using PostgreSQL logical replication with **Debezium**.

That would make Atlas particularly impressive because instead of polling the database, every committed transaction would automatically flow into:

- ClickHouse for analytics
- OpenSearch for search
- BigQuery for long-term reporting
- Fraud detection pipelines
- Real-time dashboards

This demonstrates a modern event-driven data architecture that's used in many large-scale fintech platforms. It also gives you an opportunity to show knowledge of event streaming, eventual consistency, and scalable data pipelines—topics that come up frequently in senior and staff-level backend interviews.
