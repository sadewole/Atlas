# 11 — The Monorepo Setup

This document explains what we built in Phase 0 for the monorepo, and why.

## What We Set Up

A **Nx monorepo** using **pnpm workspaces**, TypeScript throughout, with an Nx-powered task graph for building, testing, and linting.

### Final Structure

```
atlas/
├── apps/
│   └── gateway/              # Our first NestJS service (API Gateway) — the template
│       ├── src/
│       │   ├── main.ts       # Bootstrap (Fastify adapter)
│       │   └── app/          # Module, controller, service, health checks
│       ├── project.json      # Nx targets (build, serve, test, lint)
│       └── package.json      # @atlas/gateway
├── packages/
│   ├── shared/               # @atlas/shared — common DTOs, utilities
│   ├── config/               # @atlas/config — typed configuration
│   ├── database/             # @atlas/database — DB connections (placeholder)
│   ├── logger/               # @atlas/logger — structured JSON logging (placeholder)
│   ├── events/               # @atlas/events — event contracts (placeholder)
│   ├── auth/                 # @atlas/auth — auth guards/policies (placeholder)
│   ├── grpc/                 # @atlas/grpc — gRPC clients (placeholder)
│   ├── testing/              # @atlas/testing — test utilities (placeholder)
│   └── protobuf/             # @atlas/protobuf — generated proto types (placeholder)
├── nx.json                    # Nx config (plugins, named inputs)
├── pnpm-workspace.yaml        # pnpm workspace globs
├── tsconfig.base.json         # Shared strict TypeScript config
├── package.json               # Root scripts
├── .env.example               # Example environment variables
└── AGENTS.md                  # Project + agent context
```

---

## Key Decisions & Tradeoffs

### 1. Why Nx over plain pnpm workspaces or Turborepo?

| Tool | Pros | Cons |
|------|------|------|
| **Nx** (chosen) | First-class NestJS generators, task graph, affected-based caching, dependency graph visualization, remote caching | Steeper learning curve, more opinionated |
| Turborepo | Simple task pipelines + caching | No NestJS generators — manual scaffolding |
| Plain pnpm | Zero tooling, transparent | You build task running/caching yourself |

**Why Nx matters here:** We'll build 10+ NestJS services. Nx's `nx g @nx/nest:app` scaffolds an entire service with build/serve/test/lint targets in one command. Its **affected** commands only rebuild what changed — critical when you have a dozen services.

### 2. Why one package.json per project?

Each app/package declares its own dependencies:
```
apps/gateway/package.json  → @nestjs/*, @nestjs/platform-fastify
packages/shared/package.json → tslib
```

This mirrors how a real engineering org works — services evolve their dependency sets independently. The alternative (one root package.json) would force every service onto identical dependencies forever.

### 3. Why pnpm?

- **Fast, disk-efficient** (hard links + content-addressed store)
- **Strict dependency resolution** — you can't use a dependency you didn't declare
- **Native workspace support** (`pnpm-workspace.yaml`)
- Already installed (v10.15.0)

### 4. Why Fastify over Express?

NestJS defaults to Express, but Atlas's spec calls for **Fastify** — it's significantly faster (better throughput and lower latency), which matters for high-concurrency financial APIs. Swapping is a small change:

```typescript
// main.ts
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),  // instead of Express
);
```

**Tradeoff:** Fastify has a smaller plugin ecosystem than Express. For our use case (JSON APIs, health checks, gRPC), it's a non-issue.

---

## How Nx Works Here

### The Task Graph

Every project defines **targets** (build, serve, test, lint, typecheck) in `project.json` or inferred by Nx plugins. Nx computes a dependency graph between projects and runs tasks in the right order with caching.

```
shared ──► config ──► ... ──► gateway
  └────────build────┘          └──build (depends on ^build)
```

If you change `packages/events`, Nx only rebuilds **events and its dependents** — not the whole workspace.

### Commands You'll Use

```bash
# Run a target for one project
pnpm nx run gateway:build
pnpm nx test gateway

# Run a target for all projects (in dependency order)
pnpm nx run-many -t build --parallel=3

# Run a target only for projects affected by your changes
pnpm nx affected -t test

# Visualize the project graph
pnpm nx graph

# Scaffold a new NestJS service
pnpm nx g @nx/nest:app --name=ledger-service --directory=apps/ledger-service

# Scaffold a new shared library
pnpm nx g @nx/js:library --name=events --directory=packages/events
```

### Caching

Nx caches task outputs. Re-running an unchanged build returns instantly:
```
NX   Cache:             10/20 hit (50%)
```
In CI, you can enable **remote caching** (Nx Cloud) so the whole team shares cache entries.

---

## The `@atlas/*` Import Convention

Every package uses the `@atlas/` scope and an `exports` map in its `package.json`:

```json
"exports": {
  ".": {
    "@atlas/source": "./src/index.ts",   // dev: type-check against source
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  }
}
```

The `@atlas/source` condition is the key trick: during development (via `customConditions` in `tsconfig.base.json`), TypeScript resolves to **source files directly** — no rebuilding libraries before the app picks up changes. In production builds, it resolves to compiled `dist/`.

---

## The Gateway Template

`apps/gateway` is our reference service. Every future service follows this pattern:

```
src/
├── main.ts                        # Bootstrap with Fastify
└── app/
    ├── app.module.ts              # Root module
    ├── app.controller.ts          # Route handlers
    ├── app.service.ts             # Business logic
    ├── health/
    │   └── health.controller.ts   # /health, /ready, /live
    └── *.spec.ts                  # Tests
```

### Why Health Endpoints?

Atlas's spec requires every service to expose:
- `GET /health` — overall health (lightweight)
- `GET /ready` — can it accept traffic?
- `GET /live` — is the process alive?

Cloud Run and load balancers use these for health checks and automatic rollback on failed deployments.

---

## What's Next in Phase 0

1. **Shared library implementations** — the packages are skeletons now; we'll fill in logger, config, events, database next
2. **Docker Compose** — local Postgres, Redis, Pub/Sub emulator, MailHog, Jaeger
3. **CI/CD** — GitHub Actions workflow (lint, test, build on every PR)
4. **Terraform bootstrap** — infrastructure as code skeleton
5. **Observability** — OpenTelemetry SDK wiring into the shared logger/config packages
