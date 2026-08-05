If the **Ledger Service** is the heart, then the **Transfer Service** is the brain.

It coordinates everything.

It owns the business workflow.

It never owns money.

It never owns balances.

It simply ensures that money moves correctly through the platform.

---

# Atlas Financial Infrastructure

# Transfer Service Specification (TSS)

Version 1.0

---

# Purpose

The Transfer Service orchestrates every movement of value within Atlas.

It coordinates:

- Wallet validation
- Fund reservation
- Ledger posting
- Settlement
- Notifications
- Webhooks
- Fraud checks
- Audit logging

It **does not** directly debit or credit balances.

---

# Design Philosophy

Think of the Transfer Service as an **orchestrator**.

```text
Wallet

↓

Reserve Funds

↓

Ledger

↓

Post Journal

↓

Wallet Projection

↓

Settlement

↓

Notification

↓

Webhook
```

The Transfer Service coordinates the journey.

Each service owns its own responsibility.

---

# Transfer Types

We'll support multiple transfer categories from day one.

```text
INTERNAL

EXTERNAL

BANK_TRANSFER

MERCHANT_PAYMENT

PAYOUT

REFUND

REVERSAL

ESCROW

SETTLEMENT

FEE

ADJUSTMENT
```

Every transfer type has its own validation policy.

---

# Transfer Lifecycle

This is one of the most important diagrams.

```text
                CREATED
                    │
                    ▼
              VALIDATING
                    │
                    ▼
           FUNDS_RESERVED
                    │
                    ▼
           LEDGER_POSTING
                    │
                    ▼
              SETTLING
                    │
                    ▼
             COMPLETED
```

Failure path

```text
VALIDATING

↓

FAILED
```

or

```text
FUNDS_RESERVED

↓

COMPENSATING

↓

FAILED
```

No transfer ever disappears.

Every transfer reaches a terminal state.

---

# Transfer Entity

```typescript
Transfer;

id;

reference;

type;

status;

sourceWalletId;

destinationWalletId;

currency;

amount;

feeAmount;

description;

idempotencyKey;

correlationId;

initiatedBy;

createdAt;

completedAt;
```

Notice

No balance field.

The transfer isn't responsible for accounting.

---

# State Machine

```text
CREATED

↓

VALIDATING

↓

RESERVING_FUNDS

↓

RESERVED

↓

POSTING_LEDGER

↓

SETTLING

↓

COMPLETED
```

Failure

```text
FAILED
```

Compensation

```text
COMPENSATING

↓

COMPENSATED

↓

FAILED
```

This gives us a complete audit trail.

---

# Happy Path

Let's walk through an internal transfer.

Samuel

sends

₦5,000

to

John

---

Step 1

Receive request

```http
POST /v1/transfers
```

---

Step 2

Validate

- source wallet exists
- destination exists
- wallets active
- currency matches
- sufficient funds
- limits
- fraud rules

---

Step 3

Reserve funds

Wallet Service

```text
Reserve

₦5,000
```

Money hasn't moved.

Only availability changed.

---

Step 4

Create transfer

Status

```text
RESERVED
```

---

Step 5

Create ledger journal

Ledger Service

Creates

```text
Debit

Samuel Liability

Credit

John Liability
```

Balanced.

---

Step 6

Ledger posts journal

Publishes

```text
JournalPosted
```

---

Step 7

Wallet projection updates

Samuel balance

↓

John balance

---

Step 8

Reservation captured

Funds permanently moved.

---

Step 9

Transfer

```text
COMPLETED
```

---

Step 10

Publish

```text
TransferCompleted
```

Subscribers

Analytics

Notification

Webhook

Fraud

Audit

---

# Sequence Diagram

```text
Client
   │
   │ Create Transfer
   ▼
Transfer Service
   │
   ├──────────────► Wallet Service
   │               Reserve Funds
   │
   ◄─────────────── Success
   │
   ├──────────────► Ledger Service
   │               Post Journal
   │
   ◄─────────────── Journal Posted
   │
   ├──────────────► Wallet Service
   │               Capture Reservation
   │
   ◄─────────────── Success
   │
   ▼
Transfer Completed Event
```

---

# Why Reserve First?

Imagine this

Wallet

₦10,000

Two transfers arrive simultaneously.

Both

₦10,000

Without reservations

Both pass validation.

Both debit.

Negative balance.

Reservations eliminate that race.

---

# Saga Pattern

This service owns the Saga.

Why?

Because no distributed transaction exists across services.

Instead

```text
Reserve

↓

Ledger

↓

Settlement

↓

Notify
```

If one step fails

Compensate.

---

# Compensation

Suppose

Ledger unavailable.

We already reserved money.

Need rollback.

```text
Release Reservation

↓

Transfer Failed

↓

Publish Failure Event
```

No money lost.

---

Suppose

Notification fails.

Do we reverse?

No.

Money already moved.

Notification is retryable.

This distinction between **critical** and **non-critical** steps is fundamental to resilient systems.

---

# Saga Orchestration vs Choreography

Many tutorials jump straight to choreography (services reacting only to events).

For Atlas, we'll use an **orchestrated Saga** for financial workflows.

The Transfer Service explicitly coordinates:

1. Reserve funds.
2. Request ledger posting.
3. Capture or release reservation.
4. Publish completion.

This centralizes the business workflow while still allowing downstream services (Analytics, Notifications, Webhooks) to react independently.

---

# Idempotency

Every write request

Must include

```http
Idempotency-Key
```

Stored

```text
key

request_hash

response

expires_at
```

If same key arrives

Return original response.

No duplicate transfer.

---

# Database

```text
transfers

transfer_status_history

transfer_steps

idempotency_keys

saga_instances

outbox_events
```

---

# Transfer Status History

Never overwrite status.

Instead

```text
Transfer

CREATED

↓

VALIDATING

↓

RESERVED

↓

POSTED

↓

COMPLETED
```

Stored forever.

Perfect audit trail.

---

# Saga Table

```text
id

transfer_id

current_step

status

retry_count

started_at

completed_at
```

Useful for

Recovery.

Monitoring.

Operations.

---

# Retry Policy

Some failures

Retry

Some

Never retry.

Retry

```text
Database timeout

Pub/Sub timeout

Network timeout

Cloud Run unavailable
```

Do not retry

```text
Insufficient funds

Invalid wallet

Frozen wallet

Currency mismatch
```

---

# Dead Letter Queue

Suppose

Ledger down

After

10 retries

Move event

↓

DLQ

Operations dashboard

↓

Manual recovery

Never lose events.

---

# Timeouts

Every service call

Has timeout.

Wallet

2s

Ledger

3s

Notification

1s

Webhook

5s

No infinite waiting.

Timeout values should be configurable and tuned based on production metrics rather than hardcoded.

---

# Circuit Breaker

Suppose

Ledger

Down

Don't keep sending traffic.

Instead

```text
Closed

↓

Open

↓

Half Open

↓

Closed
```

Protects system.

We'll use resilience patterns (for example, circuit breakers, retries, and timeouts) consistently across service-to-service communication.

---

# Transfer Events

Published

```text
TransferCreated

TransferValidated

FundsReserved

TransferFailed

TransferCompleted

TransferCompensated
```

Subscribers

Wallet

Analytics

Webhook

Fraud

Notification

Audit

Settlement

---

# Internal vs External Transfers

Internal

Atlas

↓

Atlas

One ledger transaction.

External

Atlas

↓

Bank

Needs

Settlement

Reconciliation

Bank callback

Status polling

Those integrations belong in a future Banking Connector service so the Transfer Service remains focused on orchestration.

---

# Performance

Expected throughput

MVP

100 TPS

Target

1,000 TPS

Future

10,000+ TPS

How?

- Horizontal scaling
- Stateless services
- PostgreSQL partitioning
- Redis caching (where appropriate)
- Pub/Sub fan-out
- Read replicas
- Async projections
- Connection pooling

---

# Observability

Every transfer should be traceable.

Logs

```text
TransferID

CorrelationID

WalletID

JournalID

SagaID
```

Metrics

- transfers/sec
- failure rate
- compensation rate
- retry count
- average latency
- DLQ size

Tracing

One trace

Across

Gateway

↓

Transfer

↓

Wallet

↓

Ledger

↓

Notification

↓

Webhook

OpenTelemetry will stitch these spans together using the shared correlation and trace context.

---

# Security

Every transfer requires:

- Authentication
- Authorization
- Idempotency key
- Request signature (for trusted integrations)
- Rate limiting
- Audit logging
- Input validation
- Tenant isolation

Additionally, every transfer request should include a tenant or organization context, ensuring complete isolation between customers in this multi-tenant platform.

---

# Failure Scenarios

| Scenario                              | Outcome                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| Wallet unavailable before reservation | Transfer fails immediately.                                     |
| Reservation succeeds, ledger fails    | Release reservation and mark transfer failed.                   |
| Ledger posts, notification fails      | Retry notification; transfer remains completed.                 |
| Client retries same request           | Return original response using idempotency key.                 |
| Pub/Sub delayed                       | Outbox publisher retries until event is delivered.              |
| Wallet projection corrupted           | Rebuild from ledger events without affecting financial records. |

Notice how financial correctness is never sacrificed for convenience.

---

# Next: Payment Service Specification (PSS)

So far we've built the financial core.

The Payment Service introduces how external clients interact with it:

- Payment Intents
- Checkout Sessions
- Merchant APIs
- Payment Links
- Payment State Machines
- Webhook-driven confirmations
- Async payment processing
- Expiration and cancellation
- Future integration points for banks and payment providers

This is where Atlas starts looking less like an internal accounting platform and more like a complete financial infrastructure product that external developers can build on.
