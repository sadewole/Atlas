# 15 — CI/CD Pipeline

This document explains the GitHub Actions CI we set up, the decisions behind it, and how it fits the release spec.

## The Workflow

`.github/workflows/ci.yml` runs two jobs on every push to `main` and every pull request:

```
verify      format:check → typecheck → lint → test → build  (nx affected)
security    pnpm audit --prod + gitleaks secret scan
```

### Why `nx affected` instead of running everything?

Nx's `affected` computes which projects actually changed in this PR/commit and runs tasks **only for those** (+ their dependents). On a monorepo with 12 projects, a change to `packages/shared` shouldn't re-test the whole workspace — only the projects that import it.

```
pnpm exec nx affected -t typecheck lint test build
```

This matches the release spec's "fail fast" principle: CI is fast when changes are small.

### The steps, in order

1. **checkout** with `fetch-depth: 0` — needed by Nx to compute the diff base
2. **pnpm/action-setup** — installs the right pnpm version
3. **setup-node** with `cache: 'pnpm'` — caches the pnpm store for fast installs
4. **`pnpm install --frozen-lockfile`** — reproducible installs (fails if the lockfile is out of date)
5. **`nx-set-shas`** — computes the base SHA so `nx affected` knows what to compare
6. **format:check** → **typecheck** → **lint** → **test** → **build**

`concurrency: cancel-in-progress` means a new push cancels the stale run on the same branch.

---

## The Two Jobs

### `verify` — the quality gate

Runs the core gates in dependency order (format first — it's cheapest, catches whitespace drift; build last — it's the most expensive and everything else already ran).

Integration tests run here too (they use **Testcontainers**, which needs Docker — available on `ubuntu-latest`).

### `security` — dependency + secret scanning

Separate job so a slow install doesn't delay the scan, and so security failures are clearly attributable:

- `pnpm audit --prod` — known vulnerabilities in the dependency tree
- **gitleaks** — scans the repo for accidentally committed secrets (API keys, tokens)

---

## What We Fixed Along the Way

The audit initially found **8 vulnerabilities (5 high)**. Root cause: `@fastify/static` and `@fastify/view` — optional peer dependencies of `@nestjs/platform-fastify` that pnpm auto-installs. We'd originally added them as a workaround for webpack's ESM resolution (before switching apps to `tsc` builds). Nothing in our code imports them.

**Fix 1 — remove the unneeded deps** from `apps/gateway` and `apps/ledger-service` (and the service generator template).

**Fix 2 — pnpm overrides** in `pnpm-workspace.yaml` for what's left:

```yaml
overrides:
  find-my-way: 9.7.0        # DDoS fix; fastify hasn't bumped its range
  '@fastify/static': 9.3.0  # optional peer; pin to patched major
  '@fastify/view': 12.0.0
```

After this: **`pnpm audit --prod` → "No known vulnerabilities found"**.

---

## Design Decisions

| Decision | Why |
|----------|-----|
| **pnpm** over npm/yarn | Our workspace is pnpm; `cache: 'pnpm'` + `--frozen-lockfile` |
| **`nx affected`** on PRs | Only test what changed — fast feedback |
| **`run-many`** locally, **`affected`** in CI | Locally you want everything; in CI you want minimal |
| **No Nx Cloud** | We didn't connect it; `affected` works fine without it |
| **Separate security job** | Security failures are a distinct concern from quality failures |
| **`concurrency.cancel-in-progress`** | Don't waste minutes on superseded runs |

---

## What's NOT in CI Yet (future)

The release spec describes more that we'll add later:

- **Dependency/container scanning** — `dependabot`, container image scanning, SBOM
- **Deploy to staging** — after a real GCP deployment exists (Terraform + Cloud Run)
- **Nightly jobs** — load tests (k6), chaos tests, soak tests (spec's "optional nightly" gates)
- **Canary / progressive rollout** — when production deploys exist

These need the deployment story (Terraform/Cloud Run) first, which is why they're deferred.

---

## Running the CI Checks Locally

```bash
pnpm exec nx format:check        # what CI checks first
pnpm exec nx affected -t typecheck lint test build
pnpm audit --prod                # what the security job checks
```

## How to Verify CI Works

Push to GitHub and open a PR — the workflow runs automatically. `nx affected` on a fresh PR (no base) runs the full workspace once; subsequent PRs run only what changed.

---

## Next Steps

- **Commit the work** so CI has something to test (still uncommitted)
- **GitHub repo setup** — push, enable branch protection on `main` (require CI to pass before merge)
- Then back to the **Wallet Service** as the first ledger consumer
