# 17 — Financial Terms Glossary

A quick-reference cheat sheet for the accounting / financial terms used in Atlas code. Skim this whenever you see a term and need the meaning in 10 seconds.

---

## ⚠️ First: Classic Accounting vs Atlas Naming

The textbook definitions (what you'll find on Google) are **correct** — but Atlas reuses the words slightly differently. This is intentional (DDD "ubiquitous language"): each project picks its own meaning for its own context.

| Classic accounting term | Classic meaning | Atlas name | In our code |
|------------------------|----------------|------------|-------------|
| **Journal** | The *book of original entry* — chronological log of every transaction | `journals` | One row = **one transaction** (a balanced group of postings), not the whole book |
| **Journal entry** | A single transaction inside that book | (we call it) **Journal** | a `journals` row + its `journal_postings` |
| **Ledger** | The *book of final entry* — sorted by account, running balance per account | `balance_projection` (+ `accounts`) | the per-account running balances |
| **Ledger** (as a system) | — | `ledger-service` | the entire double-entry system: journals + postings + accounts + balances |
| **Posting** | Posting journal entries to the ledger | `journal_postings` | a single debit/credit line |

**The 10-second version:**
- Atlas **Journal** ≈ classic **journal entry** (one transaction: "debit A, credit B")
- Atlas **Ledger** = the whole accounting system
- The classic **ledger** (per-account balances) = our **`balance_projection`**

**Wallet** matches the classic definition: a container of value backed by an internal ledger. `wallets.ledger_balance` is literally a projection of the ledger.

---

## Ledger Terms (ledger-service)

| Term | Table/Concept | What it means |
|------|--------------|---------------|
| **Ledger** | — | The complete, immutable record of every financial movement. The source of truth. |
| **Double-entry** | — | Every transaction is recorded twice: a debit (money out) and a credit (money in). Debits must always equal credits. |
| **Account** | `accounts` | A "place money lives" — e.g. `Platform Cash`, `Customer Wallets`, `Fees`. NOT a user. The chart of accounts is the list of all accounts. |
| **Chart of accounts** | `accounts` | The numbered list of accounts (1000 assets, 2000 liabilities, 3000 equity, 4000 revenue, 5000 expenses). |
| **Journal** | `journals` | One balanced transaction — the container that groups a set of postings together. The "double" in double-entry. |
| **Posting** | `journal_postings` | A single debit or credit line inside a journal. E.g. "debit Platform Cash ₦10,000". |
| **Debit / Credit** | `journal_postings.direction` | Which side of the entry. A debit increases assets & expenses; a credit increases liabilities, equity & revenue. |
| **Balance projection** | `balance_projection` | A cached, derived account balance. NOT the source of truth — it's rebuilt from postings. |
| **Reference** | `journals.reference` | The idempotency key. Retrying the same reference returns the same journal (no duplicates). |
| **Reversal** | *(future)* | Undoing a mistake by posting a NEW journal that negates the old one — never editing the original. |

### How a transfer shows up in the ledger

```
Samuel sends ₦3,000 to John
= ONE journal with TWO postings:
  debit  Samuel Wallet Liability   ₦3,000
  credit John Wallet Liability     ₦3,000
```

---

## Wallet Terms (wallet-service)

| Term | Table/Concept | What it means |
|------|--------------|---------------|
| **Wallet** | `wallets` | A customer-facing balance container. A business-rules facade OVER the ledger — it's not the accounting engine. |
| **Ledger balance** | `wallets.ledger_balance` | Total money the wallet owns (a projection of ledger postings). |
| **Reserved balance** | `wallets.reserved_balance` | Money currently locked by holds (can't be spent). |
| **Available balance** | derived | What's actually spendable: `ledger − reserved`. |
| **Reservation** (a.k.a. hold) | `reservations` | Temporarily locks funds WITHOUT moving them. e.g. a card auth, a pending transfer, marketplace escrow. |
| **Capture** | `reservations` → CAPTURED | The hold becomes real — reserved funds are now permanently debited. |
| **Release** | `reservations` → RELEASED | The hold is lifted — funds return to available. |
| **Expire** | `reservations` → EXPIRED | A hold that timed out gets auto-released. |
| **Wallet number** | `wallets.wallet_number` | Human-readable id: `ATL-NGN-0000000001-3`. Never expose the DB id. |
| **Optimistic locking** | `wallets.version` | A version counter; every write checks it to stop two requests from overwriting each other. |
| **Wallet status** | `wallets.status` | INITIALIZING → ACTIVE ↔ FROZEN/SUSPENDED → CLOSED (terminal). |

### The reserve → capture flow

```
wallet has:  ledger 100000, reserved 0      → available 100000
reserve 30000                               → available 70000, reserved 30000
capture 30000                               → ledger 70000,  reserved 0
```

Money only "really" moves on capture. Reserve just locks availability.

---

## Shared Concepts (used everywhere)

| Term | Where | What it means |
|------|-------|---------------|
| **Money** | `@atlas/shared` | Always an integer in minor units (kobo/cents). `{ amount: 125000, currency: "NGN" }` = ₦1,250.00. Never floats. |
| **Idempotency key** | journals, reservations | A client-supplied unique string; retrying with it returns the original result instead of duplicating. |
| **Minor units** | everywhere | Kobo for NGN, cents for USD. 100 kobo = 1 naira. |
| **Correlation ID** | every request | One ID that follows a single business action across all services/logs/events. |
| **Outbox pattern** | *(future)* | Write the business row AND a "publish this event" row in the same DB transaction, so an event is never lost. |
| **Saga** | *(future, Transfer)* | A multi-step transaction across services; if a later step fails, earlier steps are compensated (undone). |

---

## The mental model

```
         Ledger = the truth (immutable history of every move)
            ▲
            │ read/write
            │
   Transfer Service  (orchestrates the journey)
            │
            ▼
   Wallet Service = the facade (holds, freeze, what the customer sees)
```

- **Ledger** records *what happened*. Never edited.
- **Wallet** enforces *business rules* (holds, freeze, limits) and shows *balances* (projections).
- **Transfer** (next up) *orchestrates* money movement across them.

If a balance is wrong, you rebuild it from the ledger — the wallet is derived, the ledger is authoritative.
