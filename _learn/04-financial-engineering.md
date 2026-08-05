# 04 — Financial Engineering

This is the most important document in this handbook. If you understand nothing else about Atlas, understand this.

## The Ledger: Source of Truth

### The Single Most Important Principle

> **The Ledger is authoritative. Everything else is derived.**

A wallet balance is not a number in a database column. It's the sum of all ledger entries affecting that wallet.

**Wrong:**
```typescript
// Updating a balance directly
wallet.balance += 10000;
```

**Right:**
```typescript
// Recording a journal entry, which updates the balance projection
ledger.post({
  debit: { account: "PlatformCash", amount: 10000 },
  credit: { account: "SamuelsWallet", amount: 10000 }
});
```

Why does this matter?
- The balance can always be recomputed from the ledger
- Every transaction is auditable
- Fraud is harder (you'd need to forge the entire history, not just one number)
- Recovery from corruption is just a replay away

---

## Double-Entry Accounting

### The Core Concept

Every financial transaction has **at least two entries** — a debit and a credit. Total debits must always equal total credits.

**Example: Samuel deposits ₦10,000**

| Account | Debit | Credit |
|---------|-------|--------|
| Platform Cash (Asset) | ₦10,000 | |
| Samuel Wallet (Liability) | | ₦10,000 |

**Example: Samuel transfers ₦3,000 to John**

| Account | Debit | Credit |
|---------|-------|--------|
| Samuel Wallet (Liability) | ₦3,000 | |
| John Wallet (Liability) | | ₦3,000 |

Everything balances. Always.

### Why Double-Entry?

1. **Auditability:** You can trace every naira from source to destination
2. **Fraud detection:** If debits ≠ credits, something is wrong
3. **Reconciliation:** Compare with external bank statements
4. **Financial statements:** Generate balance sheets and P&L reports
5. **Reversals:** Cancel a transaction by posting the reverse entries

### The Accounting Equation

```
Assets = Liabilities + Equity
```

In Atlas terms:
```
Platform Cash (Asset) = Customer Wallets (Liability) + Platform Revenue (Equity)
```

When a customer deposits money:
- **Platform Cash** increases (Asset ↑)
- **Customer Wallet** increases (Liability ↑)

When Atlas charges a fee:
- **Customer Wallet** decreases (Liability ↓)
- **Platform Revenue** increases (Equity ↑)

The equation must always balance.

---

## Chart of Accounts

Atlas implements a real accounting chart:

```
1000 Assets
  1100 Cash
    1110 Main Bank Account
    1120 Escrow Account
  1200 Settlement Receivables

2000 Liabilities
  2100 Customer Wallets
  2200 Merchant Wallets
  2300 Outstanding Transfers

3000 Equity
  3100 Retained Earnings

4000 Revenue
  4100 Processing Fees
  4200 FX Revenue
  4300 Card Fees

5000 Expenses
  5100 Refunds
  5200 Chargebacks
  5300 Bank Charges
```

Each account has:
- A numeric code (hierarchical grouping)
- A type (Asset, Liability, Equity, Revenue, Expense)
- A currency (journals cannot mix currencies)

---

## Immutability

### The Rule: Never UPDATE, Never DELETE

Financial records are immutable. If you make a mistake:

**Wrong:**
```sql
UPDATE ledger_entries SET amount = 5000 WHERE id = 123;
```

**Right:**
```sql
-- Original entry stays
-- Create a REVERSAL journal
-- Create a CORRECTED journal
```

The audit trail shows:
1. Original entry: ₦10,000 transferred (mistake)
2. Reversal entry: ₦10,000 reversed
3. Corrected entry: ₦5,000 transferred

Anyone can verify the sequence. Nothing is hidden.

### Why Immutability?

- **Regulatory compliance:** Financial records must be preserved
- **Audit integrity:** Auditors must see original entries, not edited ones
- **Fraud prevention:** Hard to cover tracks
- **Reproducibility:** Balances should always recompute to the same values

---

## The Ledger Service Architecture

### Core Entities

```
Ledger
  └── Account (where money lives)
       └── Posting (single debit or credit)
            └── Journal (group of postings that balance)
```

### Journal Lifecycle

```
Draft → Validated → Posted → (Reversed)
```

Only **Posted** journals affect balances. Draft journals are work-in-progress.

### Posting Pipeline

```
Validate request → Build journal → Validate debit/credit balance
→ Ensure debits == credits → Persist → Publish JournalPosted event
→ Update balance projection
```

Each stage has a single responsibility. If validation fails, nothing is persisted. If publishing fails, the outbox pattern ensures eventual delivery (see Event-Driven Architecture doc).

---

## Balance Projections

### The Problem

Computing `SUM(all postings)` for every balance query would be slow with millions of entries.

### The Solution: Projections

We maintain a `balance_projection` table:
```
account_id | balance | last_sequence_number
wallet_123 | 50000   | 987654
```

Updated asynchronously when journals are posted. This is a performance optimization, not a source of truth.

**If the projection gets corrupted:**
1. Delete projection
2. Replay all ledger entries from the last snapshot
3. Rebuild projection

The ledger is always there to reconstruct from.

### Snapshots

For efficiency, we save snapshots periodically (every N entries). Replay starts from the latest snapshot rather than entry #1. For a ledger with 500 million entries, this reduces replay from hours to seconds.

---

## The Saga Pattern

### The Problem: Distributed Transactions

A transfer touches multiple services:
1. Wallet Service (reserve funds)
2. Ledger Service (post journal)
3. Wallet Service (capture reservation)
4. Notification Service (send email)
5. Webhook Service (notify merchant)

There is NO single database transaction that spans all of these. We cannot `BEGIN TRANSACTION` across five services.

### The Solution: Saga

A Saga is a sequence of local transactions, each with a **compensating action** (undo).

```
Step 1: Reserve funds in Wallet Service
  Compensate: Release reservation

Step 2: Post journal in Ledger Service
  Compensate: Post reverse journal

Step 3: Capture reservation in Wallet Service
  Compensate: This is the point of no return (money has moved).
              If the transfer is completed but notification fails,
              we retry notification—not reverse the funds.

Step 4: Publish TransferCompleted event
  Compensate: Retry (event is idempotent)
```

### Orchestrated vs Choreographed Saga

**Choreographed:** Each service listens for events and decides what to do next.
- Pro: Decoupled
- Con: Hard to understand the overall workflow

**Orchestrated:** A central coordinator (Transfer Service) tells each service what to do.
- Pro: Clear workflow visibility
- Con: Coordinator is a single point of failure (mitigated by persistence)

Atlas uses **orchestrated** Sagas because financial workflows must be explicit and auditable.

---

## Idempotency

### The Problem: Network Retries

```
Client sends: POST /transfers { amount: 10000 }
  → Network timeout (but server processed it)
Client retries: POST /transfers { amount: 10000 }
  → Double transfer! ₦20,000 moved.
```

### The Solution: Idempotency Keys

Every write request includes an idempotency key:
```
POST /transfers
Idempotency-Key: 8d46b48d-a1c2-4f3e-b567-890123456789
```

The server:
1. Checks if this key has been seen before
2. If yes → returns the original response (no duplicate work)
3. If no → processes the request and stores the key+response

Keys are stored in Redis (fast lookup) with PostgreSQL as durable backup. Keys expire after a configurable retention period (e.g., 24 hours for payments, longer for regulatory requirements).

### Where Idempotency Is Critical

- Payment creation
- Transfer initiation
- Refund creation
- Settlement creation
- Webhook delivery (prevent duplicate callbacks)

---

## Optimistic Locking

### The Problem: Race Conditions

```
Wallet balance: ₦20,000
Request A: Transfer ₦20,000 → John
Request B: Transfer ₦20,000 → Jane

Without protection:
  Both validate "balance >= 20000" ✓
  Both debit 20000
  Result: ₦-20,000 (disaster)
```

### The Solution: Version Columns

Every wallet has a `version` number:

```sql
-- Current state
SELECT balance, version FROM wallets WHERE id = '123';
-- balance=20000, version=21

-- Attempt update
UPDATE wallets
SET balance = 0, version = 22
WHERE id = '123' AND version = 21;

-- If 0 rows updated → someone else modified it → retry
```

When two requests try to debit simultaneously:
1. Both read version 21
2. Request A updates successfully (version becomes 22)
3. Request B's update fails (version is now 22, not 21)
4. Request B retries with fresh data

This prevents lost updates without database-level locking (which would hurt performance).

---

## Money Representation

### The Golden Rule

**Never use floating-point for money.**

```typescript
// WRONG
const amount: number = 1250.00;  // 1250.0000000002 in memory

// RIGHT
const amount: number = 125000;    // 125000 kobo = ₦1,250.00
```

Money is always:
- Stored as integers in the minor unit (kobo for NGN, cents for USD)
- Transmitted as integers in JSON
- Never subjected to float arithmetic

The API format:
```json
{
  "amount": 125000,
  "currency": "NGN"
}
```

This means ₦1,250.00. The client converts to display format.

---

## What Happens When Things Go Wrong

### Scenario: Ledger Service Crashes Mid-Posting

1. Journal entries were persisted (database transaction committed)
2. Balance projection updated (same transaction)
3. `JournalPosted` event was NOT published (crash before Pub/Sub)

**Recovery:** The Outbox pattern. The event was written to an `outbox_events` table in the same transaction. A background worker scans unpublised outbox events and publishes them to Pub/Sub. When the service restarts, the worker catches up.

### Scenario: Balance Projection Corrupted

1. Detect (reconciliation shows mismatch)
2. Delete projection rows for affected accounts
3. Replay ledger entries from last snapshot
4. Projection is rebuilt
5. Verify (debits == credits for affected accounts)

Zero data loss. Zero manual intervention. The ledger is always the source of truth.

### Scenario: Duplicate Transfer Due to Retry

1. Client retries with the same idempotency key
2. Server finds the key in Redis
3. Returns the original response (transfer ID, status)
4. No duplicate financial effects

---

## Reconciliation

### Daily Reconciliation Process

```
Evening batch job:
1. Query today's settled transfers from Ledger
2. Query today's payouts from Settlement
3. Query today's bank confirmations from Banking Connector
4. Compare: Ledger + Settlement + Bank should all agree
5. Generate reconciliation report
6. Flag discrepancies for investigation
```

Differences are NOT auto-corrected. They're flagged for human review. The assumption is that mismatches indicate bugs or fraud, not expected drift.

---

## Key Takeaways

1. **The Ledger is the source of truth.** Balances, wallets, reports — everything derives from it.
2. **Double-entry accounting** ensures debits always equal credits. It's not complexity for its own sake — it's a mathematical guarantee.
3. **Immutability** means financial records can never be altered. Compensating transactions, not edits.
4. **Saga pattern** enables distributed transactions without 2PC. Each step has a compensating action.
5. **Idempotency** makes retries safe. Same request → same result. Always.
6. **Optimistic locking** prevents race conditions without database bottlenecks.
7. **Minor units** prevent floating-point disasters.
8. **Reconciliation** catches what automated safeguards miss.

## Next: [Event-Driven Architecture](./05-event-driven-architecture.md)
