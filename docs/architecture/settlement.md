This is where Atlas becomes something that could realistically power a marketplace like Uber, Bolt, Jumia, DoorDash, or Stripe Connect.

One important architectural principle before we begin:

> **A successful payment does not necessarily mean the merchant gets paid immediately.**

This distinction is at the heart of modern financial platforms.

The ledger records ownership of funds immediately.

Settlement determines **when and how** those funds leave the platform.

---

# Atlas Financial Infrastructure

# Settlement Service Specification (SSS)

Version 1.0

---

# Purpose

The Settlement Service is responsible for converting internal financial obligations into external payouts.

It manages:

- Merchant settlements
- Payout schedules
- Net settlement calculations
- Fees
- Taxes
- Bank payouts
- Failed payouts
- Settlement reconciliation

It **does not**:

- Collect payments
- Post ledger entries directly
- Manage wallets

---

# What is Settlement?

Imagine a customer pays a merchant.

Customer

↓

Pays

₦100,000

Immediately

The ledger records

```text
Customer Liability ↓

Merchant Liability ↑
```

The merchant now owns the money.

But...

The bank transfer may happen

Tomorrow.

Next week.

End of month.

Settlement determines

When

and

How

money leaves Atlas.

---

# Settlement Lifecycle

```text
Payment Captured

↓

Eligible

↓

Settlement Window

↓

Settlement Batch

↓

Processing

↓

Bank Transfer

↓

Completed
```

Failure

```text
Bank Rejects

↓

Retry

↓

Manual Review
```

---

# Settlement Entity

```typescript
Settlement;

id;

merchantId;

currency;

grossAmount;

feeAmount;

taxAmount;

netAmount;

status;

scheduleId;

batchId;

createdAt;

completedAt;
```

---

# Gross vs Net

Suppose

Customer pays

₦100,000

Processing fee

₦2,500

VAT

₦375

Merchant receives

```text
Gross

100,000

-

Fee

2,500

-

VAT

375

=

97,125
```

Atlas stores

Every value separately.

Never

Just

```text
Amount
```

---

# Settlement Schedule

Every merchant chooses

```text
Instant

Daily

Weekly

Monthly

Manual
```

---

Example

Merchant A

```text
Daily
```

Merchant B

```text
Weekly
```

Merchant C

```text
Manual Approval
```

The scheduler simply asks:

> Which settlements are eligible today?

---

# Settlement Window

Example

Daily

Cutoff

```text
00:00

↓

23:59
```

Everything inside

One batch.

Weekly

Monday

↓

Sunday

Monthly

1st

↓

Last Day

---

# Why Windows?

Without windows

Thousands of bank transfers.

With windows

One batch.

Cheaper.

Faster.

Auditable.

---

# Settlement Batch

```typescript
SettlementBatch;

id;

currency;

status;

totalAmount;

merchantCount;

transferCount;

createdAt;

processedAt;
```

---

Example

Batch

```text
NGN

July 30

2026
```

Contains

```text
Merchant A

Merchant B

Merchant C

Merchant D
```

---

# Settlement Flow

```text
Transfer Completed

↓

Settlement Eligible

↓

Scheduler

↓

Create Batch

↓

Generate Payouts

↓

Bank Connector

↓

Confirmation

↓

Settlement Complete
```

Notice

Transfer

Already completed.

Settlement

Is independent.

---

# Marketplace Settlement

Marketplace

Customer

↓

Marketplace

↓

Restaurant

↓

Driver

↓

Platform Fee

One payment

Multiple recipients.

---

Example

Customer pays

₦10,000

Distribution

```text
Restaurant

7,500

Driver

1,500

Platform Fee

1,000
```

Ledger creates

Multiple postings.

Settlement creates

Multiple payouts.

---

# Split Settlement

```text
Payment

↓

Settlement Plan

↓

Merchant

↓

Affiliate

↓

Vendor

↓

Platform
```

Every recipient receives an independent settlement instruction.

---

# Bank Connector

This is where external banking begins.

We'll intentionally isolate banking logic.

```text
Settlement Service

↓

Bank Connector

↓

Monnify

↓

Paystack

↓

Flutterwave

↓

NIBSS

↓

Future Banks
```

The Settlement Service never knows provider-specific APIs.

---

# Payout Entity

```typescript
Payout;

id;

settlementId;

bankAccount;

amount;

currency;

status;

provider;

providerReference;

failureReason;

createdAt;
```

---

# Payout States

```text
CREATED

↓

QUEUED

↓

PROCESSING

↓

SENT

↓

CONFIRMED
```

Failure

```text
FAILED

↓

RETRYING

↓

MANUAL_REVIEW
```

---

# Why Separate Payouts?

One settlement

May generate

Many payouts.

Example

Merchant

Has

Three bank accounts.

Split

Automatically.

---

# Settlement APIs

Create Settlement

```http
POST

/v1/settlements
```

Retrieve Settlement

```http
GET

/v1/settlements/{id}
```

List Settlements

```http
GET

/v1/settlements
```

Retry

```http
POST

/v1/settlements/{id}/retry
```

Cancel

```http
POST

/v1/settlements/{id}/cancel
```

---

# Events

Published

```text
SettlementCreated

SettlementEligible

SettlementStarted

SettlementCompleted

SettlementFailed

PayoutCreated

PayoutConfirmed

PayoutFailed
```

Subscribers

Analytics

Notification

Webhook

Audit

Reporting

---

# Scheduler

Cloud Scheduler

Runs

```text
Every Hour
```

Checks

```text
Eligible Settlements
```

Creates

Settlement Batches.

For larger deployments, the scheduler should enqueue work onto Cloud Tasks or Pub/Sub rather than processing batches directly, allowing workers to scale independently.

---

# Retry Policy

Retry

Bank timeout

Network timeout

Temporary outage

Do not retry

```text
Invalid account

Account closed

Compliance rejection

Invalid routing
```

Move

↓

Manual Review

---

# Manual Operations

Operations Dashboard

Supports

Retry

Cancel

Approve

Hold

Release

Export

Search

Financial systems need human operational tooling. Not every failure should be resolved automatically.

---

# Compliance Holds

Not every settlement should proceed immediately.

Example triggers:

- Large transaction threshold exceeded
- Suspicious velocity
- Sanctions screening match
- Manual compliance review

New settlement state:

```text
UNDER_REVIEW
```

Only after approval can processing continue.

This makes Atlas extensible for AML and regulatory workflows.

---

# Reconciliation

Every payout

Must reconcile.

Atlas

↓

Bank Response

↓

Provider Report

↓

Internal Ledger

↓

Match

↓

Success

Mismatch

↓

Investigation

We'll build reconciliation reports that identify:

- Missing payouts
- Duplicate payouts
- Amount mismatches
- Status mismatches

---

# Idempotency

Suppose

Bank API

Times out.

Did it send?

Did it fail?

Never assume.

Instead

Every payout

Uses

```text
Payout Reference
```

Unique forever.

Before retrying, Atlas first checks the provider status (if supported) using the provider reference to avoid duplicate external transfers.

---

# Multi-Currency

Settlement batches

Grouped by

Currency.

Example

```text
NGN Batch

USD Batch

EUR Batch

GBP Batch
```

Never

Mix.

Foreign exchange belongs in a dedicated FX service, not in settlement processing.

---

# Security

Settlement operations require stronger controls than ordinary payments.

Requirements:

- Multi-factor authentication for administrative actions
- Dual approval for high-value manual releases (maker-checker pattern)
- Immutable audit logs
- Signed payout files
- Role-based permissions
- Full traceability

This reflects how enterprise financial operations teams work.

---

# Observability

Metrics

- Settlements processed/hour
- Average settlement latency
- Failed payout rate
- Retry count
- Manual review queue size
- Bank connector latency
- Settlement value by currency

Dashboards should expose both operational health and business health.

---

# Sequence Diagram

```text
Transfer Service
        │
        ▼
Settlement Service
        │
        ▼
Settlement Scheduler
        │
        ▼
Batch Generator
        │
        ▼
Bank Connector
        │
        ▼
External Bank
        │
        ▼
Confirmation
        │
        ▼
Settlement Completed Event
```

---

# Database

```text
settlements

settlement_batches

payouts

settlement_schedules

settlement_windows

bank_accounts

provider_callbacks

reconciliation_reports

manual_reviews
```

Notice that provider callbacks are stored separately from payouts. This preserves the raw provider response for troubleshooting and auditing.

---

# Performance Strategy

Settlement processing is inherently batch-oriented, so we optimize for throughput rather than request latency.

We'll achieve this by:

- Parallel payout workers
- Batch database operations
- Pub/Sub-driven processing
- Configurable concurrency limits per provider
- Rate limiting based on provider capabilities
- Checkpointing long-running batches so they can resume after failures

---

# Why This Architecture?

The separation between **Transfers**, **Ledger**, and **Settlement** is intentional:

- **Transfer Service** answers: _Who should receive the money?_
- **Ledger Service** answers: _How is ownership recorded?_
- **Settlement Service** answers: _When and how does the money leave the platform?_

Keeping those concerns separate allows Atlas to support instant internal transfers while still offering configurable payout schedules, compliance reviews, and integrations with multiple banking providers.

---

# Next: Banking Connector Service (BCS)

This is where Atlas begins integrating with the outside world.

We'll design a dedicated integration layer that isolates all provider-specific logic, including:

- Bank account verification
- Transfer initiation
- Transfer status polling
- Webhook ingestion
- Provider adapters
- Failover between providers
- Idempotent external requests
- Signature verification
- Sandbox mode
- Health monitoring
- Circuit breakers
- Provider capability discovery

This service will ensure the rest of Atlas never needs to know whether a payout is being sent through Paystack, Monnify, Flutterwave, NIBSS, or a future banking API. That abstraction is critical for keeping the core financial platform clean, portable, and maintainable.
