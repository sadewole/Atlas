Excellent.

This document is one of the most overlooked parts of backend architecture.

Most teams eventually end up with APIs that look like they were designed by different companies.

One service returns:

```json
{
  "success": true
}
```

Another returns:

```json
{
  "status": "ok"
}
```

Another returns:

```json
{
  "data": ...
}
```

One paginates with `page`.

Another uses `offset`.

Another uses `cursor`.

One uses UUIDs.

Another uses integers.

After two years, nobody knows what the standards are.

Atlas won't have that problem.

This document becomes the **constitution** for every API built in the platform.

---

# Atlas Financial Infrastructure

# API Standards & Engineering Guidelines (ASEG)

**Version 1.0**

---

# Purpose

The API Standards define how every service exposes functionality to internal services, external clients, partners, and SDKs.

The goals are:

- Consistency
- Predictability
- Backward compatibility
- Excellent developer experience
- Secure communication
- Long-term maintainability

Every API—REST, gRPC, Webhook, or Event—must follow these standards.

---

# Design Principles

Atlas APIs should be:

- Resource-oriented
- Explicit
- Versioned
- Idempotent where appropriate
- Backward compatible
- Self-documenting
- Observable
- Secure by default

---

# API Categories

Atlas exposes four kinds of APIs.

```text
External REST APIs

↓

Internal gRPC APIs

↓

Webhooks

↓

Event Streams (Pub/Sub)
```

Each serves a different purpose.

| API Type | Purpose                                   |
| -------- | ----------------------------------------- |
| REST     | Public APIs for merchants and clients     |
| gRPC     | Internal service-to-service communication |
| Webhooks | Outbound event notifications              |
| Events   | Asynchronous platform communication       |

---

# REST API Standards

## Resource-Oriented URLs

Good

```http
GET /v1/payments

GET /v1/payments/{paymentId}

POST /v1/payments

DELETE /v1/api-keys/{id}
```

Bad

```http
POST /createPayment

GET /getPayments

POST /deleteUser
```

URLs represent resources, not actions.

---

# HTTP Methods

| Method | Usage                                     |
| ------ | ----------------------------------------- |
| GET    | Read                                      |
| POST   | Create or execute a non-idempotent action |
| PUT    | Full replacement                          |
| PATCH  | Partial update                            |
| DELETE | Remove or deactivate                      |

Use the semantics consistently.

---

# Naming Convention

Resources use:

- lowercase
- kebab-case
- plural nouns

Examples

```text
payment-intents

wallets

ledger-accounts

api-keys

webhook-endpoints
```

Avoid verbs in resource names.

---

# Versioning

Public APIs are versioned in the URL.

```http
/v1/payments

/v2/payments
```

Internal gRPC APIs use protobuf versioning rather than URL prefixes.

---

# Backward Compatibility

Minor releases must not break existing clients.

Breaking changes require:

- New API version
- Migration guide
- Deprecation period
- Sunset announcement

Clients should have sufficient time to migrate.

---

# Request IDs

Every request includes:

```http
X-Request-ID
```

Generated if absent.

Used for:

- Support
- Logging
- Incident analysis

---

# Correlation IDs

Every request also carries:

```http
X-Correlation-ID
```

This value propagates across every downstream service and asynchronous workflow.

---

# Authentication

External APIs:

```text
Bearer Token
```

Service-to-service:

```text
IAM Identity

+

Short-lived Service Tokens
```

API keys are reserved for integrations that do not support OAuth-style authentication.

---

# Idempotency

Financial operations must be idempotent.

Examples:

```http
POST /payments

Idempotency-Key:
```

If a client retries the same request with the same key, Atlas returns the original result instead of creating duplicate financial operations.

---

# Idempotency Storage

We'll use Redis for fast lookups and PostgreSQL for durable guarantees where necessary.

Flow:

```text
Client

↓

API Gateway

↓

Idempotency Middleware

↓

Business Logic
```

Keys should expire after a configurable retention period unless regulations require longer storage.

---

# Pagination

Atlas standardizes on **cursor-based pagination**.

Example:

```http
GET /payments?limit=50&cursor=abc123
```

Response:

```json
{
  "data": [],
  "page": {
    "nextCursor": "def456",
    "hasMore": true
  }
}
```

Offset pagination is allowed only for small administrative datasets.

---

# Filtering

Use query parameters.

Example:

```http
GET /payments

?status=completed

&currency=NGN

&merchantId=...

&createdAfter=...

&createdBefore=...
```

Filtering syntax should remain consistent across services.

---

# Sorting

Standard format:

```http
?sort=-createdAt
```

Meaning:

Descending by `createdAt`.

Examples:

```http
?sort=amount

?sort=-amount
```

Support multiple sort fields only when justified.

---

# Sparse Field Selection (Future)

Clients may request only needed fields.

Example:

```http
GET /payments

?fields=id,status,amount
```

Useful for bandwidth-sensitive clients.

---

# Standard Response Format

Successful response:

```json
{
  "data": {
    "id": "...",
    "status": "completed"
  },
  "meta": {
    "requestId": "...",
    "timestamp": "2026-07-31T14:20:00Z"
  }
}
```

Collections:

```json
{
  "data": [],
  "page": {
    "nextCursor": "...",
    "hasMore": true
  },
  "meta": {
    "requestId": "..."
  }
}
```

---

# Error Format

Every service returns the same structure.

```json
{
  "error": {
    "code": "PAYMENT_ALREADY_CAPTURED",
    "message": "Payment has already been captured.",
    "details": [],
    "requestId": "...",
    "correlationId": "..."
  }
}
```

Never return raw stack traces or database errors.

---

# Error Codes

Every domain owns its namespace.

Examples:

```text
PAYMENT_*

LEDGER_*

WALLET_*

TRANSFER_*

AUTH_*

SETTLEMENT_*
```

Error codes should be stable even if messages change.

---

# HTTP Status Codes

Use standard semantics.

| Status | Meaning                              |
| ------ | ------------------------------------ |
| 200    | Success                              |
| 201    | Resource created                     |
| 202    | Accepted for asynchronous processing |
| 204    | No content                           |
| 400    | Validation failure                   |
| 401    | Authentication required              |
| 403    | Forbidden                            |
| 404    | Resource not found                   |
| 409    | Conflict or duplicate operation      |
| 422    | Business rule violation              |
| 429    | Rate limit exceeded                  |
| 500    | Internal server error                |
| 503    | Service unavailable                  |

Avoid inventing custom status codes.

---

# Validation Errors

Example:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "amount",
        "reason": "Must be greater than zero."
      }
    ]
  }
}
```

Clients should be able to present validation errors directly to users.

---

# Asynchronous Operations

Long-running work returns:

```http
202 Accepted
```

Example:

```text
Create Settlement

↓

Accepted

↓

Background Processing

↓

Webhook/Event

↓

Completed
```

Don't keep HTTP connections open for operations that may take minutes.

---

# Rate Limiting

Applied at the API Gateway.

Headers:

```http
X-RateLimit-Limit

X-RateLimit-Remaining

Retry-After
```

Limits may vary by:

- Merchant plan
- Endpoint
- Authentication method

---

# API Documentation

Every endpoint includes:

- Description
- Request schema
- Response schema
- Error codes
- Authentication
- Rate limits
- Examples

Documentation is generated from OpenAPI specifications.

---

# OpenAPI

Every REST service publishes:

```text
openapi.yaml
```

Generated automatically during CI.

The specification is the source of truth for SDK generation.

---

# SDK Generation

Supported SDKs:

- TypeScript
- Go
- Java
- Python
- Kotlin (future)

SDKs are generated from OpenAPI rather than maintained manually.

---

# gRPC Standards

Internal communication uses Protocol Buffers.

Structure:

```text
payment.v1

wallet.v1

ledger.v1

transfer.v1
```

Avoid breaking protobuf field numbering.

---

# gRPC Error Handling

Use canonical gRPC status codes.

Examples:

- INVALID_ARGUMENT
- NOT_FOUND
- ALREADY_EXISTS
- PERMISSION_DENIED
- FAILED_PRECONDITION
- INTERNAL
- UNAVAILABLE

Map these consistently to REST equivalents where appropriate.

---

# Time Standards

All timestamps:

- UTC
- ISO 8601
- RFC 3339 compatible

Example:

```text
2026-07-31T14:20:00Z
```

Never expose local server time.

---

# Money Representation

Money is **never** stored or transmitted as floating-point values.

Example:

```json
{
  "amount": 125000,
  "currency": "NGN"
}
```

`125000` represents ₦1,250.00 when using the minor unit (kobo).

This matches the Ledger specification and prevents rounding errors.

---

# UUID Standards

Every externally visible resource uses UUIDv7.

Benefits:

- Globally unique
- Time-ordered
- Better database locality than random UUIDs

Internal surrogate keys may still exist where beneficial.

---

# Webhook Standards

Every webhook includes:

- Event ID
- Event type
- Timestamp
- Signature
- API version
- Payload

Headers:

```text
X-Atlas-Signature

X-Atlas-Event

X-Atlas-Timestamp
```

Webhook payloads are immutable after publication.

---

# Deprecation Policy

Deprecating an endpoint requires:

1. Documentation update.
2. Deprecation header.
3. Migration guide.
4. Sunset date.
5. Removal only after the published notice period.

Unexpected removals are not acceptable.

---

# API Evolution

Preferred order:

1. Add optional fields.
2. Add new endpoints.
3. Introduce new API versions only for breaking changes.

Avoid unnecessary version proliferation.

---

# Engineering Checklist

Every API must have:

- OpenAPI specification
- Authentication
- Authorization
- Validation
- Idempotency (where applicable)
- Rate limiting
- Structured errors
- Correlation IDs
- Metrics
- Tracing
- Tests
- Documentation

This becomes part of the Definition of Done.

---

# Why This Architecture?

API consistency reduces cognitive load for both developers and consumers.

When every service follows the same conventions:

- Client SDKs are easier to generate.
- Integrations are easier to build.
- Monitoring becomes more consistent.
- Support teams can troubleshoot faster.
- Engineers can move between services without relearning conventions.

For a platform like Atlas, APIs are one of the primary products. Treating them as first-class engineering assets is just as important as writing reliable business logic.

---

# Next: Testing Strategy & Quality Engineering

The next document defines how Atlas proves that every service is correct before it reaches production.

We'll cover:

- Testing pyramid
- Unit testing
- Integration testing
- Contract testing
- End-to-end testing
- Performance and load testing
- Chaos testing
- Test containers
- Test data management
- Database testing
- CDC and event testing
- CI quality gates
- Coverage expectations
- Release confidence

This is where we establish that reliability isn't assumed—it's continuously verified.
