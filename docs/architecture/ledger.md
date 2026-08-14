> **The ledger is the source of truth. Not the wallet. Not Redis. Not the balance table.**

This is one of the biggest misconceptions developers have.

A wallet balance is **derived**.

The ledger is **authoritative**.

---

# Atlas Financial Infrastructure

# Ledger Service Specification (LSS)

Version 1.0

---

# Purpose

The Ledger Service is responsible for maintaining the complete financial history of the platform.

Its responsibilities include:

- Double-entry bookkeeping
- Journal creation
- Posting entries
- Maintaining financial integrity
- Balance calculation
- Account hierarchy
- Financial audit
- Reconciliation
- Immutable transaction history

Everything that changes money eventually passes through this service.

---

# Guiding Principle

## Money cannot disappear.

If ₦100 leaves somewhere,

₦100 must appear somewhere else.

Always.

The accounting equation must remain balanced.

---

# Double Entry Accounting

Every financial transaction creates **at least two entries**.

Example

Samuel deposits

₦10,000

Instead of

```text
Wallet Balance

0

↓

10,000
```

We record

| Account                 |   Debit |  Credit |
| ----------------------- | ------: | ------: |
| Platform Bank Account   | ₦10,000 |         |
| Samuel Wallet Liability |         | ₦10,000 |

Total Debits

₦10,000

Total Credits

₦10,000

Balanced.

---

Transfer example

Samuel sends

₦3,000

to

John

| Account                 |  Debit | Credit |
| ----------------------- | -----: | -----: |
| Samuel Wallet Liability | ₦3,000 |        |
| John Wallet Liability   |        | ₦3,000 |

Again

Balanced.

---

# Why Double Entry?

Because it gives us:

- auditability
- fraud detection
- reconciliation
- reversals
- historical reports
- financial statements

---

# Core Domain Model

```
Ledger

└── Journal

        └── Journal Entry

                └── Posting

                        └── Account
```

---

# Entities

## Account

Represents somewhere money lives.

Examples

```
Platform Cash

Escrow

Merchant Wallet

Customer Wallet

Fees

Revenue

VAT

Reserve

Settlement

Outstanding Transfers
```

Notice something.

There is **no User table here.**

The ledger doesn't care about users.

It only knows accounts.

---

## Account Model: Per-Wallet Accounts

> **Clarification (decision record):** accounts are provisioned **per wallet/merchant**, not one shared account per type. See `_learn/22-ledger-account-model.md` for the full reasoning.

The chart of accounts (below) is the **classification hierarchy** — it defines the types (asset/liability/etc.), codes, and each account's place in the accounting equation. But the **leaf accounts are provisioned per business entity**:

- Every wallet gets its own liability account (conceptually coded under its type, e.g. a customer wallet under `2100`), created when the wallet is created
- The wallet stores the `ledgerAccountId` its balance projects from
- The examples in this spec (`Samuel Wallet Liability`, `John Wallet Liability`) are literal, not shorthand — each is a distinct account

Why per-wallet and not shared:
- **Reconciliation** — the nightly reconciliation (ledger vs wallet projection vs settlement) must work per wallet, not just in aggregate
- **Attribution & audit** — "show Samuel's ledger history" must be answerable from the ledger, not reconstructed from projections
- **Controls** — freezing a wallet's funds should be enforceable at the ledger layer
- **Production reality** — Modern Treasury, Stripe, and Adyen provision accounts per counterparty

Consequences for other services:
- **Wallet Service** creates/links its ledger account on wallet creation (auto-provision, or store a provided id)
- **Transfer Service** resolves the source/destination ledger accounts **from the wallets**, not from client-supplied ids
- A client can never post to an arbitrary account — the service always resolves accounts from owned resources

---

## Journal

A Journal groups postings.

Example

```
Transfer

TX12345
```

contains

```
Debit Samuel

Credit John
```

---

## Posting

Smallest accounting record.

Fields

```
Debit

Credit

Amount

Currency

Account

Timestamp
```

Immutable.

---

# Aggregate

```
Transfer

↓

Journal

↓

Postings
```

A Journal can never exist without postings.

---

# Account Types

We'll implement a real Chart of Accounts.

```
Assets

Liabilities

Equity

Revenue

Expenses
```

Exactly like accounting software.

---

Example

```
Assets

    Platform Cash

    Escrow

    Bank Accounts

Liabilities

    Wallet Balances

    Merchant Funds

Revenue

    Processing Fees

    FX Fees

Expenses

    Refunds

    Chargebacks
```

---

# Chart of Accounts

```
1000 Assets

1100 Cash

1110 Main Bank

1120 Escrow

1200 Settlement

2000 Liabilities

2100 Customer Wallets

2200 Merchant Wallets

3000 Equity

4000 Revenue

4100 Processing Fees

4200 FX Revenue

5000 Expenses

5100 Refunds

5200 Operational Costs
```

Real accounting systems use numeric account codes because they provide stable references, simplify reporting, and allow hierarchical grouping.

---

# Posting Rules

Every Journal must satisfy:

```
Total Debits

==

Total Credits
```

Otherwise

Reject.

No exceptions.

---

# Currency Rules

A Journal contains

One currency only.

Good

```
NGN

Debit

NGN

Credit
```

Bad

```
Debit

USD

Credit

NGN
```

Cross-currency movements belong in a dedicated FX workflow, which creates linked journals for each currency and records the exchange gain/loss separately.

---

# Immutable Ledger

Never

UPDATE

Never

DELETE

Instead

Create reversal journals.

Example

Mistaken transfer

```
Transfer

↓

Reverse Transfer

↓

New Transfer
```

History remains complete.

---

# Account Balance

A common mistake

```
wallet.balance += amount
```

Never.

Instead

```
SUM(postings)
```

The balance is calculated from the ledger.

---

But...

Computing millions of rows every request would be slow.

So we'll introduce projections.

---

# Balance Projection

We'll maintain

```
Account Balance Table
```

Updated asynchronously.

It is

Not

The source of truth.

If corrupted,

Rebuild it.

---

# Tables

```
accounts

journals

journal_postings

balance_projection

reconciliation_jobs

ledger_snapshots
```

---

# Account Table

```
id

account_code

name

type

currency

status

created_at
```

---

# Journal Table

```
id

reference

description

status

currency

created_at

posted_at
```

---

# Posting Table

```
id

journal_id

account_id

direction

amount

currency

sequence_number

created_at
```

Every posting belongs to one journal.

---

# Sequence Numbers

Every journal posting receives a monotonically increasing sequence number.

Why?

For:

Replay

Snapshots

Replication

Auditing

Recovery

This also allows us to rebuild projections from any point in time.

---

# Journal States

```
Draft

Validated

Posted

Reversed
```

Only **Posted** journals affect balances.

---

# Posting Pipeline

```
Receive Request

↓

Validate

↓

Build Journal

↓

Validate Debits

↓

Validate Credits

↓

Ensure Balanced

↓

Persist

↓

Commit

↓

Publish Event

↓

Update Projection
```

Each stage has a single responsibility, making failures easier to isolate and test.

---

# Ledger Events

```
JournalCreated

JournalPosted

JournalReversed

AccountCreated

BalanceProjectionUpdated

LedgerReplayStarted

LedgerReplayCompleted
```

Notice

Business events.

Not database events.

---

# Replay

Suppose Redis dies.

Suppose balance projection becomes corrupted.

No problem.

Replay

```
Journal 1

↓

Journal 2

↓

Journal 3

↓

...

↓

Latest
```

Everything rebuilds.

This capability is one of the strongest reasons for keeping an immutable event history.

---

# Snapshots

If we have

500 million

ledger entries,

Replay becomes expensive.

Solution

Snapshots.

Every

100,000

entries

Save balances.

Replay starts

From latest snapshot.

Instead of

500 million entries

Maybe only

20,000.

The snapshot interval should be configurable and based on performance testing rather than a fixed number.

---

# Reconciliation

Every night

Run

```
Ledger

↓

Wallet Projection

↓

Settlement

↓

Bank Imports

↓

Compare

↓

Generate Report
```

Differences become reconciliation cases for investigation rather than being corrected automatically.

---

# Performance Strategy

A ledger must optimize for correctness first, then performance.

We'll achieve scale through:

- PostgreSQL partitioning for large posting tables
- Composite indexes on `(account_id, sequence_number)` and `(journal_id, created_at)`
- Read replicas for reporting workloads
- Materialized views for accounting summaries
- Balance projections for low-latency reads
- Batch posting where appropriate
- Connection pooling with PgBouncer
- Background reconciliation and snapshot generation

The authoritative ledger remains strongly consistent, while read-heavy reporting and analytics are handled through optimized projections and downstream systems like BigQuery.

---

# Next Document: Wallet Service Specification

Now that the ledger is defined, the wallet service becomes much simpler.

A wallet is **not** an accounting engine.

Its responsibilities are to:

- Manage wallet lifecycle
- Expose balances (from projections)
- Handle holds and reservations
- Enforce business rules
- Coordinate with the ledger for financial postings

The wallet service will never "move money" by itself—it requests financial operations that the ledger records. That separation of responsibilities is one of the key architectural decisions that keeps Atlas maintainable and financially correct as it grows.
