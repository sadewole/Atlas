Excellent. Now we're moving into the document that real backend engineers spend most of their time on.

The PRD tells us **what** we're building.

The **System Architecture Specification (SAS)** tells us **how** we're going to build it.

---

# Atlas Financial Infrastructure

# System Architecture Specification (SAS)

Version: 1.0

Status: Draft

---

# 1. Architecture Principles

These principles should influence every engineering decision.

## 1. Financial correctness over speed

Money is never eventually consistent.

Analytics can be.

Notifications can be.

Emails can be.

Ledger entries cannot.

If we must choose between:

- faster response
- accurate financial data

We always choose accurate financial data.

---

## Every service owns its data

No service can query another service's database.

Never.

Communication happens through:

- REST
- gRPC
- Events

This keeps services independently deployable.

---

## Events are facts

Events represent things that happened.

Good

```
TransferCompleted
```

Bad

```
UpdateBalance
```

One is a fact.

The other is a command.

---

## APIs are contracts

Breaking API changes require versioning.

Never silently break consumers.

---

## Failures are expected

Every service should assume:

- databases go down
- Pub/Sub delays messages
- network partitions happen
- retries occur
- duplicate requests arrive

Everything should still behave correctly.

---

# 2. System Overview

```
                     Clients
         Web / Mobile / Third Parties
                    │
                    ▼
             API Gateway (REST)
                    │
      Authentication & Authorization
                    │
──────────────────────────────────────────────

Identity Domain

Wallet Domain

Ledger Domain

Transfer Domain

Payment Domain

Settlement Domain

Notification Domain

Analytics Domain

Administration Domain

──────────────────────────────────────────────

              Google Pub/Sub
──────────────────────────────────────────────

Cloud SQL

Redis

BigQuery

Cloud Storage
```

---

# 3. Domain Boundaries

One mistake many projects make is creating services around database tables.

We won't.

We'll use **Domain-Driven Design (DDD)**.

## Identity

Responsible for:

Users

Organizations

Roles

Permissions

API Keys

Tokens

Nothing financial belongs here.

---

## Wallet

Responsible for:

Wallet lifecycle

Balances (cached/projection)

Wallet metadata

Freeze

Close

Reserve funds

Release funds

The wallet service **does not own accounting**.

That's Ledger's responsibility.

---

## Ledger

Responsible for:

Journal entries

Double-entry bookkeeping

Posting engine

Account balances

Chart of accounts

Reconciliation

Ledger replay

This is the most critical service in the platform.

---

## Transfer

Responsible for:

Transfers

Transfer state machine

Saga orchestration

Retry coordination

Idempotency

It coordinates movement but **never edits balances directly**.

---

## Payment

Responsible for:

Payment intents

Checkout sessions

Merchant payments

Invoices

Payment links

---

## Settlement

Responsible for:

Settlement batches

Settlement windows

Netting

Payout files

Settlement reports

---

## Notification

Responsible for:

Email

SMS

Push

In-app

Slack

---

## Webhook

Responsible for:

Webhook registration

Delivery

Retries

Signature verification

Dead Letter Queue

Delivery history

---

## Analytics

Responsible for:

Reports

Business intelligence

Revenue

Transfer metrics

Growth metrics

BigQuery pipelines

---

## Fraud

Responsible for:

Velocity limits

Duplicate detection

Risk scores

Country restrictions

AML simulation

Large transaction alerts

---

# 4. Service Catalog

We'll implement each service with the same internal structure.

```
wallet-service

src

Application

Domain

Infrastructure

Presentation

Shared

Config

Tests
```

This is inspired by Clean Architecture and DDD.

---

# 5. API Gateway

The gateway is the only public entry point.

Responsibilities:

Authentication

Authorization

Rate limiting

API versioning

Request validation

Correlation IDs

Request logging

Metrics

Response compression

Routing

The gateway should never contain business logic.

---

# 6. Service Communication

We'll intentionally mix communication styles.

## REST

Used for:

Public APIs

SDK consumers

Third-party integrations

---

## gRPC

Used internally.

Advantages:

Fast

Strong contracts

Streaming

Generated clients

Lower latency

Example:

Wallet Service needs user information.

Instead of HTTP:

```
GET /users/123
```

We'll use:

```
GetUser(UserId)
```

---

## Events

For asynchronous communication.

Example:

```
Transfer Completed
```

Publishes:

```
TransferCompleted
```

Subscribers:

Wallet

Notification

Analytics

Webhook

Fraud

Audit

Nobody calls them directly.

---

# 7. Event-Driven Architecture

One event.

Many subscribers.

```
TransferCompleted

↓

Ledger

↓

Wallet

↓

Notification

↓

Analytics

↓

Webhook

↓

Audit

↓

Fraud
```

This dramatically reduces coupling.

---

# 8. Google Pub/Sub Topics

```
identity.events

wallet.events

ledger.events

transfer.events

payment.events

notification.events

fraud.events

audit.events

analytics.events

webhook.events
```

Each service owns its topic namespace.

---

# 9. Event Naming Convention

Good examples

```
UserCreated

WalletCreated

FundsReserved

TransferInitiated

TransferCompleted

LedgerPosted

SettlementCompleted

WebhookDelivered
```

Avoid vague names like:

```
WalletUpdated

DataChanged

Modified

ProcessComplete
```

The event should describe a business fact.

---

# 10. Event Envelope

Every event should follow a consistent structure.

```json
{
  "eventId": "uuid",
  "eventType": "TransferCompleted",
  "eventVersion": 1,
  "occurredAt": "2026-07-30T12:00:00Z",
  "correlationId": "uuid",
  "causationId": "uuid",
  "producer": "transfer-service",
  "tenantId": "tenant_123",
  "data": {
    // business payload
  }
}
```

This gives us traceability across the platform.

---

# 11. Correlation IDs

Every incoming request receives a `correlationId`.

That ID flows through:

- REST calls
- gRPC requests
- Pub/Sub events
- logs
- traces
- metrics

This makes it possible to trace a single transfer across multiple services.

---

# 12. Idempotency

Financial APIs must be safe to retry.

Clients send:

```
Idempotency-Key:
```

Example:

```
8d46b48d...
```

If the same request is received twice:

- validate the key
- return the original response
- do not create another transfer
- do not create another ledger entry

We'll build a reusable idempotency middleware that every write endpoint uses.

---

# 13. Distributed Transactions

We will **not** use two-phase commit (2PC). It introduces tight coupling, blocks resources, and doesn't fit well with cloud-native microservices.

Instead, we'll use the **Saga Pattern**.

A transfer might follow this sequence:

1. Validate source wallet.
2. Reserve funds.
3. Create transfer record.
4. Post ledger entries.
5. Credit destination wallet.
6. Publish `TransferCompleted`.

If step 5 fails, compensating actions reverse the reservation and mark the transfer as failed. Each step is independently retryable and emits its own events.

---

# 14. The Outbox Pattern

One of the most common distributed systems bugs is:

1. Write to the database.
2. Crash before publishing the event.

Now the database says the transfer exists, but no downstream service knows about it.

We'll solve this with the **Outbox Pattern**:

- Write the business record and an outbox event in the same database transaction.
- A background publisher reads the outbox table and publishes events to Pub/Sub.
- Once successfully published, mark the outbox record as processed.

This guarantees that every committed business event is eventually published.

---

# 15. CQRS (Where It Helps)

We'll avoid applying CQRS everywhere.

Instead:

- **Command models** for financial operations (transfers, ledger postings).
- **Read models** for dashboards, balances, and reporting.

That gives us optimized reads without making the entire system more complex.

---

## Architecture Decision Records (ADRs)

We'll maintain an `adr/` directory containing decisions such as:

- ADR-001: Why NestJS?
- ADR-002: Why PostgreSQL over CockroachDB?
- ADR-003: Why Pub/Sub instead of Kafka?
- ADR-004: Why Saga over 2PC?
- ADR-005: Why monorepo?
- ADR-006: Why Cloud Run for stateless services and GKE only where Kubernetes capabilities are beneficial?

Each ADR will document the context, alternatives considered, decision made, and consequences. This mirrors the way many engineering organizations preserve architectural reasoning.

---

## Next Up: The Ledger Service

Everything we've discussed is infrastructure.

The **Ledger Service Specification** is where the real financial engineering begins.

That document will define:

- Double-entry accounting model
- Chart of accounts
- Journal and posting engine
- Account hierarchy
- Transaction lifecycle
- Balance computation and snapshots
- Reversals and corrections
- Reconciliation process
- Database schema
- APIs
- gRPC contracts
- Domain events
- Performance considerations
- Failure scenarios
- Testing strategy

In many ways, the ledger is the heart of Atlas. If it's designed correctly, the wallet, transfers, settlements, and payment systems become much simpler because they all rely on a single, consistent source of financial truth.
