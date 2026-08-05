# 07 — Security & Multi-Tenancy

## Security Philosophy

> **Zero trust by default. Defense in depth. Least privilege.**

Security in Atlas isn't a standalone service — it's woven into every layer:

- **Network:** Private services, WAF, TLS everywhere
- **Application:** JWT, RBAC, API keys, rate limiting
- **Data:** Encryption at rest, column-level encryption for PII
- **Infrastructure:** IAM, Secret Manager, audit logging

---

## Multi-Tenancy

### The Model

Atlas is a multi-tenant platform. Every resource belongs to an organization.

```
Organization (org_abc)
  ├── Users (user_1, user_2)
  ├── API Keys (atlas_live_xxx)
  ├── Wallets (wlt_001, wlt_002)
  ├── Payments (pi_001, pi_002)
  └── Webhooks (wh_001)
```

A user from Organization A can NEVER see Organization B's data. This is enforced at multiple layers, not just the application.

### Tenant Isolation

```sql
-- WRONG: No tenant filter
SELECT * FROM payments;

-- RIGHT: Always scoped
SELECT * FROM payments WHERE organization_id = 'org_abc';
```

Every query includes the tenant ID. The application layer enforces this through middleware that extracts the organization from the JWT and applies it to every database query.

---

## Authentication

### For Humans

- **Email + Password** with Argon2id hashing (never SHA256, never MD5)
- **Magic Links** (optional)
- **OAuth** (Google, GitHub, Microsoft — future)
- **MFA** (TOTP, Future: Passkeys/WebAuthn)

### For Applications (API Keys)

```
atlas_live_abc123...   → Production access
atlas_test_xyz789...   → Sandbox access
```

API keys are:
- Shown once at creation (hashed before storage, like passwords)
- Scoped to specific permissions
- Rotatable without downtime
- Revocable immediately

### For Services (Service Accounts)

Internal services authenticate using Google Workload Identity:
```
Transfer Service → gRPC → Ledger Service
  └─ Service Account: transfer-sa@atlas.iam...
     └─ IAM allows: roles/ledger.writer
```

No long-lived API keys for internal communication. IAM manages identity.

---

## Authorization (RBAC)

### Permission Model

```
resource:action

payments:create
payments:read
payments:refund
wallets:freeze
wallets:view
ledger:read
settlements:approve
webhooks:manage
users:invite
organizations:update
```

### Role Assignment

```
Role: "Finance Admin"
  ├── payments:*
  ├── settlements:approve
  ├── ledger:read
  └── organizations:update

Role: "Support Agent"
  ├── payments:read
  ├── wallets:view
  └── organizations:read (own org only)
```

Users get roles. Roles get permissions. Simple, predictable, auditable.

### Future: ABAC (Attribute-Based Access Control)

Beyond roles, add context-aware rules:
```
CAN refund IF
  role = "finance.admin"
  AND payment.amount < 500000
  AND payment.created_at > 30 days ago
```

---

## JWT Tokens

### Access Tokens

Short-lived (15 minutes). Contains:
```json
{
  "sub": "user_id",
  "org": "organization_id",
  "roles": ["finance.admin"],
  "permissions": ["payments.create"],
  "sessionId": "sess_123",
  "exp": 123456789
}
```

### Refresh Tokens

Longer-lived (30 days). Used to get new access tokens without re-login. Rotated on use (refresh token rotation).

---

## Encryption

### In Transit

- TLS 1.3 everywhere
- HTTPS only
- HSTS headers
- mTLS for internal service communication (future)

### At Rest

- Cloud SQL: Encrypted by default (Google-managed keys or CMEK)
- Cloud Storage: Server-side encryption
- Backups: Encrypted
- Secrets: Encrypted in Secret Manager

### Sensitive Data

Certain fields get column-level encryption:
- Tax ID numbers
- Bank account numbers (until hashed)
- API key secrets (hashed, not encrypted)

---

## Audit Logging

### What Gets Audited

Every security-relevant action:
- Login (success + failure)
- Password change
- Role assignment change
- API key creation/revocation
- Permission grant/revoke
- Settlement approval
- Impersonation start/end
- Secret access

### Audit Log Properties

- **Immutable** — Cannot be modified after creation
- **Searchable** — OpenSearch in v2 for compliance queries
- **Long-lived** — Retained according to compliance requirements
- **Structured** — JSON format for programmatic analysis

---

## Rate Limiting

Applied at multiple levels:
```
Per IP:      1000 req/min
Per API Key: 500 req/min (varies by plan)
Per Organization: 5000 req/min
Burst:       2x limit for 10 seconds
```

Implemented using Redis sliding window counters at the API Gateway.

---

## Compliance Readiness

Atlas is designed with common compliance frameworks in mind:
- **PCI DSS:** Encryption, access controls, audit trails
- **SOC 2:** Security monitoring, incident response, change management
- **GDPR:** Data deletion workflows, purpose limitation, consent management

Even if formal certification isn't pursued, the architecture supports it.

---

## Key Takeaways

1. **Multi-tenancy is enforced at every layer.** Database, application, API — never assume isolation happens magically.
2. **Short-lived credentials.** Access tokens expire quickly. Refresh tokens rotate.
3. **API keys are hashed.** Like passwords — the plaintext secret is never stored.
4. **Service accounts for internal communication.** No user tokens for service-to-service calls.
5. **RBAC with resource:action naming.** Predictable, auditable, simple.
6. **Audit everything security-relevant.** Immutable, searchable, long-lived.
7. **Rate limiting protects the platform.** At gateway, per IP, per API key, per organization.

## Next: [API Design](./08-api-design.md)
