# 19 — Event-Driven Wallet↔Ledger Sync

This document explains the biggest architectural milestone so far: making the Wallet's balance projection **event-driven** — synced from the Ledger via real Pub/Sub, instead of being updated locally.

## The Problem We Fixed

Before this slice, the Wallet kept its own `ledger_balance` locally. When a transfer completed:

- **Ledger** posted the journal (correct) ✓
- **Source wallet** updated locally (capture decremented it) ✓
- **Destination wallet stayed at 0** — nothing told it the ledger credited its account ✗

The three services told inconsistent stories. The fix: make the ledger authoritative and have wallets **react to events** — the "ledger leads, wallet reacts" pattern from the spec.

## The Architecture

```
Ledger Service                          Wallet Service
─────────────                           ──────────────
post journal
    │
    ▼
publish JournalPosted  ──Pub/Sub──▶  subscribe to ledger.events
(ledger.events topic)     emulator        │
                                          ▼
                                     find wallet by ledgerAccountId
                                          │
                                          ▼
                                     applyLedgerPosting(credit/debit)
                                          │
                                          ▼
                                     update wallet projection
```

### New pieces

1. **`PubSubEventPublisher`** (`@atlas/events`) — publishes `JournalPosted` envelopes to the `ledger.events` topic via `@google-cloud/pubsub` (emulator in dev, real GCP in prod).
2. **`PubSubEventSubscriber`** (`@atlas/events`) — pulls from a subscription, decodes envelopes, routes to handlers.
3. **`JournalPostedConsumer`** (wallet) — for each posting in the event, finds the wallet whose `ledgerAccountId` matches, and applies the debit/credit to its projection.
4. **`ledgerAccountId`** column on wallets — links each wallet to the ledger account its balance projects from.
5. **`applyLedgerPosting`** on the Wallet domain — the ONLY way `ledgerBalance` changes now (besides the initial seed).

### The domain shift

`Wallet.captureReservation` **no longer mutates `ledgerBalance`** — it only clears the reservation. The ledger balance is debited separately by the `JournalPosted` event. This is the correct model: the ledger is the single source of truth; the wallet's balance is a derived read model.

## Why This Matters (the real lessons)

1. **Ledger-authoritative balances.** Every visible wallet balance is backed by an immutable ledger event. No wallet can "lie" about its balance.

2. **Cross-service communication is finally real.** This is the first time two services talk over an actual message bus, not an in-memory stub. It's the foundation for everything else (transfer events, outbox, analytics).

3. **At-least-once delivery is handled.** Pub/Sub can redeliver a message. The consumer dedupes by `eventId` so a redelivery can't double-apply a posting.

4. **Idempotent resource creation.** The ledger ensures the `ledger.events` topic exists; the wallet ensures its subscription exists — both tolerate "already exists" (a TOCTOU race we hit live).

## Verified End-to-End (live, all three services)

```
1. Fund wallet1's liability account via CREDIT journal
   → JournalPosted event → wallet1 projection = +100000  (no manual update!)
2. Transfer 30000 wallet1 → wallet2 (Saga: reserve → post → capture)
3. wallet1: 100000 → 70000
4. wallet2: synced to -70000 via the transfer's JournalPosted event
```

The destination wallet updated purely from the event — closing the loop we knowingly deferred back in the wallet slice.

## Testing

Wallet tests grew from 32 → **36**:
- `applyLedgerPosting` credits/debits the projection
- capture now only clears the reservation (event handles the debit)
- **Consumer tests**: credits the right wallet, ignores postings for accounts it doesn't own, and dedupes redelivered events

## The Infrastructure Fight (worth knowing)

Getting the Pub/Sub **emulator** to work in Docker was the hardest part — not the app code:

- `gcloud beta emulators pubsub start --host-port=0.0.0.0:8085` **forces `--host=localhost`** on the Java process → unreachable from the host
- Running the jar directly with `--host=0.0.0.0 --port=8085` works, but the emulator ignores `--port` when `--projects` is present (defaults to 8080)
- The fix: run the jar directly with only `--host=0.0.0.0 --port=8085`, no project flag

**Lesson:** managed emulators can be as fiddly as the real thing. Worth a look in `infra/docker/docker-compose.yml`.

## What's Next

- **Transfer events** — publish `TransferCreated` / `TransferCompleted` / `TransferFailed` (the transfer service still publishes nothing)
- **Outbox pattern** — write events in the same DB transaction as the business row, so an event is never lost if the process crashes between commit and publish (now that real events exist, this is the reliability gap)
- **Wallet events** — `WalletCreated`, `FundsReserved`, `ReservationReleased`
- Then **retries/DLQ** for the transfer saga
