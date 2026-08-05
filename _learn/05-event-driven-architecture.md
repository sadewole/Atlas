# 05 — Event-Driven Architecture

## Why Events?

In a synchronous system, every service call creates a dependency:
```
Payment Service → calls → Transfer Service → calls → Ledger Service
                                            → calls → Notification Service
```

If Notification Service is slow, the entire chain is slow. If it's down, the entire chain fails.

With events:
```
Payment Service publishes PaymentConfirmed
  ↓ (Pub/Sub delivers to subscribers)
  ├→ Transfer Service reacts
  ├→ Ledger Service reacts
  ├→ Notification Service reacts
  └→ Analytics Service reacts
```

If Notification Service is slow, the other subscribers aren't affected. If it's down, events queue up until it recovers.

---

## Event Types in Atlas

### Domain Events

Published by services as the result of a business action:

```
UserCreated          — IAM
WalletCreated        — Wallet
JournalPosted        — Ledger
TransferCompleted    — Transfer
PaymentCaptured      — Payment
SettlementStarted    — Settlement
PayoutConfirmed      — Banking Connector
WebhookDelivered     — Webhook
```

### CDC Events (Change Data Capture)

Automatically generated from database changes (v2, not MVP):

```
payment.inserted      — A row was inserted into payments table
wallet.updated        — A wallet row was modified
ledger_entry.deleted  — (Should never happen — would trigger alerts)
```

Domain events carry business meaning. CDC events carry database state. Applications consume domain events. Data platforms consume CDC events.

---

## The Event Envelope

Every event in Atlas follows the same structure:

```json
{
  "eventId": "01J5EXAMPLE0000000000000000",
  "eventType": "TransferCompleted",
  "eventVersion": 1,
  "occurredAt": "2026-07-30T12:00:00Z",
  "correlationId": "01J5EXAMPLE0000000000000001",
  "causationId": "01J5EXAMPLE0000000000000002",
  "producer": "transfer-service",
  "tenantId": "org_abc123",
  "data": {
    "transferId": "txn_xyz789",
    "sourceWalletId": "wlt_src",
    "destinationWalletId": "wlt_dst",
    "amount": 100000,
    "currency": "NGN"
  }
}
```

### Field Explanations

| Field | Purpose |
|-------|---------|
| `eventId` | Globally unique identifier for this event |
| `eventType` | What happened (not a command) |
| `eventVersion` | Schema version (for backward compatibility) |
| `occurredAt` | When the business event happened |
| `correlationId` | Links all events in a business workflow |
| `causationId` | What event caused this event |
| `producer` | Which service published it |
| `tenantId` | Which organization this belongs to |
| `data` | Business-specific payload |

### Why This Matters

With correlation IDs and causation IDs, you can trace:
- What triggered this event?
- What events did it trigger in turn?
- What service published it?
- Which tenant does it belong to?

This is the foundation for distributed tracing, debugging, and audit.

---

## The Outbox Pattern

### The Problem It Solves

This is one of the most common distributed systems bugs:

```typescript
async function transfer(amount: Money) {
  // Step 1: Save to database
  await db.transfers.insert({ status: 'COMPLETED' });

  // Step 2: Publish event
  await pubsub.publish('TransferCompleted', event);

  // CRASH! Server dies between step 1 and 2
}
```

Result: The database says the transfer is completed, but no service knows about it. Wallet balances are stale. Analytics is missing data. No webhook was triggered.

### The Solution

```typescript
// In a single database transaction:
await db.transaction(async (tx) => {
  // 1. Save the business data
  await tx.transfers.insert({ id, status: 'COMPLETED' });

  // 2. Save the outbox event
  await tx.outbox_events.insert({
    id: eventId,
    event_type: 'TransferCompleted',
    payload: eventPayload,
    status: 'PENDING',
    created_at: now
  });
});
// Both succeed or both fail atomically.

// 3. Background worker picks up PENDING events
// 4. Publishes to Pub/Sub
// 5. Marks as PUBLISHED
```

The key insight: the database write and the event creation happen in the same transaction. Either both succeed or neither does. The outbox worker runs asynchronously and can retry indefinitely until Pub/Sub confirms receipt.

---

## Pub/Sub Topic Design

### Topic Naming

```
{domain}.events
```

| Topic | Publisher | Subscribers |
|-------|-----------|-------------|
| `identity.events` | IAM Service | Analytics, Audit |
| `wallet.events` | Wallet Service | Analytics, Notification |
| `ledger.events` | Ledger Service | Wallet, Analytics, Settlement, Audit |
| `transfer.events` | Transfer Service | Wallet, Analytics, Webhook, Notification, Fraud |
| `payment.events` | Payment Service | Transfer, Analytics, Webhook, Notification, Fraud |
| `settlement.events` | Settlement Service | Analytics, Webhook, Notification |
| `notification.events` | Notification Service | Analytics |
| `webhook.events` | Webhook Service | Analytics |

### Fan-Out Example

When `TransferCompleted` is published to `transfer.events`:
```
Pub/Sub delivers to:
  → Wallet Service (update balance projection)
  → Analytics Service (record for dashboards)
  → Webhook Service (notify merchant)
  → Notification Service (send email/SMS)
  → Fraud Service (check velocity)
  → Audit Service (log for compliance)
```

The Transfer Service publishes once. Six services react independently. Adding a seventh subscriber requires no changes to the Transfer Service.

---

## CQRS (Command Query Responsibility Segregation)

### The Concept

Separate the model that processes commands (writes) from the model that handles queries (reads).

```
COMMAND SIDE                    QUERY SIDE
─────────────                  ────────────
POST /transfers                GET /wallets/{id}/balance
  │                              │
  ▼                              ▼
TransferCommandHandler         BalanceQueryHandler
  │                              │
  ▼                              ▼
Journal (domain model)         BalanceProjection (read model)
  │                              │
  ▼                              ▼
PostgreSQL                     Redis (cached) / PostgreSQL (projection)
```

### Why CQRS?

1. **Different optimization:** Commands need strong consistency (transactions). Queries need speed (caching, materialized views).
2. **Different scaling:** Write-heavy services scale differently than read-heavy services.
3. **Security:** Read models can be less restricted than write models.
4. **Flexibility:** You can have multiple read models for the same data — a cached balance for quick checks, a detailed projection for statement generation.

### Where Atlas Uses CQRS

- **Ledger:** Commands post journals. Queries read balance projections.
- **Wallet:** Commands create holds. Queries read cached balances.
- **Analytics:** Commands don't exist (analytics is read-only). Queries pull from ClickHouse/BigQuery.

---

## Event Versioning

### The Problem

Events evolve. What happens when `TransferCompleted` gets a new field?

**v1:**
```json
{
  "eventType": "TransferCompleted",
  "eventVersion": 1,
  "data": {
    "transferId": "...",
    "amount": 100000
  }
}
```

**v2 (adds fee):**
```json
{
  "eventType": "TransferCompleted",
  "eventVersion": 2,
  "data": {
    "transferId": "...",
    "amount": 100000,
    "fee": 1500
  }
}
```

### Rules for Versioning

1. **Additive changes only** — New fields are okay. Don't remove or rename fields.
2. **Subscribers handle versions** — A subscriber that only understands v1 ignores the `fee` field. A subscriber that understands v2 uses it if present.
3. **No breaking changes** — If you must break, create a new event type (`TransferCompletedV2`) and deprecate the old one.
4. **Migration period** — Publish both versions during a migration window. Remove the old version after all subscribers have upgraded.

---

## Event Replay

### The Capability

Because events are persisted (in the outbox table and Pub/Sub), we can replay them to rebuild state.

### When Replay Is Needed

- **Redis cache lost:** Replay ledger events to rebuild balance caches
- **OpenSearch index corrupted:** Replay events to reindex
- **ClickHouse data lost:** Replay events to rebuild analytics
- **New service added:** Replay historical events so the new service can build its initial state
- **Bug in projection:** Fix the bug, replay events, get correct state

### How Replay Works

```
1. Identify starting point (from snapshot or sequence #0)
2. Read events from outbox/archive in order
3. Process each event as if it just happened
4. Continue until caught up
```

For the Ledger, replay means:
```
Journal #1 → Apply to projection
Journal #2 → Apply to projection
...
Journal #500,000,000 → Apply to projection
→ Balance projection is now correct
```

Snapshots speed this up. Instead of starting from #1, start from the last snapshot at #499,000,000 and replay only the last 1,000,000 entries.

---

## Correlation ID Propagation

### The Flow

```
Client Request
  │  X-Correlation-ID: abc-123
  ▼
API Gateway
  │  (generates if missing, enriches logs)
  ▼
Payment Service
  │  (includes in all logs, gRPC calls, events)
  ▼
Transfer Service (gRPC call)
  │  (correlation ID propagated in gRPC metadata)
  ▼
Ledger Service (gRPC call)
  │  (correlation ID propagated)
  ▼
Pub/Sub Event: TransferCompleted
  │  (correlation ID in event envelope)
  ▼
Webhook Service (event subscriber)
  │  (correlation ID in logs)
```

Every log entry, trace span, and event carries the correlation ID. This means you can filter all logs for `correlationId=abc-123` and see the entire journey of a single request across all services.

---

## Dead Letter Queue (DLQ)

### When Events Fail

A subscriber processes an event:
1. Parse event → success
2. Apply business logic → failure (transient: database timeout)
3. NACK the event → Pub/Sub retries
4. After X retries → move to Dead Letter Topic

### DLQ Handling

Events in the DLQ don't disappear. Operations teams can:
- **Investigate:** Why did it fail? Which retry #?
- **Replay:** Fix the bug, replay the event
- **Skip:** Acknowledge it's permanently failed (e.g., invalid payload from deleted merchant)
- **Alert:** Monitor DLQ size — growing DLQ = something is broken

---

## Key Takeaways

1. **Events decouple services.** Publishers don't know who subscribes. Subscribers don't know who published.
2. **The Outbox Pattern guarantees event publication.** Events are written atomically with business data.
3. **Every event has a standard envelope.** This enables correlation, tracing, and debugging.
4. **CQRS separates writes (commands) from reads (queries).** Optimize each independently.
5. **Events are versioned and backward-compatible.** Additive changes only.
6. **Replay rebuilds state from events.** The source of truth is the event history.
7. **Correlation IDs span services.** One ID traces an entire business workflow.
8. **DLQ ensures no event is silently lost.** Failed events are preserved for investigation.

## Next: [Cloud Infrastructure](./06-cloud-infrastructure.md)
