Perfect.

This is actually my favorite part of the entire platform.

Why?

Because most engineers think observability means:

> "We have logs."

No.

Production systems aren't debugged with logs.

They're debugged with **logs + metrics + traces + events + profiling + dashboards + alerts**.

If Atlas is going to resemble Stripe, Square, or Modern Treasury, observability has to be treated as its own platform.

---

# Atlas Financial Infrastructure

# Observability Platform Specification (OPS)

**Version 1.0**

---

# Purpose

The Observability Platform provides complete visibility into the health, performance, reliability, and behavior of Atlas.

Its objectives are to:

- Detect failures quickly
- Diagnose problems efficiently
- Measure business health
- Monitor platform performance
- Reduce Mean Time to Detect (MTTD)
- Reduce Mean Time to Recovery (MTTR)

Every service in Atlas must be observable by default.

---

# Design Principles

The platform is built on five pillars:

- Metrics
- Logs
- Traces
- Events
- Profiles (future)

Observability is part of the platform—not something developers add later.

---

# High-Level Architecture

```text
                  Atlas Services
                         │
                         ▼
               OpenTelemetry SDK
                         │
                OTLP (gRPC/HTTP)
                         │
                         ▼
          OpenTelemetry Collector
          ┌────────┬─────────┬─────────┐
          ▼        ▼         ▼         ▼
   Prometheus  Cloud Logging Cloud Trace Pub/Sub
          │        │         │
          ▼        ▼         ▼
       Grafana  OpenSearch  Trace Explorer
```

Notice:

Services export **one telemetry format**.

The collector decides where data goes.

---

# Why OpenTelemetry?

Without OpenTelemetry

```text
Service A

↓

Prometheus SDK

↓

Cloud SDK

↓

Vendor SDK

↓

Logging SDK
```

Every service becomes vendor-aware.

With OpenTelemetry

```text
Service

↓

OTel

↓

Collector

↓

Any Backend
```

Atlas remains portable.

---

# Telemetry Pipeline

Every request automatically generates:

```text
Request

↓

Trace

↓

Metrics

↓

Logs

↓

Events
```

No manual instrumentation for common operations.

---

# Structured Logging

Every log is JSON.

Example

```json
{
  "timestamp": "...",
  "level": "INFO",
  "service": "payment-service",
  "traceId": "...",
  "spanId": "...",
  "correlationId": "...",
  "merchantId": "...",
  "paymentId": "...",
  "message": "Payment captured"
}
```

Never log plain text in production.

---

# Logging Standards

Every log includes

- Timestamp
- Service
- Environment
- Severity
- Correlation ID
- Trace ID
- Span ID
- Tenant ID (if applicable)
- Request ID

This makes cross-service debugging possible.

---

# Correlation IDs

Every incoming request receives

```text
X-Correlation-ID
```

Flow

```text
Client

↓

API Gateway

↓

Payment Service

↓

Transfer Service

↓

Ledger Service

↓

Settlement
```

Same

Correlation ID

Across

Everything.

---

# Trace Propagation

Use

W3C Trace Context.

Headers

```text
traceparent

tracestate
```

No custom tracing protocol.

---

# Distributed Tracing

Imagine

Customer pays.

Trace

```text
Gateway

↓

Payment

↓

Transfer

↓

Ledger

↓

Settlement

↓

Webhook

↓

Notification
```

One

Trace.

Entire

Journey.

---

# Span Design

Each service creates spans.

Example

```text
Payment

├── Validate Request

├── Create Intent

├── Publish Event

└── Return Response
```

Transfer

```text
Transfer

├── Lock Wallet

├── Ledger Post

└── Publish Event
```

Keep spans focused and meaningful.

---

# Metrics

Every service exports

- Request Count
- Error Count
- Latency
- Throughput
- CPU
- Memory
- Queue Depth
- Retry Count

No exceptions.

---

# RED Metrics

For APIs we'll follow the **RED** methodology:

### Rate

Requests

per second

---

### Errors

Error rate

per endpoint

---

### Duration

Latency

P50

P95

P99

---

# USE Metrics

Infrastructure follows

USE

### Utilization

CPU

Memory

Network

---

### Saturation

Queue Size

Connections

Workers

---

### Errors

Infrastructure failures

---

# Business Metrics

Not everything is technical.

Examples

```text
Payments Created

Payments Completed

Transfers Completed

Refunds

Settlement Volume

Wallet Balance

Webhook Deliveries
```

These belong beside system metrics.

---

# Service Dashboards

Every service gets its own dashboard.

Example

Payment Service

```text
Requests/sec

Latency

Errors

Timeouts

Retries

Active Payments
```

Settlement

```text
Settlements/hour

Pending Batches

Payout Failures

Bank Latency
```

---

# Platform Dashboard

One dashboard

Entire system.

```text
API Health

Queue Health

Redis

Cloud SQL

Pub/Sub

Cloud Run

Latency

Availability

Error Rate
```

This is the first screen engineers see during incidents.

---

# Executive Dashboard

Different audience.

Shows

```text
Revenue

Payments

Merchants

Success Rate

Settlement Value

Growth

Transaction Volume
```

Operational health and business health should be separated.

---

# Alerting Philosophy

Not every error

Needs an alert.

Only actionable alerts.

Bad

```text
One request failed.
```

Good

```text
Payment success rate

Dropped below

99%
```

---

# Alert Severity

Levels

```text
INFO

WARNING

HIGH

CRITICAL
```

Critical

Should

Wake

Someone.

---

# SLI

Examples

Payment API

Availability

```text
Successful Requests

/

Total Requests
```

Latency

```text
P95

<

250 ms
```

Settlement

```text
Completed

Within SLA
```

---

# SLO

Examples

Payment API

```text
99.95%

Availability
```

Transfer

```text
99.99%
```

Webhook Delivery

```text
99%

Within

5 Minutes
```

These targets should be realistic and evolve with operational experience.

---

# Error Budgets

Instead of

100%

Availability

Accept

Small

Failure.

Example

99.95%

Means

Remaining

Budget

Can be spent

On

Deployments

Maintenance

Risk

This encourages balanced engineering decisions.

---

# Incident Detection

Sources

- Metrics
- Health checks
- Queue depth
- Failed deployments
- Error rate
- Business KPI anomalies

Alerts should correlate multiple signals where possible to reduce noise.

---

# Health Checks

Every service exposes:

```http
GET /health
```

```http
GET /ready
```

```http
GET /live
```

Definitions

- **Live:** Is the process alive?
- **Ready:** Can it accept traffic?
- **Health:** Overall application health (lightweight)

---

# Logging Pipeline

```text
Cloud Run

↓

OpenTelemetry Collector

↓

Cloud Logging

↓

Log Router

↓

OpenSearch (v2)

↓

Retention
```

Cloud Logging remains the operational source initially; OpenSearch becomes the advanced search platform in v2.

---

# Metrics Pipeline

```text
OpenTelemetry

↓

Collector

↓

Prometheus

↓

Grafana

↓

Alertmanager
```

Cloud Monitoring can also ingest metrics for GCP-native alerting.

---

# Trace Pipeline

```text
Service

↓

Collector

↓

Cloud Trace

↓

Grafana Tempo (optional future)

↓

Trace UI
```

This gives flexibility without locking the platform into one backend.

---

# Sampling Strategy

Don't trace

Everything.

Production

Use

Tail Sampling.

Example

100%

Errors

10%

Successful requests

1%

Background jobs

High-value transactions can always be sampled regardless of rate.

---

# Audit Logs

Audit logs

Are different.

Never sampled.

Never deleted early.

Stored

Long-term.

Every security event.

Every financial action.

Immutable.

---

# Queue Monitoring

Monitor

Pub/Sub

```text
Messages

Oldest Message Age

Dead Letter Queue

Retries

Subscribers

Processing Time
```

Queue health is often the earliest indicator of downstream issues.

---

# Database Monitoring

Cloud SQL

Track

- Query latency
- Lock contention
- Slow queries
- Replication lag
- Connection pool usage
- Deadlocks
- Storage growth

These metrics should be tied to runbooks.

---

# Redis Monitoring

Track

- Memory usage
- Evictions
- Hit ratio
- Latency
- Connected clients

A falling cache hit rate can signal application regressions.

---

# Cloud Run Monitoring

Track

- Instance count
- Cold starts
- CPU utilization
- Memory utilization
- Request concurrency
- Request duration
- Container restarts

Scaling behavior should be visible.

---

# Business Event Stream

Every major domain event is also observable.

Examples

```text
PaymentCaptured

TransferCompleted

SettlementStarted

RefundIssued

WebhookDelivered
```

This enables operational analytics and future event replay tooling.

---

# Incident Response

Every alert links directly to:

- Dashboard
- Trace
- Logs
- Runbook

Example flow:

```text
Alert

↓

Grafana Dashboard

↓

Trace

↓

Logs

↓

Runbook

↓

Resolution
```

Engineers shouldn't waste time searching for context.

---

# Runbooks

Every critical service has documented procedures.

Examples:

- Payment latency spike
- Pub/Sub backlog growth
- Cloud SQL connection exhaustion
- Failed settlement batch
- Provider outage
- Redis unavailable

Runbooks become part of the repository.

---

# Synthetic Monitoring

We'll continuously simulate critical user journeys.

Examples

- Create payment
- Internal transfer
- Merchant login
- Webhook delivery

These tests detect issues before customers report them.

---

# Cost Observability

Track telemetry costs.

Metrics include:

- Log ingestion volume
- Trace storage
- Metrics cardinality
- Dashboard usage

Observability should remain sustainable as Atlas grows.

---

# Security Monitoring

Detect anomalies such as:

- Excessive failed logins
- API key abuse
- Unusual privilege changes
- Unexpected service-to-service traffic
- Secret access anomalies

This complements the IAM platform.

---

# Database

```text
observability/

  dashboards/

  alert_rules/

  recording_rules/

  runbooks/

  telemetry_config/

  otel_collector/

  grafana/

  prometheus/
```

Infrastructure configuration should live alongside Terraform and application code.

---

# Why This Architecture?

Observability is designed as a **first-class platform capability**, not an afterthought.

Key characteristics:

- Vendor-neutral telemetry through OpenTelemetry.
- Unified correlation across services.
- Operational metrics and business metrics coexist.
- Actionable alerts over noisy notifications.
- Runbooks integrated into the incident workflow.
- Evolution path toward ClickHouse and OpenSearch without changing instrumentation.

This architecture ensures Atlas can be operated confidently as it grows from a handful of services to a large distributed financial platform.

---

# Next: Data Platform Specification (DPS)

This is where Atlas begins to separate **transaction processing** from **analytics**.

We'll design:

- Change Data Capture (CDC)
- PostgreSQL logical replication
- Debezium
- Pub/Sub event streams
- ClickHouse analytics
- OpenSearch indexing
- BigQuery warehouse
- Dataflow pipelines
- Materialized views
- Data retention
- Analytics APIs
- Fraud data pipelines

This specification will tie together everything we've discussed about ClickHouse and OpenSearch into a cohesive, production-ready data architecture.
