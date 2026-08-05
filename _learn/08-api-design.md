# 08 — API Design

## API Categories

Atlas exposes four kinds of APIs:

| Type | Audience | Protocol | Purpose |
|------|----------|----------|---------|
| REST | External (merchants, SDKs) | HTTP/JSON | Business operations |
| gRPC | Internal (services) | Protobuf | Service-to-service |
| Webhooks | External (merchants) | HTTP POST | Event notifications |
| Events | Internal (services) | Pub/Sub | Async platform communication |

---

## REST API Conventions

### URL Design

```
Resource-oriented, not action-oriented:

✓ GET    /v1/payments                    # List payments
✓ GET    /v1/payments/{id}               # Get payment
✓ POST   /v1/payments                    # Create payment
✓ POST   /v1/payments/{id}/capture       # Action on resource
✓ POST   /v1/refunds                     # Create refund

✗ POST   /createPayment
✗ GET    /getPayments
✗ POST   /deletePayment
```

### Standard Response

```json
{
  "data": {
    "id": "pi_abc123",
    "amount": 125000,
    "currency": "NGN",
    "status": "completed",
    "createdAt": "2026-07-30T12:00:00Z"
  },
  "meta": {
    "requestId": "req_xyz",
    "timestamp": "2026-07-30T12:00:05Z"
  }
}
```

### Collections with Pagination

```json
{
  "data": [{ ... }, { ... }],
  "page": {
    "nextCursor": "eyJsYXN0SWQiOiJwaV8xMjMi...",
    "hasMore": true
  },
  "meta": {
    "requestId": "req_xyz"
  }
}
```

**Cursor-based pagination** (not offset-based). Why? Cursors are stable when data changes. Offset pagination skips or duplicates rows when items are added/removed during pagination.

### Error Format

```json
{
  "error": {
    "code": "PAYMENT_ALREADY_CAPTURED",
    "message": "This payment has already been captured.",
    "details": [
      {
        "field": "paymentId",
        "reason": "Payment pi_abc123 is in status: captured"
      }
    ],
    "requestId": "req_xyz",
    "correlationId": "corr_abc"
  }
}
```

Error codes are domain-prefixed:
```
PAYMENT_NOT_FOUND
LEDGER_UNBALANCED
WALLET_FROZEN
TRANSFER_INSUFFICIENT_FUNDS
AUTH_INVALID_TOKEN
SETTLEMENT_ALREADY_PROCESSED
```

### Status Codes

| Code | When |
|------|------|
| 200 | Success |
| 201 | Resource created |
| 202 | Accepted (async processing) |
| 400 | Validation failure |
| 401 | No authentication |
| 403 | No authorization |
| 404 | Resource not found |
| 409 | Conflict (duplicate, idempotency replay) |
| 422 | Business rule violation |
| 429 | Rate limited |
| 500 | Internal error (never expose details) |
| 503 | Service unavailable |

---

## Idempotency

### How It Works

```
Client: POST /v1/payments
        Idempotency-Key: key_abc123

Server (first request):
  1. Check Redis: key_abc123 → not found
  2. Process payment
  3. Store in Redis: key_abc123 → { response }
  4. Return 201 with payment

Server (retry with same key):
  1. Check Redis: key_abc123 → found
  2. Return 200 with original response (same payment)
```

### Which Endpoints Need It

Any write endpoint that creates a resource or changes state:
- `POST /v1/payments`
- `POST /v1/transfers`
- `POST /v1/refunds`
- `POST /v1/settlements`
- `POST /v1/wallets/{id}/freeze`

GET endpoints are naturally idempotent — they don't change state.

---

## API Versioning

### URL-Based (REST)

```
/v1/payments   → Current version
/v2/payments   → Breaking changes
```

### Deprecation Policy

1. Announce deprecation (documentation + response headers)
2. Support old version for migration period (e.g., 6 months)
3. Monitor usage of old version
4. Remove old version after migration period

### Breaking vs Non-Breaking Changes

**Safe (non-breaking):**
- Adding new optional fields to responses
- Adding new endpoints
- Adding new optional query parameters
- Adding new error codes

**Breaking (requires new version):**
- Removing or renaming fields
- Changing field types
- Changing URL structure
- Changing authentication requirements

---

## Money Representation

```
{
  "amount": 125000,
  "currency": "NGN"
}
```

`125000` = ₦1,250.00 (minor unit: kobo)

**Rules:**
- Always integers
- Always include currency
- Never use floating-point
- Never include currency symbols in the amount field

---

## gRPC Standards

### Service Definition

```protobuf
service LedgerService {
  rpc PostJournal(PostJournalRequest) returns (PostJournalResponse);
  rpc GetAccountBalance(GetAccountBalanceRequest) returns (AccountBalanceResponse);
  rpc ReplayLedger(ReplayLedgerRequest) returns (stream ReplayEvent);
}
```

### Package Versioning

```
payment.v1.LedgerService
payment.v2.LedgerService    # Breaking changes
```

### Error Mapping

| gRPC Status | HTTP Status |
|-------------|-------------|
| INVALID_ARGUMENT | 400 |
| NOT_FOUND | 404 |
| ALREADY_EXISTS | 409 |
| PERMISSION_DENIED | 403 |
| UNAUTHENTICATED | 401 |
| FAILED_PRECONDITION | 422 |
| INTERNAL | 500 |
| UNAVAILABLE | 503 |

---

## Webhook Standards

### Payload Format

```json
{
  "eventId": "evt_abc123",
  "eventType": "payment.completed",
  "apiVersion": "2026-07-30",
  "createdAt": "2026-07-30T12:00:00Z",
  "data": {
    "paymentId": "pi_xyz",
    "amount": 125000,
    "currency": "NGN"
  }
}
```

### Signature Verification

```
Headers:
  X-Atlas-Signature: t=1234567890,v1=abc123...
  X-Atlas-Event-ID: evt_abc123
  X-Atlas-Timestamp: 1234567890

Signature = HMAC-SHA256(webhookSecret, timestamp + "." + rawBody)
```

Merchants verify signatures to ensure:
1. The webhook came from Atlas (not an attacker)
2. The payload hasn't been modified
3. The webhook isn't a replay (timestamp check)

---

## Formatting Standards

### Timestamps

Always UTC, ISO 8601, RFC 3339:
```
"2026-07-30T12:00:00Z"
"2026-07-30T12:00:00.000Z"
```

### IDs

UUIDv7 for external resources:
```
"pi_01J5EXAMPLE0000000000000001"
```

### Names

kebab-case for URLs, camelCase for JSON:
```
URL: /payment-intents
JSON: { "paymentIntentId": "..." }
```

### Currency Codes

ISO 4217: `NGN`, `USD`, `EUR`, `GBP`

---

## API Documentation

Every service generates OpenAPI 3.0 from code annotations:

```typescript
@ApiOperation({ summary: 'Create a payment intent' })
@ApiResponse({ status: 201, type: PaymentIntentResponse })
@ApiResponse({ status: 400, type: ErrorResponse })
@Post('/v1/payment-intents')
async create(@Body() dto: CreatePaymentIntentDto) { ... }
```

Generated docs include:
- Endpoint descriptions
- Request/response schemas
- Authentication requirements
- Error codes
- Rate limits
- Example requests and responses

SDKs are generated from the OpenAPI spec, not written by hand.

---

## Key Takeaways

1. **APIs are a product.** Consistency matters as much as correctness.
2. **Cursor-based pagination.** Stable, efficient, predictable.
3. **Error codes are domain-prefixed.** Never expose raw database/internal errors.
4. **Idempotency keys on every write.** Retries are safe by design.
5. **Money is always { amount: int, currency: string }.** No floats. No exceptions.
6. **Webhooks are signed.** Merchants can verify authenticity.
7. **SDKs are generated.** Manual SDKs drift; generated ones stay in sync.
8. **Versioning is intentional.** Breaking changes require a new API version with a migration period.

## Next: [Testing Strategy](./09-testing-strategy.md)
