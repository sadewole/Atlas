# 16 — The Wallet Service

This document explains the Wallet Service we built and the important design decisions — especially the concurrency bug the tests caught.

## What We Built

A NestJS service (`apps/wallet-service`) that manages wallet lifecycle, balances (as projections), and reservations. It is the **business-rules facade** over the ledger — it does NOT do accounting.

```
apps/wallet-service/
└── src/app/wallet/
    ├── domain/           # pure business logic
    │   ├── wallet.ts         # Wallet entity + state machine + balance math
    │   ├── wallet-number.ts  # ATL-NGN-0000000001-3 generation
    │   ├── reservation.ts    # Reservation lifecycle
    │   └── wallet-errors.ts  # WALLET_* domain errors
    ├── application/      # use cases
    │   ├── create-wallet.use-case.ts
    │   ├── reserve-funds.use-case.ts
    │   ├── reservation-action.use-case.ts   # capture/release/expire
    │   ├── change-wallet-status.use-case.ts
    │   ├── get-wallet.use-case.ts
    │   └── with-wallet-lock.ts   # optimistic-lock retry loop
    ├── infrastructure/
    │   ├── wallet-schema.ts     # wallets, reservations tables
    │   └── wallet-repository.ts
    └── presentation/
        ├── wallet.controller.ts
        └── wallet.dto.ts
```

This is the first service **scaffolded by our own generator** (`@atlas/atlas:service`), which means we got Fastify, ConfigModule, LoggerModule, DatabaseModule, health checks, ESM/tsc build, and the Dockerfile for free.

---

## The Domain Model

### Wallet entity

The wallet enforces:
- **State machine**: INITIALIZING → ACTIVE ↔ FROZEN/SUSPENDED → CLOSED (terminal). Illegal transitions throw.
- **Balance invariants**: `available = ledger − reserved`, and reservations can never exceed available.
- **Freeze semantics** (per spec): frozen wallets can receive but not spend — `reserve()` throws on a non-active wallet.

### Wallet number

```
ATL-NGN-0000000001-3
└────┘└─┘└────────┘└┘
prefix currency seq  checksum
```

Never exposes the DB id. The checksum (sum of char codes mod 10) makes typos and tampering detectable — `parseWalletNumber` rejects a bad checksum.

### Reservation lifecycle

```
PENDING → CAPTURED   (funds permanently debited)
PENDING → RELEASED   (funds return to available)
PENDING → EXPIRED    (timed out; funds return to available)
```

Capturing an expired reservation throws. A reservation locks funds **without moving them** — only availability changes.

---

## Optimistic Locking — the heart of it

### Why version columns

Two simultaneous requests could both read `available=100000`, both reserve 60000, and both succeed — a double-spend. Optimistic locking fixes this:

```sql
UPDATE wallets
SET reserved_balance = ..., version = version + 1
WHERE id = ? AND version = <expected>
```

If **0 rows update**, another request won the race — retry with fresh state.

### The subtle bug the tests caught

My first implementation ran the reservation `INSERT` and the wallet update as **separate statements** outside a transaction. Under concurrency:

1. Request A inserts reservation, then the wallet version guard fails
2. I `return undefined` from the transaction callback → drizzle **COMMITS** the reservation insert anyway
3. Retry re-inserts the same `reference` → **unique constraint violation**

The lesson: **a normal return from a transaction callback commits**. To roll back, you must **throw**. The fix throws a sentinel (`VersionConflictError`), which rolls the whole transaction back, then retries.

The corrected flow:
```
withWalletLock:
  BEGIN
    reload wallet (inside tx)
    run callback (may insert reservation, using the SAME tx)
    version-guarded update
    if 0 rows → throw VersionConflictError → ROLLBACK
  COMMIT
  on VersionConflictError → retry (fresh state)
```

Because the reservation insert and the version-guarded wallet update share one transaction, they commit or roll back together. The concurrency test (5 simultaneous reservations, 100000 balance, 30000 each) now deterministically succeeds exactly 3 and fails 2.

> **Lesson:** optimistic locking + side effects requires the side effect and the version guard in ONE transaction, with a throw (not return) to trigger rollback on conflict.

---

## The API

```
POST   /v1/wallets                          create a wallet
GET    /v1/wallets/:id                      read a wallet + balances
POST   /v1/wallets/:id/reserve              reserve funds
POST   /v1/wallets/reservations/:id/capture  capture a reservation
POST   /v1/wallets/reservations/:id/release  release a reservation
POST   /v1/wallets/reservations/:id/expire   expire a reservation
POST   /v1/wallets/:id/status               freeze/unfreeze/suspend/close
GET    /health | /ready | /live             health checks
```

All errors use the standardized Atlas format via a global exception filter:
```json
{ "error": { "code": "WALLET_NOT_ACTIVE", "message": "...", "details": [] } }
```

## Testing — 32 tests

- **Domain (21)**: state machine transitions, balance math, wallet number round-trip + tamper detection, reservation lifecycle
- **Integration (11)**: optimistic-lock lost-update protection, reserve-without-moving-ledger, capture/release balance integrity, and the **concurrency no-double-spend test**

## Live-verified flow

```
create wallet           → ATL-NGN-0000000003-5, available 0
seed ledger 500000
reserve 150000          → reserved 150000, available 350000
freeze wallet           → reserve now 409 WALLET_NOT_ACTIVE
release hold            → reserved 0, available 500000
```

## The Projection-First Decision

Per our discussion, this slice keeps balances as a **local projection**. The wallet manages reserved/available math itself. Wiring it to the real ledger (calling Ledger to post journals for deposits/withdrawals, and consuming `JournalPosted` events to sync the projection) is the **next slice** — that's where the cross-service event/API plumbing lands.

## Generator feedback loop

Building this service **found a bug in the generator**: freshly scaffolded services had jest configs that couldn't resolve `@atlas/*` packages (missing `moduleNameMapper` + `transformIgnorePatterns`), so tests wouldn't run. Fixed the generator, not just the wallet — future services get it automatically. That's the whole point of the template being code.

## What's Next

- **Ledger sync** — wallet subscribes to `JournalPosted`, calls ledger for deposits/withdrawals
- **Wallet events** — publish `WalletCreated`, `FundsReserved`, `ReservationReleased` on the bus
- **Limits & policies** — per-type wallet limits (daily, single-transaction)
- **Transfer Service** — orchestrate reserve → ledger → capture using both services
