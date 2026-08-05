I think this is where Atlas starts becoming a real product instead of just financial infrastructure.

Until now, everything has been **internal financial operations**.

The **Payment Service** is the first service that external developers actually build against.

It's the Stripe-like API.

---

# Atlas Financial Infrastructure

# Payment Service Specification (PSS)

Version 1.0

---

# Purpose

The Payment Service provides APIs that allow merchants to collect, manage, and track payments.

It abstracts away the complexity of wallets, ledgers, transfers, and settlements behind a simple developer experience.

A merchant should be able to write:

```http
POST /v1/payment-intents
```

instead of orchestrating five different backend services.

---

# Responsibilities

The Payment Service owns:

- Payment Intents
- Checkout Sessions
- Payment Links
- Payment Methods
- Merchant Configuration
- Payment Lifecycle
- Payment Expiration
- Payment Confirmation

It **does not**:

- Update balances
- Create ledger entries
- Move money directly
- Calculate settlements

Those remain responsibilities of the financial core.

---

# Payment Flow

Think about how Stripe works.

You don't immediately charge a card.

You create an **intent**.

Atlas follows the same concept.

```text
Merchant

↓

Create Payment Intent

↓

Customer Pays

↓

Transfer Service

↓

Ledger

↓

Settlement

↓

Completed
```

---

# Payment Intent

A Payment Intent represents the intention to collect money.

It exists before money moves.

---

Entity

```typescript
PaymentIntent;

id;

merchantId;

customerId;

amount;

currency;

status;

paymentMethod;

description;

metadata;

expiresAt;

createdAt;

updatedAt;
```

---

# Why Payment Intents?

Without intents

```text
Customer clicks Pay

↓

Money moves immediately
```

Problems

- User closes browser
- Card declines
- Timeout
- Authentication required
- Retry impossible

Payment Intent separates

**business intent**

from

**financial execution**

---

# Payment Intent Lifecycle

```text
             CREATED
                 │
                 ▼
        AWAITING_PAYMENT
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
PROCESSING   EXPIRED   CANCELLED
      │
      ▼
AUTHORIZED
      │
      ▼
CAPTURED
      │
      ▼
SETTLING
      │
      ▼
COMPLETED
```

---

# Why Authorization?

Some businesses don't capture immediately.

Example

Hotel

```text
Reserve room

↓

Authorize card

↓

Capture

↓

Customer checks out
```

Same with

- fuel stations
- car rentals
- subscriptions

Atlas should support this from the beginning.

---

# Payment Methods

We'll make payment methods extensible.

```text
WALLET

BANK_ACCOUNT

CARD

BANK_TRANSFER

QR

USSD

MOBILE_MONEY

APPLE_PAY

GOOGLE_PAY

CRYPTO (future)
```

The payment orchestration shouldn't care which provider eventually executes the payment.

---

# Payment Provider Abstraction

Instead of embedding provider logic inside the Payment Service, define a common interface.

```typescript
interface PaymentProvider {
  authorize(request);

  capture(request);

  refund(request);

  void(request);

  verify(request);
}
```

Implementations

```text
Paystack

Flutterwave

Stripe

Monnify

Sandbox Provider
```

Future providers plug in without changing the orchestration logic.

---

# Checkout Session

Most merchants don't want to build payment UI.

Atlas provides hosted checkout.

```text
Merchant

↓

Create Checkout

↓

Receive URL

↓

Redirect Customer

↓

Payment

↓

Return URL
```

---

Checkout Entity

```typescript
CheckoutSession;

id;

paymentIntentId;

status;

url;

successUrl;

cancelUrl;

expiresAt;
```

---

# Payment Links

Merchants can generate

```text
https://pay.atlas.dev/pay/abc123
```

Useful for

- invoices
- WhatsApp sales
- Instagram businesses
- freelancers

---

# Merchant Configuration

Every merchant defines

```text
Supported Currencies

Settlement Schedule

Webhook URL

Branding

Fee Model

Allowed Payment Methods

Risk Settings
```

No hardcoded behavior.

Everything configurable.

---

# Processing Flow

Example

Customer pays

₦20,000

```text
Checkout

↓

Payment Intent

↓

Authorize

↓

Transfer Service

↓

Ledger

↓

Settlement

↓

Webhook

↓

Completed
```

Notice

Payment delegates financial movement.

---

# Payment States

```text
CREATED

AWAITING_PAYMENT

PROCESSING

AUTHORIZED

CAPTURED

FAILED

EXPIRED

CANCELLED

REFUNDED

COMPLETED
```

State transitions should be explicit and validated to prevent invalid jumps (for example, a cancelled payment cannot later become captured).

---

# Refunds

Refunds should never modify the original payment.

Instead

Create

```text
Refund
```

Entity

```typescript
Refund;

id;

paymentId;

amount;

reason;

status;

createdAt;
```

Refund triggers

Transfer

↓

Ledger

↓

Reversal

↓

Settlement

Everything stays auditable.

---

# Partial Refunds

Support

Payment

₦20,000

Refund

₦5,000

Remaining

₦15,000

Track

```text
RefundedAmount
```

instead of

Boolean

```text
isRefunded
```

This supports multiple partial refunds while preventing over-refunding.

---

# Payment APIs

Create Intent

```http
POST /v1/payment-intents
```

Retrieve Intent

```http
GET /v1/payment-intents/{id}
```

Confirm Payment

```http
POST /v1/payment-intents/{id}/confirm
```

Cancel Payment

```http
POST /v1/payment-intents/{id}/cancel
```

Capture Payment

```http
POST /v1/payment-intents/{id}/capture
```

Create Refund

```http
POST /v1/refunds
```

---

# Events

Published

```text
PaymentIntentCreated

PaymentAuthorized

PaymentCaptured

PaymentFailed

PaymentExpired

PaymentCancelled

RefundCreated

RefundCompleted
```

Subscribers

Transfer

Settlement

Notification

Analytics

Webhook

Audit

---

# Expiration

Every payment intent

Has TTL.

Default

```text
30 minutes
```

Expired intents

```text
Scheduler

↓

PaymentExpired

↓

Notification

↓

Cleanup
```

We'll use Cloud Scheduler to trigger expiration jobs and Cloud Tasks where delayed execution is beneficial.

---

# Idempotency

Merchant retries

```http
POST /payment-intents
```

Same key

↓

Return

Same intent.

No duplicates.

---

# Security

Merchant APIs require

- OAuth2 or API keys
- Request signatures (optional for server-to-server)
- Rate limiting
- IP allowlists (optional)
- Replay protection
- Audit logs

Sensitive operations (refunds, captures) should require appropriate scopes and permissions.

---

# Multi-Tenancy

Every payment belongs to an organization.

```text
Organization

↓

Merchant

↓

Payment Intent

↓

Checkout

↓

Settlement
```

Every database query must be scoped by tenant to prevent cross-customer access.

---

# Payment Provider Layer

A key architectural decision is to keep provider-specific integrations isolated.

```text
                 Payment Service
                        │
      ┌─────────────────┼─────────────────┐
      ▼                 ▼                 ▼
 Paystack Adapter  Stripe Adapter  Sandbox Adapter
      │                 │                 │
      ▼                 ▼                 ▼
 Provider APIs     Provider APIs     Fake Gateway
```

The Sandbox Adapter is especially valuable because it lets developers test the entire Atlas platform without relying on external payment providers.

---

# Failure Scenarios

| Scenario                                           | Outcome                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| Customer closes browser                            | Payment Intent remains awaiting payment until expiration. |
| Provider authorization times out                   | Retry according to provider policy; maintain idempotency. |
| Payment captured but webhook fails                 | Retry webhook delivery independently.                     |
| Refund request exceeds remaining refundable amount | Reject with validation error.                             |
| Duplicate confirmation request                     | Return current payment state.                             |

---

# Future Capabilities

The Payment Service is designed to grow without major architectural changes.

Future enhancements could include:

- Recurring billing and subscriptions
- Installment payments
- Split payments and marketplace payouts
- Multi-currency checkout
- Smart payment routing across providers
- Tokenized payment methods
- 3-D Secure authentication flows
- Provider health monitoring and automatic failover
- Dynamic fee calculation
- Risk-based payment authentication

Notice that none of these require changing the Ledger Service. That's intentional—the financial core remains stable while the payment experience evolves.

---

# Next: Settlement Service Specification (SSS)

If the Payment Service is responsible for collecting money, the **Settlement Service** is responsible for distributing it correctly.

We'll cover:

- Settlement windows
- Merchant payout schedules
- Net settlement calculations
- Fees and commissions
- Batch processing
- Bank payout files
- Settlement reconciliation
- Failed payouts
- Retry policies
- Multi-party marketplace settlements
- Daily closing and financial reporting

This service is where Atlas transitions from recording financial events to ensuring money reaches the correct external destinations in a controlled, auditable manner.
