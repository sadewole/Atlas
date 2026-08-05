# 03 — Domain-Driven Design

## Why DDD?

Most backend projects organize code around database tables or technical layers. DDD organizes around business domains. This matters enormously for financial systems because the language of accounting (debits, credits, journals, postings) should be reflected in the code.

### Without DDD (Anemic Model)

```typescript
// services/transfer/transfer.service.ts
class TransferService {
  async transfer(data: TransferDto) {
    const wallet = await this.db.wallets.find(data.sourceId);
    wallet.balance -= data.amount;
    await this.db.wallets.save(wallet);

    const destWallet = await this.db.wallets.find(data.destId);
    destWallet.balance += data.amount;
    await this.db.wallets.save(destWallet);
  }
}
```

Problems:
- Business rules are scattered across service methods
- No concept of "accounting" — just arithmetic
- Impossible to audit
- Same logic is duplicated everywhere

### With DDD (Rich Domain Model)

```typescript
class Journal {
  private postings: Posting[];

  addPosting(account: Account, direction: DebitCredit, amount: Money) {
    this.postings.push(new Posting(account, direction, amount));
  }

  validate(): void {
    const debits = sum(this.postings.filter(p => p.isDebit));
    const credits = sum(this.postings.filter(p => p.isCredit));
    if (!debits.equals(credits)) throw new UnbalancedJournalError();
  }

  post(): void {
    this.validate();
    this.status = 'POSTED';
  }
}
```

Now the domain model enforces accounting rules. You can't accidentally post an unbalanced journal.

---

## Bounded Contexts

A bounded context is a boundary around a set of related domain concepts. Inside the boundary, terms have a single, clear meaning.

### Atlas Bounded Contexts

```
┌─────────────┐  ┌──────────────┐  ┌───────────────┐
│   Identity  │  │    Wallet    │  │    Ledger     │
│  - User     │  │  - Wallet    │  │  - Account    │
│  - Role     │  │  - Hold      │  │  - Journal    │
│  - API Key  │  │  - Balance   │  │  - Posting    │
│  - Session  │  │  - Reserve   │  │  - Projection │
└─────────────┘  └──────────────┘  └───────────────┘

┌─────────────┐  ┌──────────────┐  ┌───────────────┐
│  Transfer   │  │   Payment    │  │  Settlement   │
│  - Transfer │  │  - Intent    │  │  - Batch      │
│  - Saga     │  │  - Checkout  │  │  - Payout     │
│  - Step     │  │  - Refund    │  │  - Schedule   │
│  - Retry    │  │  - Provider  │  │  - Net Calc   │
└─────────────┘  └──────────────┘  └───────────────┘
```

### Why Contexts Matter

The word "Account" means different things:

**In Identity:** A user account (email, password, profile).  
**In Ledger:** An accounting account (Asset-1100, "Platform Cash").  
**In Banking Connector:** A bank account (account number, routing info).

Without bounded contexts, you'd have one `accounts` table trying to serve all three purposes. With bounded contexts, each service has its own `accounts` table (or concept), with the meaning that makes sense in that domain.

---

## Aggregates

An aggregate is a cluster of domain objects treated as a single unit for data changes.

### Example: Journal Aggregate

```
Journal (Aggregate Root)
  ├── Journal ID
  ├── Status (Draft, Validated, Posted)
  ├── Currency
  ├── Created At
  └── Postings[]
       ├── Account ID
       ├── Direction (Debit/Credit)
       ├── Amount
       └── Sequence Number
```

Rules enforced by the aggregate:
1. A Journal must have at least 2 postings
2. Total debits must equal total credits
3. All postings must be in the same currency
4. A Posted journal cannot be modified (only reversed)

Everything outside the aggregate interacts only through the root (Journal). You can't directly modify a Posting — you go through Journal.addPosting(), which validates the rules.

### Why Aggregates Matter

Without aggregates:
```typescript
// Any code, anywhere, can do this:
posting.amount = 0;          // Bypasses validation
posting.account = different;  // Breaks accounting
```

With aggregates:
```typescript
// Only through the aggregate root:
journal.addPosting(account, DEBIT, new Money(10000, 'NGN'));
// Throws if unbalanced, wrong currency, or already posted
```

---

## Ubiquitous Language

The code should use the same terms as the business domain:

| Business Term | Code Name | NOT This |
|---------------|-----------|----------|
| Payment Intent | PaymentIntent | PaymentRequest |
| Journal Entry | Journal | TransactionLog |
| Settlement Batch | SettlementBatch | PayoutGroup |
| Reservation | Reservation | TemporaryHold |
| Webhook Endpoint | WebhookEndpoint | CallbackUrl |

When a finance person says "post a journal," the code should have `journal.post()`. When they say "net settlement," the code should have `netSettlement`. This reduces the translation cost between business and engineering.

---

## Domain Events

Domain events represent things that happened in the business:

```typescript
class JournalPosted {
  journalId: string;
  accountId: string;
  amount: Money;
  occurredAt: Date;
  sequenceNumber: number;
}
```

Not database events ("row updated"), but business facts ("journal was posted"). Domain events are the primary mechanism for communication between bounded contexts (see Event-Driven Architecture document).

---

## Clean Architecture Inside Each Service

Each microservice follows the same internal structure:

```
ledger-service/
  src/
    domain/          # Business entities, value objects, aggregates
      account.ts
      journal.ts
      posting.ts
      money.ts       # Value object
      errors.ts      # Domain-specific errors

    application/     # Use cases / command handlers
      post-journal.handler.ts
      get-account-balance.handler.ts
      replay-ledger.handler.ts

    infrastructure/  # Technical implementations
      postgres-journal.repository.ts
      pubsub-event.publisher.ts
      redis-idempotency.store.ts

    presentation/    # API layer
      ledger.controller.ts
      ledger.dto.ts
      grpc/
        ledger.proto
```

### Dependency Rule

Dependencies point inward:
```
presentation → application → domain
                                  ↑
                          infrastructure (implements domain interfaces)
```

The domain layer has zero dependencies on frameworks, databases, or network protocols. It's pure business logic, testable in isolation.

---

## Value Objects

Value objects are immutable, self-validating types:

```typescript
class Money {
  constructor(
    readonly amount: number,   // In minor units
    readonly currency: string
  ) {
    if (amount < 0) throw new Error('Amount cannot be negative');
    if (!['NGN', 'USD', 'EUR'].includes(currency)) throw new Error('Unknown currency');
  }

  equals(other: Money): boolean {
    return this.amount === other.amount
      && this.currency === other.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Currency mismatch');
    return new Money(this.amount + other.amount, this.currency);
  }
}
```

Value objects prevent:
- Adding USD and NGN (caught at construction)
- Negative amounts (caught at construction)
- Raw numbers floating around without currency context

---

## Repository Pattern

Repositories abstract data access:

```typescript
interface JournalRepository {
  save(journal: Journal): Promise<void>;
  findById(id: string): Promise<Journal | null>;
  findByAccountId(accountId: string, cursor?: string): Promise<Journal[]>;
}
```

The domain layer defines interfaces. The infrastructure layer implements them (PostgreSQL, in-memory for tests). The application layer depends on interfaces, not implementations — making testing and swapping databases straightforward.

---

## How Services Interact

### Synchronous (gRPC)

Used when a service needs data immediately to complete a request.

```
Transfer Service: "I need Wallet A's balance before I can proceed."
               → calls Wallet Service via gRPC
               → gets balance
               → proceeds with transfer
```

### Asynchronous (Events)

Used when services should react to something that happened, not when they need data right now.

```
Ledger Service publishes: JournalPosted
  → Wallet Service updates balance projection
  → Analytics Service records event
  → Notification Service might send email
  → Webhook Service notifies merchant
```

The Ledger doesn't know or care who listens. It just publishes the fact.

---

## Key Takeaways

1. **Bounded contexts** give each domain its own language and rules
2. **Aggregates** enforce consistency boundaries (a journal's postings must balance)
3. **Ubiquitous language** means code reads like the business domain
4. **Domain events** are the primary async communication mechanism
5. **Clean Architecture** keeps business logic independent of frameworks
6. **Value objects** carry validation — you can't create invalid money
7. **Repositories** abstract data access behind domain-friendly interfaces

## Next: [Financial Engineering](./04-financial-engineering.md)
