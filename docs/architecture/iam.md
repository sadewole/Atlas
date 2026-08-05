This is arguably the **second most important service** in Atlas after the Ledger.

Why?

Because every single request passes through it.

Every API.

Every gRPC call.

Every dashboard.

Every admin action.

Every webhook.

Every internal service.

A weak IAM architecture can compromise the entire platform, regardless of how good the financial services are.

---

# Atlas Financial Infrastructure

# Identity & Access Management (IAM) Specification

Version 1.0

---

# Purpose

The IAM platform provides authentication, authorization, identity management, tenant isolation, and security controls across Atlas.

It is responsible for:

- Users
- Organizations
- Teams
- Roles
- Permissions
- Authentication
- Authorization
- API Keys
- OAuth
- Sessions
- Service Identity
- Audit Logs

It never owns business logic.

---

# Design Principles

The IAM platform must provide:

- Zero Trust
- Least Privilege
- Tenant Isolation
- Fine-Grained Authorization
- Auditable Access
- Secure-by-Default APIs
- Delegated Authentication
- Short-Lived Credentials

---

# High-Level Architecture

```text
                  Clients

        Web   Mobile   CLI   SDK

                 │

                 ▼

          API Gateway

                 │

                 ▼

             IAM Service

      ┌─────────┼─────────┐

      ▼         ▼         ▼

 Authentication RBAC    API Keys

      ▼         ▼         ▼

   Session    Permission   Audit

      ▼

 Secret Manager
```

---

# Multi-Tenant Architecture

Atlas is built as a multi-tenant platform.

Everything belongs to an organization.

```text
Organization

↓

Project

↓

Users

↓

Wallets

↓

Payments

↓

Transfers

↓

Settlements
```

Nothing exists without a tenant.

---

# Organization Entity

```typescript
Organization;

id;

name;

slug;

status;

country;

defaultCurrency;

timezone;

settings;

createdAt;
```

---

# User Entity

```typescript
User;

id;

organizationId;

email;

firstName;

lastName;

status;

emailVerified;

mfaEnabled;

createdAt;
```

Users never exist outside an organization (for the MVP). Future versions can support multi-organization memberships.

---

# Team Entity

Organizations may contain teams.

```text
Organization

↓

Engineering

Finance

Operations

Support

Compliance
```

Permissions can be granted to teams rather than individual users.

---

# Authentication

Supported methods

```text
Email + Password

Magic Link

Google OAuth

GitHub OAuth

Microsoft OAuth

API Key

JWT

Service Account
```

Future

```text
SAML

OIDC

SCIM

Passkeys (WebAuthn)
```

---

# Password Security

Passwords

Never

Stored.

Only

```text
Argon2id Hash
```

Never

SHA256

Never

MD5

Never

Encrypt passwords.

Hash them.

---

# Session Management

After login

User receives

```text
Access Token

+

Refresh Token
```

Access Token

15 minutes

Refresh Token

30 days

Configurable by organization policy.

---

# JWT Claims

```json
{
  "sub": "user_id",
  "org": "organization_id",
  "roles": ["finance.admin"],
  "permissions": ["payments.create"],
  "sessionId": "...",
  "exp": 123456789
}
```

Keep tokens compact. Avoid embedding excessive authorization data.

---

# OAuth2

Atlas should expose OAuth2 for third-party developers.

Flow

```text
Developer

↓

Authorize

↓

Consent

↓

Authorization Code

↓

Access Token
```

Scopes

```text
payments.read

payments.write

wallets.read

settlements.read

webhooks.write
```

---

# API Keys

Merchants can create

```text
Live Key

Test Key
```

Example

```text
atlas_live_xxxxxxxxx

atlas_test_xxxxxxxxx
```

Keys are displayed once and stored only as secure hashes.

---

# API Key Lifecycle

```text
CREATED

↓

ACTIVE

↓

ROTATED

↓

REVOKED
```

Rotation should not require application downtime.

---

# Service Accounts

Internal services

Never

Use user tokens.

Instead

```text
Transfer Service

↓

Service Account

↓

IAM

↓

Short-lived JWT

↓

Ledger Service
```

---

# Service-to-Service Authentication

Internal communication

Uses

- mTLS
- Service Identity
- JWT
- Audience validation

Every service knows

Who

Called it.

---

# Authorization

Authentication answers

```text
Who are you?
```

Authorization answers

```text
What can you do?
```

Keep them separate.

---

# RBAC

We'll implement Role-Based Access Control.

Example

```text
Finance Admin

↓

Refund

Settlement

Reports
```

Support Agent

```text
Read

Payments

Customers
```

No Refund.

---

# Permission Model

Permission naming convention

```text
resource.action
```

Examples

```text
payments.create

payments.read

payments.refund

wallet.freeze

wallet.read

settlements.retry

webhooks.manage

users.invite

organizations.update
```

Simple.

Predictable.

---

# ABAC

RBAC is sufficient initially.

Later

Add

Attribute-Based Access Control.

Example

```text
Country == Nigeria

AND

Amount < ₦500,000

Allow
```

or

```text
Department == Finance
```

RBAC

-

ABAC

Very powerful.

---

# Policy Engine

Rather than scattering permission checks throughout services, introduce a centralized authorization library.

```text
API

↓

Authorize()

↓

Policy Engine

↓

Allow / Deny
```

Future versions could integrate with Open Policy Agent (OPA) or Google's Zanzibar-inspired authorization models if requirements become more complex.

---

# Resource Ownership

Some resources require ownership checks.

Example

Customer

Can only see

Own

Payments.

Merchant

Can only manage

Own

Organization.

Authorization combines

Role

-

Ownership.

---

# Impersonation

Support tooling sometimes needs temporary access.

Example

Support Engineer

↓

Impersonate Merchant

↓

Investigate

↓

Exit

Every impersonation

Requires

Audit Log.

Visible

To customer.

---

# MFA

Supported methods

```text
Authenticator App (TOTP)

SMS (optional)

Email OTP (low assurance)

Passkeys (future)
```

Administrative accounts should require MFA by policy.

---

# Device Management

Track trusted devices.

```text
MacBook Pro

Chrome

Lagos

Last Seen
```

Users can revoke sessions from specific devices.

---

# Audit Logs

Every security event

Stored.

Examples

```text
Login

Logout

Password Change

API Key Created

Role Changed

Permission Granted

Webhook Secret Rotated

Settlement Approved
```

Immutable.

---

# Secrets

Never

Database.

Never

Git.

Google

Secret Manager.

Rotated

Automatically.

---

# Key Rotation

Support

```text
Current Key

↓

New Key

↓

Grace Period

↓

Old Key Removed
```

No downtime.

---

# Rate Limiting

Different limits

For

Anonymous

Authenticated

Internal Services

Admin APIs

Webhook APIs

API Keys

Implemented at the API Gateway using Redis-backed counters.

---

# Login Protection

Prevent

Credential Stuffing

Brute Force

Password Spraying

Implement

- Progressive delays
- Temporary account lockouts
- CAPTCHA after repeated failures
- IP reputation integration (future)

---

# Organization Isolation

Every query

Must include

```text
organizationId
```

Example

Bad

```sql
SELECT *

FROM payments
```

Good

```sql
SELECT *

FROM payments

WHERE

organization_id = ?
```

Defense-in-depth means validating tenant context at multiple layers, not just the application.

---

# Database

```text
organizations

users

teams

memberships

roles

permissions

role_permissions

user_roles

api_keys

oauth_clients

oauth_tokens

sessions

service_accounts

audit_logs

mfa_devices
```

---

# Events

Published

```text
UserCreated

UserInvited

UserActivated

UserSuspended

RoleAssigned

ApiKeyCreated

ApiKeyRevoked

OrganizationCreated

MfaEnabled

SessionRevoked
```

Subscribers

Notification

Analytics

Audit

---

# Security Headers

Gateway adds

```text
HSTS

CSP

X-Frame-Options

X-Content-Type-Options

Referrer-Policy
```

Browser security

By default.

---

# Identity Flow

```text
User

↓

Login

↓

IAM

↓

Access Token

↓

API Gateway

↓

Service

↓

Authorize

↓

Response
```

Every request follows the same path.

---

# Compliance Considerations

To support enterprise customers and future regulatory requirements, IAM should be designed with:

- GDPR data deletion workflows
- SOC 2 audit evidence
- PCI DSS access controls
- Least-privilege administration
- Tamper-evident audit logs
- Configurable password and session policies

Even if Atlas isn't initially certified, designing with these standards in mind avoids expensive redesigns later.

---

# Observability

Metrics

- Login success rate
- Login failure rate
- MFA adoption
- Token issuance
- API key usage
- Authorization denials
- Session count
- Active organizations

Security dashboards should surface anomalies like sudden spikes in failed logins or unusual API key usage.

---

# Why This Architecture?

IAM is intentionally independent of every business domain.

That gives us:

- Consistent authentication across all services
- Centralized authorization logic
- Strong tenant isolation
- Auditable security events
- Extensibility for enterprise identity providers

Every other Atlas service can trust the identity presented to it and focus solely on its own business logic.

---

# We Have Completed the Core Platform

At this point we've specified:

- ✅ API Gateway
- ✅ Identity & Access Management
- ✅ Ledger Service
- ✅ Wallet Service
- ✅ Transfer Service
- ✅ Payment Service
- ✅ Settlement Service
- ✅ Banking Connector Service
- ✅ Notification & Webhook Platform

From here, I would move away from individual business services and into **platform engineering**.

The next major specifications should cover:

1. **Infrastructure & Cloud Architecture (GCP)** — Cloud Run, GKE (where justified), VPC, Cloud SQL, Pub/Sub, Secret Manager, Cloud Armor, Cloud CDN, Cloud Storage, Terraform.
2. **Observability Platform** — OpenTelemetry, Prometheus, Grafana, Cloud Monitoring, ClickHouse, OpenSearch, distributed tracing, SLOs and alerting.
3. **Data Platform** — CDC with Debezium, BigQuery, ClickHouse, OpenSearch, Dataflow, analytics pipelines, data governance.
4. **CI/CD & Release Engineering** — GitHub Actions, Cloud Build, Artifact Registry, progressive delivery, canary deployments, rollback strategies.
5. **Disaster Recovery & Business Continuity** — backups, cross-region failover, RPO/RTO targets, ledger recovery, chaos testing.
6. **Developer Platform** — local development, monorepo tooling, API documentation, SDK generation, testing strategy, developer portal.

These platform specifications are what elevate Atlas from "a collection of microservices" to a complete, production-ready financial infrastructure platform comparable in architecture to systems built by modern fintech companies.
