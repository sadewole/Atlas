# 01 — Project Overview

## What Is Atlas?

Atlas is a **cloud-native financial infrastructure platform**. That's a mouthful. Let's break it down.

**Financial Infrastructure** means Atlas is NOT a consumer banking app (like a mobile wallet you'd download). Instead, it's the backend platform that powers those apps. Think of it as the "operating system" for financial products.

### Real-world Analogies

| Product | What It Is | Analogy to Atlas |
|---------|-----------|-----------------|
| Stripe Treasury | API for businesses to create bank accounts, wallets, and cards | Almost identical to Atlas |
| Modern Treasury | Payment operations and ledger infrastructure | Same category |
| Unit | Banking-as-a-Service platform | Same category |
| Flutterwave | Payment infrastructure for Africa | Similar, but Atlas is more general |

### What Atlas Enables

Businesses can use Atlas APIs to build:
- Digital wallets (like Paga, OPay)
- Expense management platforms
- Marketplace payouts (like Uber paying drivers)
- Payroll systems
- Lending platforms
- Gift card systems
- Gaming wallets/virtual currencies
- Loyalty/rewards programs

## Why Build This?

### For the Industry
Most applications that handle money eventually need wallets, account balances, ledger integrity, transfers, audit trails, reconciliation, and notifications. Most developers build these incorrectly. Atlas provides these as reusable infrastructure.

### For Learning
This project exposes you to nearly every important backend engineering concept:

**Distributed Systems**
- Domain-Driven Design (DDD)
- CQRS (Command Query Responsibility Segregation)
- Event Sourcing
- Saga Pattern (distributed transactions)
- Outbox Pattern (reliable event publishing)
- Idempotency (safe retries)
- Optimistic Locking

**Financial Engineering**
- Double-entry accounting
- Immutable ledgers
- Balance projections
- Reconciliation
- Compensating transactions

**Platform Engineering**
- Docker + Kubernetes/Cloud Run
- Terraform (Infrastructure as Code)
- CI/CD pipelines
- Observability (OpenTelemetry, Prometheus, Grafana)
- Disaster recovery

## The Problem Atlas Solves

### Scenario 1: Marketplace Payouts
A delivery platform needs to:
1. Accept customer payments
2. Hold funds temporarily
3. Split between restaurant, driver, and platform
4. Pay out daily/weekly

Building this from scratch means designing a ledger, wallet system, payout engine, and reconciliation — essentially rebuilding Atlas.

### Scenario 2: Digital Wallet
A fintech startup wants to offer wallets. They need:
- Account management
- Deposit/withdrawal handling
- Internal transfers
- Balance tracking
- Transaction history
- Fraud prevention

Most startups build this on top of their core database — leading to reconciliation nightmares, missing audit trails, and fragile financial logic. Atlas provides these primitives.

## Core Design Philosophy

### 1. Money Is Immutable
Never edit financial history. If a mistake happens, create a compensating transaction. The original record stays forever.

### 2. Every Action Is Auditable
Everything leaves a trail. Who did what, when, and why. This isn't just for compliance — it's for debugging, reconciliation, and trust.

### 3. Every Operation Is Idempotent
Retrying a payment request should never create a duplicate charge. The system must handle network retries gracefully.

### 4. Services Own Their Data
The Wallet Service cannot query the Ledger Service's database directly. It must call the Ledger API. This prevents tight coupling.

### 5. Events Are Contracts
When the Ledger publishes `JournalPosted`, any service can subscribe. Event format changes must be backward-compatible.

### 6. Financial Correctness > Speed
Analytics dashboards can be 30 seconds stale. Ledger balances must always be exact. We optimize for correctness first, performance second.

## The Architecture at 30,000 Feet

```
                    Internet
                        │
                 API Gateway
                        │
         ┌──────────────┼──────────────┐
         │              │              │
      IAM Service   Payment API   Wallet API
         │              │              │
         └──────────────┼──────────────┘
                        │
              Transfer Service (Saga)
                        │
              Ledger Service (Accounting)
                        │
                   Cloud SQL (PostgreSQL)
```

Every external request hits the API Gateway first. The gateway authenticates, authorizes, rate-limits, and routes to the appropriate service.

Internal services communicate through gRPC (synchronous) and Pub/Sub (asynchronous).

The Ledger is the source of truth for all financial data. Wallets display balance projections derived from ledger entries. Transfers coordinate multi-step workflows (reserve funds → ledger posting → notification → webhook).

## What We're NOT Building

Atlas is NOT:
- A consumer banking app (no mobile UI)
- A payment gateway (we integrate with those: Paystack, Flutterwave, etc.)
- A cryptocurrency platform
- A stock trading platform

Atlas IS the infrastructure those platforms run on.

## Target Audience

### Primary: Developers
Businesses integrate Atlas APIs. The developer experience (SDKs, docs, sandbox, webhooks) is critical.

### Secondary: Operations Teams
Finance teams monitor settlements, reconcile bank statements, and review suspicious activity.

### Tertiary: Platform Administrators
Platform operators manage the infrastructure, investigate incidents, and execute recovery procedures.

## The Roadmap (Simplified)

**Atlas v1 (5-7 months)** — Production-ready financial infrastructure
- Phase 0: Foundation (monorepo, CI/CD, local dev)
- Phase 1: Identity & Access (users, orgs, RBAC)
- Phase 2: Ledger (double-entry accounting)
- Phase 3: Wallets (lifecycle, holds, balances)
- Phase 4: Transfers (Saga orchestration)
- Phase 5: Payments (intents, checkout)
- Phase 6: Settlement (payouts, batches)
- Phase 7: Banking Connector (provider abstraction)
- Phase 8: Notifications & Webhooks
- Phase 9: Hardening (load testing, security review)

**Atlas v2** — Enterprise platform (ClickHouse, OpenSearch, multi-region)

**Atlas v3** — Commercial fintech (multi-currency, FX, fraud ML, SDKs)

## What Makes This Project Exceptional

This isn't just about coding. It's about demonstrating the judgment to:
- Make architectural tradeoffs (why Cloud Run over GKE? why Pub/Sub over Kafka?)
- Operate software (not just write it)
- Think about failure modes (what happens when Redis disappears?)
- Design APIs other developers will use
- Build infrastructure that survives production

## Next: [Architecture Principles](./02-architecture-principles.md)
