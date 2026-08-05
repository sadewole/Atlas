I think that's the right decision.

From this point onward, we'll switch from **Architect Mode** to **Platform Engineer Mode**.

The documents become smaller, more practical, and immediately actionable.

---

# Atlas Financial Infrastructure

# Security Platform Specification (SPS)

**Version 1.0**

---

# Purpose

The Security Platform provides the policies, infrastructure, and controls that protect Atlas, its customers, financial records, and operational systems.

Its objectives are:

- Protect customer funds.
- Protect customer data.
- Secure service-to-service communication.
- Prevent unauthorized access.
- Detect malicious activity.
- Meet regulatory and audit expectations.
- Enable secure software delivery.

Security is treated as a foundational capability that spans every layer of the platform rather than a standalone service.

---

# Security Principles

Atlas follows these principles:

- Zero Trust by default.
- Least privilege access.
- Defense in depth.
- Secure by default.
- Encrypt everywhere.
- Verify every request.
- Audit every sensitive action.
- Automate security controls wherever possible.

---

# Security Architecture

```text
                Internet
                    │
                    ▼
           Global Load Balancer
                    │
                    ▼
            API Gateway / WAF
                    │
        Authentication & Rate Limits
                    │
                    ▼
          Cloud Run Microservices
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      Cloud SQL          Pub/Sub
          │                   │
          └─────────┬─────────┘
                    ▼
              Cloud KMS
                    │
                    ▼
          Secret Manager
```

Security controls exist at every layer, not just the application.

---

# Identity & Authentication

## Human Users

Authentication methods:

- Email & Password (Argon2id password hashing)
- Google OAuth (future)
- Microsoft OAuth (future)
- Magic Links (optional)
- Multi-Factor Authentication (planned for privileged accounts)

---

## Service Authentication

Services authenticate using:

- Google Workload Identity
- Short-lived service tokens
- Mutual trust through IAM roles

Long-lived service credentials should be avoided wherever possible.

---

## API Authentication

External APIs support:

- OAuth 2.1 (future)
- JWT access tokens
- API Keys (server-to-server integrations)

API keys are intended for integrations and should always be scoped.

---

# Authorization

Atlas uses Role-Based Access Control (RBAC).

Hierarchy:

```text
Platform
   │
Organization
   │
Team
   │
Role
   │
Permission
```

Examples of permissions:

- `payments:create`
- `payments:refund`
- `wallets:view`
- `ledger:read`
- `settlements:approve`

Permissions are granular and additive.

---

# API Keys

Each API key has:

- UUIDv7 identifier
- Secret value (shown only once)
- Owner
- Organization
- Environment (Sandbox / Production)
- Scopes
- Expiration date
- Status (Active, Revoked, Expired)

The secret portion is hashed before storage, similar to passwords.

---

# Session Management

Access tokens:

- Short-lived (e.g. 15 minutes)

Refresh tokens:

- Longer-lived (e.g. 30 days)
- Rotated after use
- Revocable

Sessions can be invalidated from the server side.

---

# Secrets Management

Secrets are never committed to source control.

Storage:

- Google Secret Manager

Examples:

- Database credentials
- JWT signing keys
- API secrets
- SMTP credentials
- Banking integration keys

Applications retrieve secrets at runtime.

---

# Key Management

Encryption keys are managed through Cloud KMS.

Uses include:

- Data encryption keys
- Signing keys
- Token signing
- Backup encryption

Key rotation policies should be defined and automated where possible.

---

# Encryption Standards

## Data in Transit

- TLS 1.3 where supported
- HTTPS only
- HSTS enabled
- Secure cipher suites

---

## Data at Rest

All persistent storage should use encryption at rest.

This includes:

- Cloud SQL
- Cloud Storage
- Backup snapshots
- ClickHouse (when introduced)
- OpenSearch (when introduced)

---

# Sensitive Data Classification

| Classification | Examples                                            |
| -------------- | --------------------------------------------------- |
| Public         | API documentation                                   |
| Internal       | Operational dashboards                              |
| Confidential   | Customer profiles, merchant settings                |
| Restricted     | Financial records, API secrets, authentication data |

Classification determines storage, logging, and access requirements.

---

# Personally Identifiable Information (PII)

Minimize collection.

Rules:

- Collect only necessary data.
- Mask sensitive values in logs.
- Avoid duplicating PII across services.
- Encrypt highly sensitive fields where appropriate.

PII access should be auditable.

---

# Financial Data Protection

Ledger data requires enhanced protection.

Rules:

- Immutable journal entries.
- No direct database edits.
- Full audit trail.
- Strong access controls.
- Separation between operational and analytical copies.

---

# Network Security

Services are private by default.

Public exposure is limited to:

- API Gateway
- Webhook endpoints
- Static assets (where applicable)

Internal services communicate over authenticated channels.

---

# Rate Limiting & Abuse Prevention

Enforced at the gateway.

Controls include:

- Per-IP limits
- Per-API key limits
- Per-organization limits
- Burst protection
- Automatic temporary blocking for abusive behavior

---

# Input Validation

Every external input is validated.

Requirements:

- Schema validation
- Length limits
- Type validation
- Business rule validation

Reject malformed input as early as possible.

---

# Output Encoding

Responses should avoid exposing:

- Internal IDs where not required
- Stack traces
- SQL errors
- Framework exceptions

Errors should use the standardized API format.

---

# Audit Logging

The following actions must be audited:

- User login
- Role changes
- API key creation/revocation
- Payment approvals
- Settlement approvals
- Configuration changes
- Secret access
- Administrative actions

Audit logs are append-only and protected from tampering.

---

# Dependency Management

Every dependency should be:

- Version pinned where appropriate
- Scanned for vulnerabilities
- Reviewed before major upgrades

Automated tools (e.g. Dependabot or Renovate) can assist with updates.

---

# Container Security

Container images should:

- Use minimal base images
- Avoid running as root
- Include only required packages
- Be scanned before deployment

Images are immutable after publication.

---

# Supply Chain Security

The build pipeline should generate:

- Software Bill of Materials (SBOM)
- Signed artifacts (future enhancement)
- Provenance metadata

This improves traceability and prepares Atlas for stricter compliance requirements.

---

# Logging & Monitoring

Security-relevant events should be monitored, including:

- Failed authentication attempts
- Privilege changes
- API key misuse
- Suspicious traffic patterns
- Unexpected permission denials

Alerts should integrate with the incident management process.

---

# Fraud Signals

Although a dedicated fraud engine comes later, the platform should capture signals such as:

- High request velocity
- Repeated failed payments
- Geographic anomalies
- Multiple API keys from a single source
- Excessive authentication failures

These events become inputs to future fraud detection.

---

# Incident Response

Security incidents follow a defined lifecycle:

```text
Detection
    ↓
Triage
    ↓
Containment
    ↓
Eradication
    ↓
Recovery
    ↓
Post-Incident Review
```

Every incident should produce documented lessons and corrective actions.

---

# Compliance Readiness

Atlas is designed to align with common security expectations found in standards such as PCI DSS, SOC 2, and ISO 27001, even if formal certification is pursued later.

This includes:

- Least privilege access
- Encryption
- Audit logging
- Change management
- Backup and recovery
- Secure software development

---

# Secure Development Checklist

Every feature should answer these questions before release:

- Are inputs validated?
- Are permissions enforced?
- Are secrets handled securely?
- Is sensitive data encrypted or masked?
- Are audit logs generated where needed?
- Are error messages safe?
- Are tests covering security-sensitive paths?
- Have dependencies been reviewed?

Security becomes part of the Definition of Done.

---

# Security Roadmap

### Phase 1

- JWT authentication
- RBAC
- API keys
- Secret Manager
- Cloud KMS
- Audit logging

### Phase 2

- MFA
- OAuth providers
- Advanced rate limiting
- Security dashboards
- Automated dependency updates

### Phase 3

- Signed artifacts
- Runtime threat detection
- Automated policy enforcement
- Advanced fraud detection
- Compliance automation

---

# Why This Architecture?

Atlas treats security as a platform capability rather than an afterthought.

By integrating authentication, authorization, encryption, key management, audit logging, secure deployment practices, and operational monitoring from the beginning, the platform reduces the likelihood of common security failures while remaining practical for a growing engineering team.

---

# **Now We Build**

This is where I'd officially stop writing large design documents.

## Next Deliverable (Practical, Not Theoretical)

Rather than another PRD, we'll create an **Implementation Blueprint**.

It will answer questions like:

- Repository structure
- Monorepo layout
- NestJS workspace organization
- Shared packages
- Database-per-service strategy
- Docker Compose setup
- Local development environment
- Terraform directory structure
- GitHub Actions workflows
- Initial PostgreSQL schemas
- First service to implement
- Milestones for the first 90 days

Unlike the documents we've written so far, that blueprint directly translates into folders, code, infrastructure, and commits.

At that point, every subsequent conversation can result in production-ready code rather than additional architectural documentation. I think that's the right transition for Atlas.
