# 20 — The Outbox Pattern

This document explains the outbox pattern — the reliability piece that guarantees no financial event is ever lost.

## The Problem It Solves

Before the outbox, the ledger published events like this:

```
1. DB transaction: insert journal + postings + projection   → COMMIT
2. publish JournalPosted to Pub/Sub                          ← AFTER commit
```

**The crash window:** if the process dies between step 1 and step 2, the journal is committed but the event never publishes. The wallet never learns the balance changed — a silent, permanent data gap. This is one of the most common distributed-systems bugs.

## The Outbox Pattern

```
1. DB transaction: insert journal + postings + projection
                   + OUTBOX ROW (pending)                  → COMMIT
2. Background outbox publisher: poll outbox table
     → publish each pending envelope to Pub/Sub
     → mark the row published
```

The event is written **atomically** with the business data. If the process crashes:
- The journal is committed (correct — it happened)
- The outbox row is still there (`pending`)
- On restart, the publisher picks it up and publishes

**Nothing is ever lost.** The event's delivery is decoupled from the transaction, but guaranteed.

## The Components (in `apps/ledger-service`)

| Piece | File | Role |
|-------|------|------|
| `ledger_outbox_events` table | `ledger-schema.ts` | `event_id` (unique), `event_type`, `payload` (full envelope JSON), `status` (pending/published), `attempts` |
| `OutboxRepository` | `outbox-repository.ts` | `insert` (inside a tx), `claimPending` (`FOR UPDATE SKIP LOCKED`), `markPublished`, `recordAttempt` |
| `OutboxPublisher` | `outbox-publisher.ts` | Background worker: polls, publishes via the `EventPublisher`, marks published |

> **Table names are namespaced per service.** The outbox table is `ledger_outbox_events` (ledger), `transfer_outbox_events` (transfer), and `wallet_outbox_events` (wallet) — NOT a shared `outbox_events`. In local dev all services share ONE Postgres database, so a common table name would make their publishers race to drain each other's events into the wrong topics. See the lesson at the bottom.

## How `postJournal` Changed

Before:
```
repository.postJournal(journal, postings, projection)   // transaction
publisher.publish(envelope)                             // after commit
```

After:
```
// Build envelope first (so its eventId is known)
const envelope = createEnvelope({ eventType: 'JournalPosted', ... })

// Write the outbox row IN THE SAME TRANSACTION
repository.postJournal(journal, postings, projection, {
  eventId: envelope.eventId,
  eventType: envelope.eventType,
  payload: JSON.stringify(envelope),
})
// ...the OutboxPublisher drains it asynchronously
```

The use case no longer calls `publisher.publish()` — the outbox publisher owns that now.

## Why It's Safe (the guarantees)

1. **Atomicity** — the outbox row commits or rolls back with the journal. No gap.
2. **At-least-once** — Pub/Sub may redeliver; consumers dedupe by `eventId` (our wallet consumer already does).
3. **Idempotent retry** — if publish succeeds but we crash before `markPublished`, the row republishes on restart. Harmless, because consumers dedupe.
4. **`FOR UPDATE SKIP LOCKED`** — concurrent publishers each claim disjoint rows without blocking.
5. **Crash-safe** — a `pending` row survives any failure and is retried.

## Verified End-to-End (live)

```
1. Post a journal
2. outbox_events row appears: status=pending
3. OutboxPublisher log: "Published outbox event JournalPosted (...)"
4. outbox row → status=published
5. Wallet consumed the event → balance synced
```

The full loop works across all three services.

## The Failure Modes We Accept (for now)

- **No DLQ yet**: if publish keeps failing, the row stays `pending` and the publisher retries forever (never drops). A dead-letter queue for permanently-failing events is the next hardening step.
- **Polling, not push**: we poll every 1s. Fine for our scale; a real deployment might use a more sophisticated scheduler.

## The Lesson

> **Never publish a message you haven't made durable.** If an event matters, write it in the same transaction as the data that caused it, and let a worker deliver it. "Commit the data, then send the event" is a bug — the outbox closes the window between them.

> **Namespace shared tables when services share a database.** In local dev all services connect to the SAME Postgres DB. If two services create a table with the same name (`outbox_events`), they collide: the ledger's publisher was literally publishing the wallet's `WalletCreated` events to `ledger.events`. The fix: name the table per service (`wallet_outbox_events`, ...). In production each service gets its own DB instance, so this only bites locally — but it bites hard, and it's invisible until you see an event in the wrong topic. This is why the outbox tables are namespaced even though each schema object still calls the variable `outboxEvents`.

## Testing

Ledger tests: 14 → 16. The integration spec now verifies:
- a journal posts and an **outbox row** is written (not directly to the bus)
- the `OutboxPublisher` drains it to the bus
- the outbox row is marked published, no pending rows remain
- unbalanced journals write **nothing** (no outbox row, no event)
- idempotent replays write only **one** outbox row
