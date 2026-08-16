# 21 — Transfer Events

This document explains the transfer events we added — `TransferCompleted` / `TransferFailed` — published reliably via the outbox pattern.

## What We Added

The Transfer Service now publishes its terminal events through the **same outbox pattern** we built for the ledger. Before, a transfer's completion was invisible to everything except its own DB. Now:

```
transfer completes / fails
        │
        ▼
write TransferCompleted/TransferFailed to outbox   (same DB, atomic with status)
        │
        ▼
OutboxPublisher drains → Pub/Sub (transfer.events)
        │
        ▼
any subscriber can react (analytics, webhooks, notifications)
```

## The Event Payloads

### TransferCompleted
```json
{
  "eventType": "TransferCompleted",
  "eventVersion": 1,
  "producer": "transfer-service",
  "data": {
    "transferId": "...",
    "reference": "TX-EV-1",
    "type": "INTERNAL",
    "currency": "NGN",
    "amount": 40000,
    "feeAmount": 0,
    "sourceWalletId": "...",
    "destinationWalletId": "...",
    "status": "COMPLETED",
    "journalId": "..."      // the ledger journal that moved the money
  }
}
```

### TransferFailed
Same shape plus a `reason` (the error message that caused compensation).

## How It Works

- **`transfer_outbox_events` table** in the transfer service (same schema as the ledger's; tables are namespaced per service — see `20-outbox-pattern.md`)
- **`markTerminal`** in `TransferRepository`: updates the transfer status, records history, AND writes the outbox row — **all in one transaction**. The event is durable with the status.
- **`OutboxPublisher`**: background worker that polls pending rows, publishes to Pub/Sub, marks published. Retries failures forever (never drops).
- The transfer module ensures the `transfer.events` topic exists and starts the publisher at boot.

## The State Machine Detail We Fixed

Compensation failed a test: `compensate` built the failed transfer via `transfer.withStatus('FAILED')` — but from `POSTING`/`SETTLING`, the state machine requires going **through `COMPENSATING` first**. Fixed to transition `COMPENSATING → FAILED` where needed.

## Verified End-to-End (live)

```
1. Fund wallet1 (credit its ledger account) → JournalPosted via ledger outbox
2. Transfer 40000 wallet1 → wallet2 → COMPLETED
3. TransferCompleted written to transfer outbox → status published
4. Transfer log: "Published outbox event TransferCompleted (...)"
5. wallet1: 60000, wallet2: -60000 (both synced via events)
```

The `TransferCompleted` payload carried the journalId, wallets, amount, and status.

## The Drizzle Dual-Copy Bug We Hit

Adding the events dependency caused the transfer service to resolve a **different physical drizzle-orm copy** than `@atlas/database`:

- `drizzle-orm@0.45.2_postgres@3.4.9` (used by ledger)
- `drizzle-orm@0.45.2_@opentelemetry+api@1.9.1_postgres@3.4.9` (transfer, pulled via `@google-cloud/pubsub`'s OpenTelemetry peer)

Two physical copies = two different TypeScript types → `db.select().from(...)` broke. Fixed with a **pnpm override** pinning `drizzle-orm: 0.45.2`, so all copies unify.

## The CI Flakiness Fix

The parallel Testcontainers flakiness (multiple Postgres containers starting at once exceeding hook timeouts) is now handled by capping test parallelism:
- CI: `nx affected -t test --parallel=2`
- This is environmental, not a code issue

## The Lesson

> **Every service that owns a business fact should publish it.** The ledger publishes journals; now the transfer publishes completions/failures. Downstream services react without coupling. And when you publish, use the outbox — a transfer's terminal state and its event must commit together.

## gRPC — Still Pending

As noted, the internal REST clients (transfer → wallet/ledger) are still on our list to swap to **gRPC**. The client files are isolated so the swap is contained.
