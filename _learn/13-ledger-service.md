# 13 — The Ledger Service (v1 Slice)

This document explains what we built for the Ledger Service, how the financial logic works, and the design decisions behind it — including a concurrency bug the tests caught.

## What We Built

A NestJS service (`apps/ledger-service`) that:
- Owns the ledger's data (`accounts`, `journals`, `journal_postings`, `balance_projection`)
- Enforces double-entry accounting invariants
- Posts journals atomically and updates balance projections
- Publishes `JournalPosted` events

```
apps/ledger-service/
├── src/
│   ├── main.ts                        # Bootstrap (Fastify)
│   ├── config/ledger-config.ts        # zod schema (LEDGER_PORT + postgres)
│   └── app/
│       ├── app.module.ts              # Config + Logger + Database + Ledger
│       ├── health/                    # /health, /ready, /live
│       └── ledger/
│           ├── tokens.ts              # DI tokens (EVENT_PUBLISHER)
│           ├── domain/                # Pure business logic — no frameworks
│           │   ├── account.ts         # Account entity
│           │   ├── posting.ts         # Posting value object
│           │   ├── journal.ts         # Journal aggregate root
│           │   ├── chart-of-accounts.ts
│           │   └── ledger-errors.ts   # LEDGER_* domain errors
│           ├── application/           # Use cases
│           │   ├── post-journal.use-case.ts
│           │   ├── create-account.use-case.ts
│           │   ├── get-balance.use-case.ts
│           │   └── seed-chart-of-accounts.use-case.ts
│           ├── infrastructure/        # Drizzle schema + repository
│           │   ├── ledger-schema.ts
│           │   └── ledger-repository.ts
│           └── presentation/          # Controller + DTOs
│               ├── ledger.controller.ts
│               └── ledger.dto.ts
├── migrations/                        # drizzle-kit generated SQL
└── drizzle.config.ts
```

---

## The Architecture: Clean Architecture Inside the Service

Following the SAS's service structure, the ledger is split into layers. The key rule:

```
presentation → application → domain
                    ↑
             infrastructure (implements DB access)
```

The **domain layer has zero framework dependencies**. `Journal`, `Posting`, and `Account` are plain TypeScript classes. This is what makes them trivially testable and framework-agnostic.

---

## The Domain Layer — Where Financial Rules Live

### The Journal Aggregate

The most important piece. A `Journal` is the **aggregate root** that enforces the financial invariants **at construction time** — before anything touches the database:

```typescript
class Journal {
  constructor(props) {
    if (props.postings.length < 2) throw new InsufficientPostingsError();
    // all postings must share one currency
    if (currencies.size !== 1) throw new CurrencyMismatchError();
    // debits must equal credits
    if (!totalDebits.equals(totalCredits)) throw new UnbalancedJournalError();
    ...
  }
}
```

**Why enforce at construction?** Because it's impossible to create an invalid journal. If a use case or another developer tries `new Journal({ postings: [debit only] })`, it throws immediately. The invariant can't be bypassed — it's baked into the type.

### Posting — Immutable Value Object

```typescript
class Posting {
  constructor(props) {
    if (!props.amount.isPositive()) throw new InvalidAmountError();
    ...
  }
}
```

Postings must be positive amounts; the *direction* (debit/credit) carries the sign, not the amount.

### Account Types & Sign Conventions

This is a subtle accounting rule that matters enormously:

| Account Type | Debit | Credit |
|--------------|-------|--------|
| Asset (bank) | increases | decreases |
| Expense | increases | decreases |
| Liability (wallet) | decreases | increases |
| Equity | decreases | increases |
| Revenue | increases | decreases |

`Account.debitNormal` encodes this: `asset` and `expense` are debit-normal (debits increase them); everything else is credit-normal.

**This is why a naive "debit = +amount, credit = -amount" delta calculation is WRONG.** The sign of a posting's effect depends on the *account type*, not just the direction. Our repository applies:

```
sign = (isDebit && account.debitNormal) || (!isDebit && !account.debitNormal) ? +1 : -1
```

So crediting a customer wallet (liability) **increases** its balance, while debiting it **decreases** the balance. The smoke test verified this live:
- Debit 1110 (bank, asset) → balance +100000
- Credit 2100 (wallet, liability) → balance +100000

---

## The Repository — Transactional Correctness

### Atomic Posting

`postJournal` runs inside a single database transaction:

```
BEGIN
  INSERT journal
  INSERT postings (with sequence numbers)
  UPDATE balance projections (upsert per account)
COMMIT
```

Either everything commits or nothing does. An unbalanced journal throws in the domain layer **before** this transaction starts, so it never writes anything.

### The Balance Projection Upsert

The original implementation did:
```
SELECT ... FOR UPDATE  →  if no row, INSERT; else UPDATE
```

**The concurrency test caught a real bug here.** When 10 journals hit the same account in parallel:

1. Transactions A and B both `SELECT FOR UPDATE` on a projection row that **doesn't exist yet**
2. Both see "no row"
3. Both try to `INSERT` the same primary key → **unique constraint violation** (flaky failure)

`FOR UPDATE` only protects *existing* rows — it can't lock a row that isn't there.

**The fix: atomic upsert.**

```typescript
INSERT INTO balance_projection (account_id, balance)
VALUES ($1, $2)
ON CONFLICT (account_id) DO UPDATE SET
  balance = balance_projection.balance + EXCLUDED.balance
```

This handles both "row exists" and "row doesn't exist yet" in a single race-free statement. The concurrency test now passes consistently.

> **Lesson:** writing financial code, you can't just reason about correctness in isolation. Two concurrent requests can observe the same state and both make a decision that's individually correct but jointly wrong. The atomic upsert — not "check then write" — is the only safe pattern here.

---

## The Use Case — The Pipeline

`PostJournalUseCase.execute()`:

```
1. Idempotency check  — journal.reference already exists? return the original (no duplicate)
2. Load accounts      — every posting's account must exist & be active
3. Build Journal      — the aggregate validates the financial invariants
4. Persist            — repository transaction (journal + postings + projections)
5. Publish            — JournalPosted event on the bus
```

**Idempotency**: the journal `reference` acts as the idempotency key. Retrying with the same reference returns the existing journal instead of creating a duplicate. Verified in tests: calling twice with the same reference yields the same journalId and only one event.

**Validation order matters**: we validate accounts and build the Journal *before* opening the transaction. Failures throw domain errors (`LEDGER_ACCOUNT_NOT_FOUND`, `LEDGER_UNBALANCED`) that map to clean HTTP responses — nothing partial is ever written.

---

## Events

The service publishes `JournalPosted` with the standard envelope (SAS §10):```json
{
  "eventId": "...",
  "eventType": "JournalPosted",
  "eventVersion": 1,
  "correlationId": "ledger:<journalId>",
  "producer": "ledger-service",
  "data": {
    "journalId": "...",
    "reference": "...",
    "currency": "NGN",
    "totalAmount": 50000,
    "postings": [...]
  }
}
```

The use case depends on the `EventPublisher` **port** (interface), and the module wires an `InMemoryEventBus` for now. When we build real Pub/Sub integration, we swap one provider without touching the use case.

---

## The API

```
POST /v1/ledger/accounts          create an account (for the chart of accounts)
POST /v1/ledger/journals           post a balanced journal
GET  /v1/ledger/accounts/:id/balance   read the balance projection
GET  /health | /ready | /live      health checks (DB-backed readiness)
```

The journal payload:
```json
{
  "reference": "txn-abc-123",
  "currency": "NGN",
  "postings": [
    { "accountId": "1110-uuid", "direction": "debit",  "amount": 50000 },
    { "accountId": "2100-uuid", "direction": "credit", "amount": 50000 }
  ]
}
```

---

## Testing Strategy

### Unit tests (domain) — 5 tests
Pure journal invariant tests: balanced accepted, <2 postings rejected, unbalanced rejected, currency mix rejected, totalAmount sums one side.

### Integration tests (repository) — 5 tests
Against real Postgres via **Testcontainers**: sign conventions, idempotency detection, **concurrent postings to the same account don't lose updates** (this is the one that found the bug).

### Integration tests (use case) — 4 tests
End-to-end through the real pipeline: balanced journal posts + publishes event, unbalanced rejected *before* touching DB, unknown account rejected, idempotent replay publishes once.

**Total: 14 tests, all green.**

---

## The Bugs We Caught (and what they taught us)

| Bug | Layer | Lesson |
|-----|-------|--------|
| Controller method names shadowed constructor params → `callback.apply is not a function` | presentation | NestJS resolves `instance.methodName`; if a constructor property has the same name, it shadows the handler. Rename injected deps (e.g. `createAccountUseCase`). |
| `totalAmount` summed BOTH sides (200000 instead of 100000) | domain | A journal's value is one side (debits == credits by construction). |
| Test containers exceeded jest's 5s hook timeout under parallel load | test infra | `jest.setTimeout(30_000)` for Testcontainers suites. |
| Concurrent `SELECT FOR UPDATE` then INSERT race on missing projection rows | infrastructure | Check-then-act is racy. Use atomic upsert (`ON CONFLICT DO UPDATE`). |
| jest couldn't parse `uuid` v14 (ESM-only) through pnpm's `.pnpm` dir | test infra | `moduleNameMapper` to source + `transformIgnorePatterns: ['node_modules/(?!.*uuid.*)']`. |

## The ESM/CJS Dual-Package Type Hazard (and the fix)

**Symptom:** `nx typecheck` failed with dozens of errors in the repository — `insert()` rejected our tables (`PgTableWithColumns` not assignable to `PgTable<TableConfig>`), and `db.query.accounts` didn't exist on type `{}` — even though the app **built and ran perfectly** (webpack + jest both worked).

**Root cause:** the app and the database package import `drizzle-orm` through **different module systems**:

| File | package.json `type` | drizzle-orm type file used |
|------|--------------------|---------------------------|
| `@atlas/database` (ESM) | `"type": "module"` | `index.d.ts` (ESM) |
| `apps/ledger-service` (CJS) | *(none)* | `index.d.cts` (CJS) |

With `moduleResolution: nodenext`, the CJS app resolves `drizzle-orm` via the `require` condition (getting `index.d.cts`), while the ESM database package source resolves it via `import` (getting `index.d.ts`). These are **two structurally different types** — drizzle uses a `unique symbol` (`entityKind`) in its class definitions, so the CJS and ESM `PostgresJsDatabase` types are *nominally* incompatible even though it's the same package.

So `DrizzleDatabase<typeof ledgerSchema>` (which internally used the ESM drizzle type) was a different type from the app's own drizzle tables (CJS types).

**First attempt (a workaround):** import drizzle's type **directly in the app** rather than re-exporting it through the ESM package. This *worked* but was a workaround — every service would need to remember to import `PostgresJsDatabase` from `drizzle-orm/postgres-js` directly instead of using the clean `DrizzleDatabase` from `@atlas/database`.

**The real fix: make the whole workspace uniformly ESM.** The packages were already `type: module`; the problem was that the **apps were CJS**. Converting the apps to ESM too means every file in the monorepo resolves drizzle-orm through the same `import` condition → the same `index.d.ts` types. After that, the clean import works everywhere:

```typescript
import { DRIZZLE, type DrizzleDatabase } from '@atlas/database';

@Inject(DRIZZLE)
private readonly db: DrizzleDatabase<typeof ledgerSchema>
```

**What converting apps to ESM required:**
1. Add `"type": "module"` to the app's `package.json`
2. Add explicit `.js` extensions to every relative import (ESM rule under `nodenext`)
3. Switch the build from **webpack** (which emits CJS) to **plain `tsc`** — NestJS apps run directly from compiled output, so webpack wasn't needed
4. Override `emitDeclarationOnly: false` in `tsconfig.app.json` so tsc emits runtime JS (the base config is declaration-only for libraries)
5. Fix a latent bug: `z.object().extend(postgresConfigSchema)` must be `.merge()` (extend takes a shape, merge takes a schema)

> **Lesson:** when a monorepo mixes ESM packages and CJS apps, libraries that use `unique symbol`s in their types (drizzle, some ORMs) will produce nominally-incompatible types across the ESM/CJS boundary. The robust fix is **uniform module format**, not per-file workarounds. (That said, the `paths`/re-export workaround can be useful if you can't unify formats for some reason.)

**Related fixes in the same pass:**
- `EventPublisher` (a type used in a decorated constructor) must be `import type` under `isolatedModules` + `emitDecoratorMetadata`.
- Integration specs need `@testcontainers/postgresql` declared as their own devDependency (pnpm doesn't allow phantom deps).
- The `@nx/webpack` plugin in `nx.json` inferred `build` targets; our apps now define their own tsc-based `build`/`serve` targets in `project.json`.

---

## How to Run It

```bash
# Local Postgres must be running
pnpm infra:up

# Run the ledger service
pnpm nx serve ledger-service

# Generate/apply migrations after schema changes
cd apps/ledger-service && pnpm db:generate && pnpm db:migrate

# Tests (unit + integration via Testcontainers)
pnpm nx run ledger-service:test
```

## What's Next

The ledger slice is the foundation. Natural next steps:
- **Ledger replay & snapshots** — rebuild projections from journal history (the spec's recovery story)
- **Outbox pattern** — write the event in the same transaction as the journal, with a publisher worker (instead of in-memory bus)
- **Wallet Service** — the first consumer, reading balances and managing holds on top of the ledger
- **gRPC** — expose `PostJournal`/`GetBalance` as internal proto services
