# 09 — Testing Strategy

## Testing Philosophy

> **Progressive confidence, not a checkbox.**

Testing in Atlas isn't about reaching a coverage percentage. It's about building confidence at each layer:

```
Unit tests      → "This function works correctly in isolation"
Integration     → "This module works with real infrastructure"
Contract tests  → "This service's API hasn't broken its consumers"
E2E tests       → "The complete business flow works"
Performance     → "This will handle production load"
Chaos tests     → "This degrades gracefully under failure"
```

---

## The Testing Pyramid

```
         /\
        /E2E\          Few: Critical business flows
       /------\
      /Contract\       Some: API compatibility
     /----------\
    /Integration\      More: Infrastructure interaction
   /--------------\
  /  Unit Tests   \    Most: Business logic validation
 /__________________\
```

---

## Unit Testing

### What to Test

**Business logic, not framework code:**

```typescript
// ✅ Test this
describe('Journal', () => {
  it('should reject unbalanced postings', () => {
    const journal = new Journal();
    journal.addPosting(account1, 'DEBIT', new Money(10000, 'NGN'));
    journal.addPosting(account2, 'CREDIT', new Money(9000, 'NGN'));

    expect(() => journal.post()).toThrow(UnbalancedJournalError);
  });

  it('should reject mixed currencies', () => {
    const journal = new Journal();
    journal.addPosting(account1, 'DEBIT', new Money(10000, 'NGN'));
    journal.addPosting(account2, 'CREDIT', new Money(10000, 'USD'));

    expect(() => journal.post()).toThrow(CurrencyMismatchError);
  });
});

// ❌ Don't test framework behavior
// Don't test that NestJS controllers exist
// Don't test that TypeORM saves data
```

### What to Mock

**External dependencies only:**
- HTTP clients (gRPC calls to other services)
- Database connections (repositories)
- Pub/Sub publishers
- Third-party APIs

**Never mock:**
- Domain entities (Journal, Money, Account)
- Value objects
- Business rules/validators

---

## Financial Correctness Tests

These are Atlas's most important tests:

```typescript
describe('Double-Entry Integrity', () => {
  it('total debits must equal total credits after every journal', async () => {
    for (let i = 0; i < 1000; i++) {
      const journal = generateRandomJournal();
      await ledgerService.post(journal);

      const debits = await getTotalDebits();
      const credits = await getTotalCredits();

      expect(debits).toEqual(credits);
    }
  });

  it('balance projections must match ledger entries', async () => {
    const ledgerBalance = await ledgerService.getBalance(accountId);
    const projectionBalance = await projectionService.getBalance(accountId);
    expect(ledgerBalance).toEqual(projectionBalance);
  });

  it('idempotent requests produce the same result', async () => {
    const request = { amount: 10000, key: 'idem_123' };

    const result1 = await transferService.transfer(request);
    const result2 = await transferService.transfer(request);

    expect(result1.transferId).toEqual(result2.transferId);
    expect(await countTransfers()).toEqual(1);
  });
});
```

These test invariants, not specific behaviors.

---

## Integration Testing

### What to Test

**Application code against real infrastructure:**

```typescript
describe('JournalRepository (PostgreSQL)', () => {
  let container: PostgreSqlContainer;
  let repository: JournalRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();
    repository = new PostgresJournalRepository(container.getConnectionUri());
  });

  it('should save and retrieve a journal with postings', async () => {
    const journal = createTestJournal();
    await repository.save(journal);

    const found = await repository.findById(journal.id);
    expect(found.postings).toHaveLength(2);
    expect(found.status).toEqual('POSTED');
  });

  it('should enforce foreign key constraint', async () => {
    const journal = createJournalWithInvalidAccount();
    await expect(repository.save(journal)).rejects.toThrow();
  });
});
```

### Testcontainers

We use Testcontainers to spin up real infrastructure in tests:
- PostgreSQL for repository tests
- Redis for cache/idempotency tests
- Pub/Sub emulator for event tests
- No mocks for infrastructure — real behavior verification

---

## Contract Testing

### Why Contract Tests

```
Payment Service publishes events → Ledger Service consumes
Ledger Service exposes gRPC → Transfer Service calls

If Ledger changes its gRPC signature, Transfer breaks.
Contract tests catch this BEFORE deployment.
```

### OpenAPI Contract Tests

```typescript
describe('Payment API Contract', () => {
  it('POST /v1/payments matches OpenAPI spec', async () => {
    const response = await request(app)
      .post('/v1/payments')
      .send(validPaymentRequest);

    // Validate against OpenAPI spec
    expect(response).toMatchOpenApiSpec('openapi.yaml');
  });
});
```

### Event Contract Tests

```typescript
describe('TransferCompleted Event', () => {
  it('should match the published schema', () => {
    const event = new TransferCompleted(/*...*/);
    expect(event).toMatchEventSchema('transfer.events', 'TransferCompleted', 1);
  });
});
```

---

## End-to-End Testing

### Complete Business Flows

```typescript
describe('Payment → Ledger → Settlement Flow', () => {
  it('should complete the full payment lifecycle', async () => {
    // 1. Create organization and merchant
    const org = await createOrganization();
    const apiKey = await createApiKey(org.id);

    // 2. Create payment intent
    const intent = await api.post('/v1/payment-intents', paymentData, apiKey);
    expect(intent.status).toEqual('AWAITING_PAYMENT');

    // 3. Customer pays (simulated via sandbox provider)
    await api.post(`/v1/payment-intents/${intent.id}/confirm`, {}, apiKey);

    // 4. Wait for completion (poll or webhook)
    const completed = await waitForStatus(intent.id, 'COMPLETED');
    expect(completed.status).toEqual('COMPLETED');

    // 5. Verify ledger entry
    const journal = await getJournalForPayment(intent.id);
    expect(journal.postings).toHaveLength(4); // debit, credit, fee, vat

    // 6. Verify settlement created
    const settlement = await getSettlementForPayment(intent.id);
    expect(settlement.status).toEqual('PENDING');

    // 7. Verify webhook delivered
    const webhookDelivery = await getWebhookDelivery(intent.id);
    expect(webhookDelivery.status).toEqual('DELIVERED');
  });
});
```

---

## Performance Testing

### k6 Load Testing

```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '3m', target: 500 },   // Steady state
    { duration: '1m', target: 0 },     // Ramp down
  ],
};

export default function () {
  const payload = JSON.stringify({
    amount: 100000,
    currency: 'NGN',
    paymentMethod: 'WALLET',
  });

  const response = http.post(
    'https://api.atlas.dev/v1/payment-intents',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${__ENV.API_KEY}`,
        'Idempotency-Key': `${__VU}-${__ITER}`,
      },
    }
  );

  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 500ms': (r) => r.timing.duration < 500,
  });
}
```

---

## Test Data Management

### Principles

1. **Never use production data in tests**
2. **Fixtures are deterministic** (same input → same output)
3. **Synthetic data** (generated, realistic, not real people)

### Test Fixtures

```typescript
const testOrganization = {
  id: 'org_test_001',
  name: 'Test Merchant',
  country: 'NG',
  defaultCurrency: 'NGN',
};

const testWallet = {
  id: 'wlt_test_001',
  ownerId: 'org_test_001',
  currency: 'NGN',
  balance: 1000000, // ₦10,000.00
  version: 1,
};
```

---

## CI Quality Gates

| Gate | When | Blocks Merge? |
|------|------|---------------|
| Lint | Every commit | Yes |
| Type check | Every commit | Yes |
| Unit tests | Every commit | Yes |
| Integration tests | PR → main | Yes |
| Contract tests | PR → main | Yes |
| Security scan | PR → main | Yes |
| Load tests | Nightly | No (alert only) |
| Chaos tests | Nightly/weekly | No (alert only) |

---

## Flaky Test Policy

Flaky tests erode trust in the pipeline. Our policy:

1. **Detect** — Track failure rate per test
2. **Investigate** — Every flaky test gets a bug ticket
3. **Quarantine** — If investigation can't be immediate, move to quarantine suite (not in merge path)
4. **Fix** — Root cause analysis; no permanent quarantine
5. **Document** — What caused it and what fixed it

---

## Key Takeaways

1. **Test behavior, not implementation.** Don't test that a controller calls a service. Test that a payment intent is created.
2. **Financial correctness tests are unique.** Debits == credits, idempotency, projection consistency.
3. **Testcontainers over mocks for infrastructure.** Real PostgreSQL, real Redis, real Pub/Sub emulator.
4. **Contract tests catch integration breakage.** Before deployment, not after.
5. **E2E tests validate complete business flows.** Payment → Ledger → Settlement → Webhook.
6. **Performance is tested with realistic workloads.** Not just unit benchmarks.
7. **Flaky tests are bugs.** Investigate and fix, don't ignore.

## Next: [Production Operations](./10-production-operations.md)
