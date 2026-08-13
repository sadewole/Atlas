# 18 — The Transfer Service (Saga)

This document explains the Transfer Service — the "brain" that orchestrates money movement across the Wallet and Ledger services. This is where the **Saga pattern** comes to life.

## What We Built

A NestJS service (`apps/transfer-service`) that orchestrates a transfer between two wallets. It is the **conductor** — it never moves money itself.

```
apps/transfer-service/
└── src/app/transfer/
    ├── domain/
    │   ├── transfer.ts         # Transfer entity + state machine
    │   └── transfer-errors.ts  # TRANSFER_* domain errors
    ├── application/
    │   └── create-transfer.use-case.ts   # THE Saga
    ├── infrastructure/
    │   ├── transfer-schema.ts  # transfers + transfer_status_history
    │   ├── transfer-repository.ts
    │   ├── wallet.client.ts    # REST client → Wallet Service
    │   └── ledger.client.ts    # REST client → Ledger Service
    └── presentation/
        ├── transfer.controller.ts
        └── transfer.dto.ts
```

**Key architectural point:** Transfer talks to Wallet and Ledger via **REST clients**. These are isolated in one layer so they can be swapped to **gRPC** later without touching the Saga. (We decided this explicitly.)

---

## The Saga (Orchestrated)

A transfer is a multi-step operation across **three services**. There's no single DB transaction that spans them, so we use a Saga: a sequence of local operations, each with a compensating "undo".

```
             Step 1                     Step 2                    Step 3
  ┌─────────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
  │ Wallet: reserve      │ → │ Ledger: post journal │ → │ Wallet: capture     │
  │ (lock funds)         │   │ (record the movement)│   │ (finalize the debit)│
  └─────────────────────┘   └──────────────────────┘   └─────────────────────┘
           │                         │                          │
           ▼                         ▼                          ▼
        FAILED                    FAILED                     COMPLETED
       (nothing                  (compensate:               (money moved)
        to undo)                  release the
                                  reservation)
```

### The three behaviors, verified live

| Scenario | What happens | Result |
|----------|--------------|--------|
| **Happy path** | reserve → post journal → capture | `COMPLETED`, wallet debited, ledger balanced |
| **Early failure** | reserve fails (insufficient balance) | `FAILED`, nothing to undo |
| **Compensation** | reserve OK, but ledger/capture fails | **release reservation** (money returns), then `FAILED` |

### Compensation is the key Saga concept

If we reserved ₦25,000 and the ledger goes down before we post, the money must **return to the wallet's available balance**. The Saga's `catch` block calls the compensating action (release the reservation) before marking the transfer FAILED.

```
reserve → ledger fails → release reservation → FAILED
                         └─ wallet available balance restored
```

### Status history = full audit trail

Every transition is appended to `transfer_status_history` (never overwritten). A real transfer's journey:

```
CREATED → VALIDATING → RESERVING → RESERVED → POSTING → SETTLING
```

A compensated one:

```
CREATED → VALIDATING → RESERVING → RESERVED → POSTING → FAILED
```

---

## The State Machine

```
CREATED → VALIDATING → RESERVING → RESERVED → POSTING → SETTLING → COMPLETED
               │           │           │            │
               ▼           ▼           ▼            ▼
             FAILED   COMPENSATING   COMPENSATING  COMPENSATING
                                        │
                                        ▼
                                      FAILED
```

The domain enforces it — an illegal transition (e.g. `CREATED → COMPLETED`) throws.

---

## Idempotency

Every transfer carries an `idempotencyKey`. If the same key arrives again, the Saga returns the **original** transfer instead of running again. Verified: the same key → same transfer id, and **no duplicate journal** is created.

---

## The Bugs We Caught (real lessons)

1. **Saga state not propagated** — `transition()` returned a new Transfer but the caller ignored it, so compensation always saw the original `CREATED` state and never released the reservation. Fix: thread the current transfer through every step.

2. **Compensation used the wrong reservation id** — it guessed `res-<reference>` instead of using the real reservation id returned by the wallet. Fix: track the actual `reservationId` through the saga.

3. **Network errors leaked as 500s** — a down ledger threw a raw `fetch` TypeError, bypassing our domain error mapping. Fix: clients wrap network failures in `LedgerServiceError` / `WalletServiceError`.

4. **Generator bug** — the `.replace()` with `$1` in the replacement string silently corrupted the generated jest config. Fix: use a replacer **function** so `$` is literal.

## The Subtle One: The RESERVED-Transition Race

The sharpest bug you caught: **what if the wallet reserves the funds, but the transfer DB fails to persist the `RESERVED` transition?**

```
reserve() on wallet succeeds  → funds locked ✓
transition → RESERVED fails   → transfer DB still says RESERVING
catch runs, compensate() fires
```

**The old guard was wrong:**
```typescript
// BAD: only releases if the transfer reached RESERVED/POSTING/SETTLING
if (reservationId && ['RESERVED', 'POSTING', 'SETTLING'].includes(transfer.status)) {
```

If the DB write at line 108 failed, `transfer.status` was still `RESERVING` — **not in the list** — so the reservation was never released. The funds stayed locked forever.

**The fix:** the guard must key on the *reliable signal*, not a proxy:
```typescript
// GOOD: release whenever a reservation actually exists
if (reservationId) {
  await this.walletClient.release(reservationId);
}
```

`reservationId` being set is the ground truth that the wallet locked funds. The transfer's *status* is just our attempt to record progress — it can lag behind reality.

**The second layer (crash-safety):** if the process *crashes* (hard kill, not a thrown error), `compensate()` never runs at all. That's why reservations carry a **TTL** (`expiresAt`). Even if compensation is unreachable, the reservation auto-releases and funds return to available. Never let a hold be permanent.

> **Lesson:** in a Saga, "did I persist my status" and "does the side effect exist" are different things. Compensate based on the side effect (the reservation id), not your bookkeeping. And always give side effects a safety-net expiry for the crash case.

A regression test covers the exact race: reserve succeeds, `RESERVED` transition throws → reservation is still released and the transfer ends FAILED.

---

## How the Services Talk (and the gRPC path)

```
Transfer Service ──REST──▶ Wallet Service   (reserve / capture / release)
                ──REST──▶ Ledger Service    (post journal / get balance)
```

Each call lives in `wallet.client.ts` / `ledger.client.ts`. **When we move to gRPC, we only rewrite these two files** — the Saga doesn't care about the transport.

---

## Testing — 16 tests

- **Domain (7)**: state machine walks the happy path, rejects illegal transitions, terminal states, compensation transitions
- **Saga integration (9)**: happy path (reserve→journal→capture + balance changes), idempotency (no duplicate journal), early-failure (reserve fails → FAILED, no journal), compensation (ledger fails → reservation released, balance restored), capture-fails compensation, and the **RESERVED-transition race** (wallet reserved, status write fails → reservation still released)

The Saga tests use **fake Wallet/Ledger clients** that simulate the real services' behavior (including injecting failures to exercise compensation deterministically), against a **real Testcontainers Postgres** for the transfer data.

---

## What's Next

- **gRPC** — swap the REST clients for protobuf/gRPC (isolated to the two client files)
- **Retries & DLQ** — add retry policies and a dead-letter queue for transient failures (spec: retry DB/network timeouts, never retry insufficient funds)
- **Wallet↔Ledger sync** — the destination wallet's projection should update from the `JournalPosted` event (currently only the source reflects the transfer)
- **Events** — publish `TransferCreated` / `TransferCompleted` / `TransferFailed`
- **Outbox pattern** — durable event publishing before we wire real subscribers
