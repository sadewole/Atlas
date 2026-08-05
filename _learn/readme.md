# Atlas Learning Handbook

This folder is your personal learning resource. Unlike the `docs/` folder (which contains formal architecture specifications), these documents explain **why** we made certain decisions, **how** each concept works, and **what tradeoffs** we considered.

## How to Use This

- Read in order — each document builds on the previous ones
- These are narrative-format, not specification-format
- Use `docs/` when you need technical details for implementation
- Use `_learn/` when you want to understand the reasoning

## Contents

| # | Document | What You'll Learn |
|---|----------|-------------------|
| 01 | [Project Overview](./01-project-overview.md) | What Atlas is, who it's for, the problem it solves |
| 02 | [Architecture Principles](./02-architecture-principles.md) | Core design decisions, tradeoffs, why microservices + events |
| 03 | [Domain-Driven Design](./03-domain-driven-design.md) | Bounded contexts, aggregates, how we model financial domains |
| 04 | [Financial Engineering](./04-financial-engineering.md) | Double-entry accounting, Saga pattern, idempotency, immutability |
| 05 | [Event-Driven Architecture](./05-event-driven-architecture.md) | Pub/Sub, Outbox pattern, CQRS, event versioning, replay |
| 06 | [Cloud Infrastructure](./06-cloud-infrastructure.md) | GCP services, Cloud Run, Terraform, deployment, observability |
| 07 | [Security & Multi-Tenancy](./07-security-and-multitenancy.md) | RBAC, JWT, API keys, tenant isolation, encryption |
| 08 | [API Design](./08-api-design.md) | REST conventions, gRPC, versioning, errors, pagination |
| 09 | [Testing Strategy](./09-testing-strategy.md) | Unit, integration, contract, E2E, financial correctness testing |
| 10 | [Production Operations](./10-production-operations.md) | Disaster recovery, backups, monitoring, incident response |
| 11 | [Monorepo Setup](./11-monorepo.md) | Nx + pnpm, workspace structure, the `@atlas/*` import convention |

## Architecture Specs (Reference)

For detailed technical specifications, see `docs/architecture/`:
- `sas.md` — System Architecture Specification
- `iam.md` — Identity & Access Management
- `ledger.md` — Ledger Service (double-entry accounting)
- `wallet.md` — Wallet Service
- `transfer.md` — Transfer Service (Saga orchestration)
- `payment.md` — Payment Service
- `settlement.md` — Settlement Service
- `banking-connector.md` — Banking Connector
- `notification.md` — Notification & Webhook Platform

## Key Principle

> **Every decision in Atlas should be explainable.** If we can't articulate why we chose X over Y, we haven't done enough analysis. This handbook documents that reasoning.
