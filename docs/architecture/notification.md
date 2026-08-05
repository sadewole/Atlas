Perfect. This is actually one of the most important services in the platform, even though many engineers underestimate it.

When people think of notifications, they think:

> "Send an email."

That's not what we're building.

We're building a **Communication Platform**.

Stripe, GitHub, Shopify, Twilio, Slack—they don't just send emails. They publish events to developers and users with **delivery guarantees, retries, observability, replay, and subscriptions**.

That's the standard Atlas should aim for.

---

# Atlas Financial Infrastructure

# Notification & Webhook Platform Specification (NWPS)

Version 1.0

---

# Purpose

The Notification & Webhook Platform is responsible for delivering system events to both humans and machines.

Humans receive:

- Email
- SMS
- Push notifications
- In-app notifications
- Slack (future)
- Microsoft Teams (future)

Machines receive:

- Webhooks
- Event streams
- Event replay
- Delivery receipts

The platform is completely event-driven.

It never initiates business workflows.

It reacts to them.

---

# Design Principles

The platform must provide:

- Reliable delivery
- At-least-once delivery semantics
- Retry policies
- Dead Letter Queues (DLQ)
- Idempotent delivery
- Delivery tracking
- Replay capability
- Provider abstraction
- Template management
- Event subscriptions

---

# High-Level Architecture

```text
             Google Pub/Sub
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
 Notification   Webhook    Event Router
    Worker       Worker
        │           │
        ▼           ▼
Template Engine  Delivery Engine
        │           │
        ▼           ▼
 Email/SMS/Push   Customer Endpoints
```

Notice

The Notification Service

and

Webhook Service

share infrastructure

but remain separate bounded contexts.

---

# Why Separate Notifications and Webhooks?

Notifications target people.

Webhooks target software.

Their guarantees differ.

Notification

↓

Email

↓

Done.

Webhook

↓

Retry

↓

Signature

↓

Replay

↓

Ordering

↓

Developer logs

Much more complex.

---

# Event Sources

Every domain publishes events.

```text
TransferCompleted

PaymentCaptured

WalletFrozen

SettlementCompleted

RefundCreated

MerchantCreated

OrganizationInvited

UserRegistered
```

The Notification Platform never queries business services.

It reacts only to events.

---

# Event Router

Instead of every worker subscribing to every topic,

we introduce an Event Router.

```text
Pub/Sub

↓

Event Router

↓

Notification Queue

↓

Webhook Queue

↓

Analytics

↓

Audit
```

This allows us to apply routing rules without changing downstream workers.

---

# Notification Channels

Supported channels

```text
EMAIL

SMS

PUSH

IN_APP

SLACK

WEBHOOK
```

Future

```text
WHATSAPP

TELEGRAM

VOICE

DISCORD
```

Each channel implements a common delivery interface.

---

# Notification Entity

```typescript
Notification;

id;

eventId;

recipientId;

channel;

templateId;

status;

priority;

scheduledAt;

sentAt;

deliveredAt;

readAt;

retryCount;
```

---

# Notification Lifecycle

```text
CREATED

↓

QUEUED

↓

PROCESSING

↓

SENT

↓

DELIVERED

↓

READ
```

Failure

```text
FAILED

↓

RETRYING

↓

DLQ
```

---

# Template Management

Templates are versioned.

```text
Payment Receipt

v1

↓

v2

↓

v3
```

Old notifications continue using the template version they were created with.

---

# Template Variables

Example

```text
Hello {{firstName}}

Your payment of {{amount}}

Reference

{{reference}}

was successful.
```

Variables validated

before sending.

---

# Multi-language Support

Template

```text
Payment Receipt
```

Available in

```text
English

French

Spanish

Arabic
```

Future

Auto-select

based on

User Preferences.

---

# Notification Providers

Email

```text
SendGrid

Resend

Amazon SES
```

SMS

```text
Twilio

Termii

Africa's Talking
```

Push

```text
Firebase Cloud Messaging

Apple Push Notification Service
```

Again

Provider abstraction.

---

# Priority Queue

Not every notification

has equal priority.

```text
HIGH

MEDIUM

LOW
```

Example

```text
Password Reset

HIGH
```

Marketing

```text
LOW
```

Payment Receipt

```text
MEDIUM
```

Workers consume higher priorities first.

---

# Rate Limiting

Avoid

```text
10,000

emails

at once.
```

Implement

Token Bucket

per provider.

Protects

Providers

and

Atlas.

---

# Notification Preferences

Every user controls

```text
Email

SMS

Push

Marketing

Security

Receipts
```

Example

```text
Payment Receipts

Email

YES

Push

NO
```

Preferences evaluated

before queueing.

---

# Scheduled Notifications

Support

```text
NOW

↓

1 hour later

↓

Tomorrow

↓

Next Week
```

Use

Cloud Tasks

for delayed execution.

---

# Webhook Service

Now

the fun part.

---

# Webhook Registration

Merchants register

```http
POST

/v1/webhooks
```

Payload

```json
{
  "url": "https://merchant.com/webhook",

  "events": ["payment.completed", "refund.created"]
}
```

---

# Webhook Entity

```typescript
WebhookEndpoint;

id;

organizationId;

url;

secret;

status;

subscribedEvents;

createdAt;
```

---

# Webhook Delivery

```text
TransferCompleted

↓

Webhook Queue

↓

Sign Payload

↓

HTTP POST

↓

Merchant

↓

200

↓

Success
```

---

# Delivery Lifecycle

```text
QUEUED

↓

SENDING

↓

DELIVERED
```

Failure

```text
FAILED

↓

RETRYING

↓

DLQ
```

---

# Webhook Signature

Every payload signed.

Header

```http
X-Atlas-Signature
```

Merchant verifies

using

shared secret.

Never trust unsigned callbacks.

---

# Signature Algorithm

We'll use:

```text
HMAC-SHA256
```

Signature input:

```text
timestamp + "." + raw_body
```

Headers:

```http
X-Atlas-Timestamp

X-Atlas-Signature

X-Atlas-Event-ID
```

This protects against tampering and replay attacks.

---

# Replay Protection

Merchant receives

Timestamp

Older than

5 minutes?

Reject.

Prevents replay attacks.

---

# Webhook Retry Policy

Retry

```text
500

502

503

504

Timeout
```

Don't retry

```text
400

401

403

404
```

Configurable

Exponential backoff

with jitter.

---

# Delivery Schedule

Example

```text
Immediate

↓

30 sec

↓

2 min

↓

10 min

↓

30 min

↓

1 hour

↓

6 hours

↓

24 hours

↓

DLQ
```

Every attempt

Stored.

Forever.

---

# Webhook Logs

Merchants should have a dashboard similar to Stripe.

```text
Payment Completed

↓

Delivered

↓

Response

200

↓

Duration

152 ms
```

Or

```text
Failed

↓

500

↓

Retry #3
```

Every request

Searchable.

---

# Replay API

One of my favorite features.

Merchant

Accidentally

Deletes database.

No problem.

```http
POST

/webhooks/{eventId}/replay
```

Atlas

Resends

Original payload.

This is invaluable during integrations and incident recovery.

---

# Event Versioning

Events evolve over time.

We'll version them.

```text
payment.completed.v1

payment.completed.v2
```

Existing subscribers can migrate on their own timeline.

---

# Delivery Guarantees

Notifications

At-least-once.

Webhooks

At-least-once.

Consumers

Must

Handle duplicates.

Every event includes

```text
eventId
```

for idempotency.

---

# Dead Letter Queue

After

Maximum retries

↓

DLQ

Operations

can

Retry

Replay

Cancel

Export

No delivery

ever disappears silently.

---

# Event Catalog

We'll publish a developer-facing event catalog.

Example:

| Event                  | Description                      |
| ---------------------- | -------------------------------- |
| `payment.completed`    | Payment successfully captured.   |
| `payment.failed`       | Payment processing failed.       |
| `transfer.completed`   | Internal transfer completed.     |
| `wallet.frozen`        | Wallet entered the frozen state. |
| `settlement.completed` | Merchant settlement completed.   |
| `refund.completed`     | Refund successfully processed.   |

This becomes part of the public developer documentation.

---

# Observability

Metrics

- Delivery success rate
- Average delivery latency
- Retry count
- DLQ size
- Webhook response latency
- Provider error rate
- Notification throughput

Tracing

A single trace should follow:

```text
TransferCompleted

↓

Notification Created

↓

Email Provider

↓

Delivered
```

or

```text
PaymentCaptured

↓

Webhook Worker

↓

Merchant Endpoint

↓

HTTP 200
```

---

# Security

The platform should support:

- Signed webhooks
- Secret rotation
- TLS enforcement
- IP allowlisting (optional)
- OAuth-protected management APIs
- Audit logs
- Encryption of webhook secrets using Cloud KMS
- Tenant isolation

---

# Database

```text
notification_templates

template_versions

notifications

notification_preferences

notification_deliveries

webhook_endpoints

webhook_events

webhook_deliveries

webhook_delivery_attempts

dead_letter_events
```

Notice the separation between **events**, **deliveries**, and **delivery attempts**. This lets us answer questions like:

- How many endpoints received this event?
- How many attempts were needed?
- What response did each endpoint return?

---

# Why This Architecture?

This platform follows the same philosophy as the rest of Atlas:

- Business services publish facts.
- The communication platform reacts.
- Providers are abstracted behind adapters.
- Delivery is reliable and observable.
- Every action is auditable.
- Developers have the tools to debug integrations without contacting support.

A reliable communication layer is one of the features that differentiates mature developer platforms from simple APIs.

---

# Next: Identity & Access Management (IAM)

We're about to design the security backbone of Atlas.

This will include:

- Organizations and tenants
- Users and teams
- RBAC and ABAC
- OAuth2 and API keys
- JWT authentication
- Service-to-service authentication
- mTLS for internal traffic
- Secrets management
- Audit trails
- Session management
- Impersonation (support tooling)
- SCIM and SSO (future)
- Fine-grained permissions

After IAM, we'll have completed the core platform services. From there, we can move into cross-cutting concerns like observability, infrastructure, CI/CD, disaster recovery, and production operations—the pieces that make Atlas feel like a production-grade financial platform rather than just a collection of microservices.
