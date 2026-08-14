Awesome. Now we get to one of the most misunderstood parts of financial systems.

People think **Wallet = Money**.

It isn't.

A wallet is really just an **interface** to the ledger.

The wallet is where business rules live.

The ledger is where accounting lives.

That separation is exactly how many financial platforms are designed.

---

# Atlas Financial Infrastructure

# Wallet Service Specification (WSS)

Version 1.0

---

# Purpose

The Wallet Service manages the lifecycle of wallets and exposes financial operations to consumers.

It is responsible for:

- Wallet creation
- Wallet lifecycle
- Balance queries
- Available balance calculations
- Holds
- Reservations
- Freezing
- Closing
- Limits
- Business validation

It is **not** responsible for accounting.

Every financial mutation ultimately results in ledger postings.

---

# Responsibilities

The Wallet Service owns:

- Wallet metadata
- Wallet status
- Wallet limits
- Balance projections
- Holds
- Reservations

It does **not** own:

- Double-entry bookkeeping
- Journal postings
- Financial history
- Reconciliation

---

# Wallet Lifecycle

```text
            Create Wallet
                  │
                  ▼
              INITIALIZING
                  │
                  ▼
                ACTIVE
          ┌───────┴────────┐
          ▼                ▼
      FROZEN          SUSPENDED
          │                │
          └───────┬────────┘
                  ▼
                ACTIVE
                  │
                  ▼
                CLOSED
```

Wallets never get deleted.

Ever.

---

# Wallet Entity

```typescript
Wallet;

id;

walletNumber;

ownerId;

ownerType;

currency;

status;

availableBalance;

ledgerBalance;

reservedBalance;

version;

ledgerAccountId;   // the ledger account this wallet's balance projects from

createdAt;

updatedAt;
```

Notice something important.

There is **no transaction history** inside the wallet.

That belongs to the Ledger Service.

**`ledgerAccountId`:** each wallet is linked to a **dedicated ledger account** (per-wallet accounts, not one shared account per type — see `_learn/22-ledger-account-model.md`). The account is provisioned when the wallet is created, and the wallet's `ledgerBalance` is a projection of that account. The wallet never writes to the ledger directly — it reacts to `JournalPosted` events and the ledger is authoritative.

---

# Wallet Types

Instead of hardcoding wallet behavior, we'll support multiple wallet categories.

```text
PERSONAL

BUSINESS

MERCHANT

SYSTEM

ESCROW

SETTLEMENT

FEE

TREASURY
```

Each wallet type can have different policies.

Example

Merchant Wallet

- daily payout

Escrow Wallet

- cannot withdraw

Treasury Wallet

- internal only

---

# Wallet States

```text
INITIALIZING

ACTIVE

FROZEN

SUSPENDED

CLOSED
```

---

## ACTIVE

Everything allowed.

---

## FROZEN

Allowed

- receive money

Not allowed

- spend
- transfer
- withdraw

---

## SUSPENDED

Nothing allowed.

---

## CLOSED

Read-only forever.

---

# Wallet Number Generation

Never expose database IDs.

Instead

```text
ATL-NGN-0000012345
```

Format

```text
PREFIX

Currency

Sequence

Checksum
```

Human-readable.

Auditable.

---

# Balances

Every wallet exposes

```text
Ledger Balance

Reserved Balance

Available Balance
```

---

## Ledger Balance

Derived from ledger postings.

Never manually updated.

---

## Reserved Balance

Money temporarily locked.

Examples

- card authorization
- pending transfer
- marketplace escrow

---

## Available Balance

```text
Ledger

-

Reserved

=

Available
```

Example

Ledger

₦50,000

Reserved

₦8,000

Available

₦42,000

---

# Why Reservations Exist

Suppose

Samuel buys something.

Payment gateway responds in

5 seconds.

We don't want him spending that money again.

So we reserve it immediately.

Example

```text
Available

50,000
```

Reserve

10,000

Now

```text
Ledger

50,000

Reserved

10,000

Available

40,000
```

No money moved.

Only availability changed.

---

# Reservation Lifecycle

```text
Reserve Funds

↓

Pending

↓

Captured

↓

Released

↓

Expired
```

---

## Pending

Money locked.

---

## Captured

Transfer succeeded.

Reservation removed.

Ledger updated.

---

## Released

Transfer failed.

Funds become available again.

---

## Expired

Reservation timed out.

Automatically released.

---

# Reservation Entity

```typescript
Reservation;

id;

walletId;

reference;

amount;

currency;

status;

expiresAt;

reason;

createdAt;
```

---

# Wallet APIs

## Create Wallet

```http
POST

/v1/wallets
```

---

## Get Wallet

```http
GET

/v1/wallets/{id}
```

---

## Get Balance

```http
GET

/ wallets/{id}/balance
```

Returns

```json
{
  "ledgerBalance": 50000,

  "reservedBalance": 10000,

  "availableBalance": 40000
}
```

---

## Freeze Wallet

```http
POST

/wallets/{id}/freeze
```

---

## Unfreeze Wallet

```http
POST

/wallets/{id}/activate
```

---

## Reserve Funds

```http
POST

/wallets/{id}/reserve
```

---

## Release Reservation

```http
POST

/reservations/{id}/release
```

---

# Events

Published

```text
WalletCreated

WalletFrozen

WalletActivated

FundsReserved

ReservationReleased

ReservationExpired
```

Subscribed

```text
TransferCompleted

JournalPosted

JournalReversed
```

Notice

Wallet reacts.

Ledger leads.

---

# Synchronizing Balances

Question

When does the wallet balance change?

Never directly.

Instead

```text
Journal Posted

↓

Ledger Event

↓

Wallet Projection Updated

↓

Balance Changes
```

This ensures every visible balance is backed by an immutable accounting event.

---

# Optimistic Locking

Suppose two transfers arrive simultaneously.

Wallet balance

₦20,000

Transfer A

₦20,000

Transfer B

₦20,000

Without protection

Both succeed.

Disaster.

---

Solution

Every wallet has

```text
Version
```

Current

```text
Version 21
```

Update query

```sql
UPDATE wallets

SET version = 22

WHERE

id=...

AND

version=21;
```

If

0 rows updated

Retry.

This prevents lost updates without relying on coarse-grained locks.

---

# Spending Validation

Before reserving funds:

```text
Wallet Active?

↓

Currency Match?

↓

Enough Available Balance?

↓

Limits?

↓

Velocity Rules?

↓

Fraud Rules?

↓

Reserve
```

Notice

We validate

Before

Ledger posting.

---

# Limits

Daily

Monthly

Single Transfer

Withdrawal

Deposit

Merchant

Country

Wallet Type

Limits should be policy-driven rather than hardcoded so different organizations or products can configure their own rules.

---

# Wallet Cache

Hot balances

Redis

Key

```text
wallet:balance:{walletId}
```

TTL

30 seconds

Cache invalidated

Whenever

JournalPosted

arrives.

Redis is a performance optimization, never a source of truth.

---

# Failure Recovery

Suppose

Wallet projection crashes.

No problem.

Replay

```text
Ledger Events

↓

Rebuild Projection

↓

Current Balance
```

The wallet can always recover because the ledger is authoritative.

---

# Security

Every wallet operation requires:

- Authentication
- Organization validation
- Ownership validation
- RBAC
- Correlation ID
- Audit logging

Sensitive operations like freezing a wallet should also require elevated permissions and be fully traceable.

---

# Wallet State Machine

One thing I would add that many systems overlook is an explicit state machine.

```text
ACTIVE
   │
   ├──────────────► FROZEN
   │                    │
   │                    ▼
   │                ACTIVE
   │
   ├──────────────► SUSPENDED
   │                    │
   │                    ▼
   │                ACTIVE
   │
   └──────────────► CLOSED
```

Every transition should emit a domain event and be validated against allowed state transitions.

---

# Wallet Service Dependencies

```text
                Identity Service
                       │
                       ▼
                Wallet Service
                 /     |      \
                /      |       \
               ▼       ▼        ▼
        Ledger   Fraud   Notification
               \      |       /
                \     |      /
                 ▼    ▼     ▼
                 Pub/Sub Event Bus
```

The Wallet Service coordinates business rules but delegates accounting to the Ledger Service and reacts to financial events as they occur.

---

# Why This Design?

This separation gives us several advantages:

- The ledger remains the single financial source of truth.
- Wallet logic stays focused on customer-facing behavior.
- Business policies (limits, holds, freezes) evolve independently from accounting rules.
- If we introduce new products—gift cards, prepaid accounts, escrow, loyalty points—they can reuse the same ledger with different wallet policies.

---

# Next: Transfer Service Specification (TSS)

This is where everything comes together.

We'll design the service that orchestrates money movement across the platform, including:

- Transfer lifecycle and state machine
- Saga orchestration
- Idempotency guarantees
- Outbox integration
- Retry strategies
- Compensation workflows
- Failure recovery
- Internal vs external transfers
- Sequence diagrams
- Event flows
- Database schema
- APIs
- Performance and scalability

The Transfer Service is effectively the "conductor" of the financial orchestra—it coordinates the work, but the Ledger Service records the financial truth and the Wallet Service enforces customer-facing rules.
