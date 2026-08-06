# Atlas — Financial Infrastructure Platform

**Atlas** is a cloud-native financial infrastructure platform. It is **not** a banking app — it is the backend infrastructure behind banking apps. Think Stripe Treasury, Modern Treasury, or Unit.

This monorepo contains all services and shared libraries, orchestrated by **Nx** and managed with **pnpm workspaces**.

---

## Workspace Layout

```
atlas/
├── apps/
│   └── gateway/              # API Gateway — the service template
├── packages/
│   ├── shared/               # @atlas/shared — common DTOs, utilities
│   ├── config/               # @atlas/config — typed configuration
│   ├── database/             # @atlas/database — DB connections
│   ├── logger/               # @atlas/logger — structured JSON logging
│   ├── events/               # @atlas/events — event contracts
│   ├── auth/                 # @atlas/auth — auth guards/policies
│   ├── grpc/                 # @atlas/grpc — gRPC clients
│   ├── testing/              # @atlas/testing — test utilities
│   └── protobuf/             # @atlas/protobuf — generated proto types
├── docs/                     # Architecture specifications
├── _learn/                   # Educational documentation
├── _keep/                    # Planning documents
├── nx.json                   # Nx workspace config
└── package.json              # Root scripts
```

## Prerequisites

- Node.js >= 20 (we use v24)
- pnpm >= 9 (we use v10)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run all services in dev mode
pnpm dev

# Build all projects
pnpm build

# Test all projects
pnpm test

# Lint all projects
pnpm lint

# Build only projects affected by your changes
pnpm affected
```

## Running a Single Service

```bash
pnpm nx serve gateway        # dev mode with watch
pnpm nx run gateway:test     # unit tests
pnpm nx run gateway:build    # production build
```

The gateway serves:
- `http://localhost:3000/api` — root
- `http://localhost:3000/api/health` — health check
- `http://localhost:3000/api/ready` — readiness
- `http://localhost:3000/api/live` — liveness

## Local Infrastructure (Docker Compose)

Start the local infrastructure (PostgreSQL, Redis, Pub/Sub emulator, MailHog, Jaeger, OpenTelemetry Collector):

```bash
pnpm infra:up       # start in the background
pnpm infra:ps       # container status
pnpm infra:logs     # follow logs
pnpm infra:down     # stop
pnpm infra:reset    # stop and wipe data volumes
```

Useful URLs after `pnpm infra:up`:

| Service | URL |
|---------|-----|
| MailHog UI | http://localhost:8025 |
| Jaeger UI | http://localhost:16686 |
| Pub/Sub emulator | http://localhost:8085 |

Services run on the host (`pnpm dev`) and connect to these via the values in `.env` (defaults in `.env.example`).

## Adding a Service or Library

```bash
# New NestJS service
pnpm nx g @nx/nest:app --name=ledger-service --directory=apps/ledger-service

# New shared library
pnpm nx g @nx/js:library --name=events --directory=packages/events \
  --importPath=@atlas/events --publishable --bundler=tsc --unitTestRunner=vitest
```

## Documentation

- `AGENTS.md` — project context and conventions (start here)
- `docs/` — formal architecture specifications
- `_learn/` — educational handbook (read in order)
- `docs/roadmap.md` — the v1/v2/v3 roadmap

## License

Private project — all rights reserved.
