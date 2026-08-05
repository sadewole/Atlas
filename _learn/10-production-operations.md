# 10 — Production Operations

## The Goal

> **A system that can be operated confidently by someone who didn't build it.**

Production operations covers everything that happens after the code is deployed: monitoring, alerting, incident response, disaster recovery, and continuous improvement.

---

## Service Level Objectives (SLOs)

### What We Promise

| Service | SLO | Measurement |
|---------|-----|-------------|
| Payment API | 99.95% availability | Successful / Total requests (per month) |
| Transfer API | 99.99% availability | Successful / Total requests (per month) |
| Ledger API | 99.99% availability | Successful / Total requests (per month) |
| Webhook Delivery | 99% within 5 minutes | Delivered within window / Total webhooks |
| Balance Accuracy | 100% | Ledger balance == Projection balance |

### Error Budgets

99.95% availability means 0.05% allowable failure. Over a month (43,200 minutes), that's ~22 minutes of acceptable downtime.

If we're within budget:
- Deploy freely
- Take risks (new features, experiments)

If we're over budget:
- Freeze deployments
- Focus on reliability improvements
- Postpone risky changes

This makes tradeoffs explicit: reliability vs velocity.

---

## Monitoring

### What We Monitor

```
Layer 1: Infrastructure
  - Cloud Run instances (count, CPU, memory, cold starts)
  - Cloud SQL (connections, replication lag, slow queries)
  - Redis (memory, hit ratio, evictions)
  - Pub/Sub (queue depth, oldest message age)
  - Cloud Storage (throughput, error rate)

Layer 2: Application
  - Request rate (per endpoint, per service)
  - Error rate (4xx vs 5xx, per endpoint)
  - Latency (P50, P95, P99 per endpoint)
  - Idempotency replay rate
  - DLQ size and growth rate

Layer 3: Business
  - Payments created/hour vs completed/hour
  - Settlement value per day
  - Webhook delivery success rate
  - Active merchant count
  - Refund rate
```

### Dashboards

**Platform Overview** — First screen in an incident:
- API availability
- Queue health
- Database health
- Error rates (all services)
- Recent deployments

**Per-Service Dashboard** — Deep dive:
- RED metrics (Rate, Errors, Duration)
- Instance count
- Memory/CPU
- Retry rate
- Circuit breaker state

**Business Dashboard** — For non-engineers:
- Payment volume (daily, weekly, monthly)
- Revenue
- Success rate
- Settlement totals

---

## Alerting

### Alert Philosophy

> **Every alert must be actionable. If no one needs to wake up, don't page.**

| Severity | Meaning | Response |
|----------|---------|----------|
| INFO | Noteworthy, not urgent | Dashboard, no alert |
| WARNING | Potential issue | Slack notification |
| HIGH | Degraded service | Page on-call (business hours) |
| CRITICAL | Service down or data at risk | Page on-call (immediately, 24/7) |

### What Gets a CRITICAL Alert

- Payment API error rate > 1% for 2 minutes
- Ledger Service unavailable for 1 minute
- DLQ accumulating (>100 events in DLQ)
- Cloud SQL failover in progress
- Balance projection inconsistent with ledger (after 3 consecutive checks)

### What Does NOT Get a CRITICAL Alert

- One failed payment (happens; customer will retry)
- Notification service latency spike (retries handle this)
- Analytics dashboard slow (business impact, not system impact)
- Redis evictions (expected under memory pressure; system degrades gracefully)

---

## Incident Response

### Incident Roles

| Role | Responsibility |
|------|---------------|
| **Incident Commander** | Coordinates response, makes decisions |
| **Operations Lead** | Technical investigation, fix implementation |
| **Communications Lead** | Status page updates, stakeholder notifications |
| **Scribe** | Documents timeline, actions, findings |

For most incidents in a small team, one person fills multiple roles.

### Incident Workflow

```
1. DETECTION
   Alert fires → Engineer acknowledges → Incident declared

2. ASSESSMENT (5 minutes)
   - What service is affected?
   - What's the customer impact?
   - Is this a known issue?

3. CONTAINMENT (15 minutes)
   - Roll back recent deployment?
   - Route traffic away from unhealthy region?
   - Disable failing feature flag?
   - Scale up affected service?

4. RECOVERY (variable)
   - Apply fix
   - Verify metrics returning to normal
   - Confirm with synthetic tests

5. RESOLUTION
   - Incident closed
   - Postmortem scheduled within 48 hours
```

### Postmortems

Every significant incident gets a blameless postmortem:

```
Timeline:
  10:23 - Deployment of payment-service v1.4.2 started
  10:25 - Alert: payment error rate spiking
  10:27 - Engineer on-call began investigation
  10:30 - Rollback initiated
  10:33 - Error rate returning to normal
  10:35 - All metrics green

Root Cause:
  Database migration failed because the new column had a NOT NULL
  constraint without a default value. Existing rows violated it.

Contributing Factors:
  1. Migration was not tested against production-like data volume
  2. No pre-deploy checklist checked for destructive migrations

Corrective Actions:
  [ ] Add migration testing against anonymized production data
  [ ] Add pre-deploy checklist for schema changes
  [ ] Add NOT NULL detection to CI pipeline
```

The goal is learning, not blame.

---

## Disaster Recovery

### Recovery Objectives

| Service | RPO (Max Data Loss) | RTO (Max Downtime) |
|---------|---------------------|--------------------|
| Ledger | 0 minutes | < 30 minutes |
| Payments | < 5 minutes | < 30 minutes |
| Wallet | < 5 minutes | < 30 minutes |
| IAM | < 15 minutes | < 1 hour |
| Notifications | < 30 minutes | < 2 hours |
| Analytics | < 24 hours | < 24 hours |

### Backup Strategy

| System | Backup Method |
|--------|---------------|
| Cloud SQL | Automated daily + PITR (point-in-time recovery) + WAL archiving |
| Cloud Storage | Object versioning + lifecycle policies |
| Terraform State | Remote backend with versioning |
| Secret Manager | Automatic versioning |

### Recovery Procedures

**Database Corruption:**
```
1. Stop affected service
2. Restore database to point before corruption (PITR)
3. Replay ledger to rebuild projections
4. Verify (debits == credits, all projections match)
5. Re-enable service
```

**Ledger Reconstruction:**
```
1. Ledger entries are immutable — data loss is nearly impossible
2. If projections corrupted: replay from last snapshot
3. Verify every 100,000 entries with a checksum
4. Rebuild cache from ledger data
```

**Regional Failure (v2):**
```
1. Detect: health checks failing from primary region
2. Decide: fail over to standby region
3. Promote standby database to primary
4. Switch DNS to standby region
5. Verify: synthetic transactions succeed
```

---

## Runbooks

Every critical service has a documented runbook:

```
Runbook: Payment API Latency Spike
  1. Check Cloud Run metrics (CPU, memory, instances)
     → Are instances maxed out? Increase max instances.
     → High CPU? Check for infinite loops, N+1 queries.
  2. Check database metrics (connections, slow queries)
     → Slow query log: what query? Which endpoint?
  3. Check downstream services (Ledger, Transfer)
     → Are they slow? Payments can't complete without them.
  4. Check recent deployments
     → Did this start after a deployment? Consider rollback.
  5. If no cause found, scale up (more instances, more DB capacity)
     and investigate in parallel.
```

Runbooks live in the repository, version-controlled, alongside the service code.

---

## Chaos Engineering

### Practice Failure

We deliberately break things to verify recovery:

```
Scenario 1: Kill a random Cloud Run instance
  Expected: Requests route to healthy instances. No errors.

Scenario 2: Redis becomes unavailable
  Expected: Cache misses increase. Balance queries slower but correct.
           Idempotency falls back to PostgreSQL.

Scenario 3: Pub/Sub delays events by 5 minutes
  Expected: Outbox worker retries. DLQ doesn't fill. No data loss.

Scenario 4: Payment provider API returns 503 for 10 minutes
  Expected: Circuit breaker opens. Alternative provider used.
           Payments queue for retry.

Scenario 5: Cloud SQL read replica lag spikes to 30 seconds
  Expected: Read queries serve from primary. Slight latency increase.
           No data inconsistency.
```

Run these in staging monthly. In production, carefully and with supervision.

---

## Deployment Safety

### Before Every Production Deployment

```
✓ Health checks passing on current version
✓ Database migrations tested against production data volume
✓ Rollback artifact is available and tested
✓ Feature flags ready (to disable new features without redeploying)
✓ Runbooks updated for known failure modes
✓ On-call engineer is available
✓ Deployment window is appropriate (not Friday at 5 PM)
```

### During Deployment

```
✓ Deploy with progressive traffic (5% → 25% → 100%)
✓ Monitor error rate, latency, CPU at each stage
✓ If errors spike → auto-rollback
✓ If latency degrades → pause, investigate
✓ If healthy → continue to next stage
```

### After Deployment

```
✓ Smoke tests pass (health, auth, critical API calls)
✓ Synthetic transactions succeed
✓ No new alerts firing
✓ Business metrics stable (payment rate, webhook delivery)
```

---

## Capacity Planning

### Questions to Ask

- What's our current peak requests/sec?
- When does the database hit 70% storage? (plan before our planning hits)
- Are we approaching Cloud Run concurrency limits?
- Is Pub/Sub queue depth growing faster than processing?
- What's the cost per 1000 transactions? (is it sustainable?)

### Scaling Triggers

| Metric | Action |
|--------|--------|
| CPU > 70% for 5 min | Increase max instances |
| P99 latency > 500ms | Increase instances or investigate |
| DB connections > 80% pool | Increase pool size or add read replicas |
| Pub/Sub oldest message > 2 min | Increase subscriber count or investigate |
| Redis memory > 80% | Increase instance size or add eviction policy |

---

## Cost Optimization

### Where Money Goes

```
Cloud Run    → Per-request pricing + per-instance baseline
Cloud SQL    → Instance size (the biggest cost), storage, backups
Pub/Sub      → Per-message pricing (can add up with high volume)
Cloud Logging → Ingestion volume (can be surprisingly expensive)
Redis        → Instance size (fixed cost)
Networking    → Egress charges (data leaving GCP)
```

### What We Do

- Scale-to-zero for dev/staging (Cloud Run scales to 0 when idle)
- Right-size production instances (start small, scale on demand)
- Log sampling for non-audit logs (sample 10% of INFO logs in production)
- Data retention policies (don't keep analytics data forever)
- GCP budgets and alerts (get notified before surprises)

---

## Key Takeaways

1. **SLOs define what "healthy" means.** Not everything needs 99.99%.
2. **Alerts must be actionable.** If you can't do anything, don't page.
3. **Postmortems are blameless.** The goal is to improve the system.
4. **Backups must be tested.** A backup you haven't restored is a wish.
5. **Runbooks reduce recovery time.** Don't figure things out during an incident.
6. **Chaos engineering builds confidence.** Break things on purpose, on your terms.
7. **Deployments should be boring.** If deploying feels risky, the safety mechanisms are inadequate.
8. **Cost is a metric.** Monitor it, optimize it, budget for it.

---

## What's Next

You've now covered the complete Atlas platform — from the business vision through the technical architecture, financial engineering, event-driven design, cloud infrastructure, security, API design, testing, and production operations.

The next step is **Phase 0: Project Foundation**. This involves:
1. Setting up the monorepo
2. Creating the Docker Compose local development environment
3. Building shared libraries (config, database, logger, events)
4. Setting up CI/CD with GitHub Actions
5. Creating the first service template
6. Bootstrapping Terraform infrastructure
7. Setting up OpenTelemetry

After Phase 0, we begin implementing services one by one, starting with Identity & Access Management (IAM).

See `docs/roadmap.md` for the detailed phase breakdown and `AGENTS.md` for project conventions.
