# 14 — The Service Generator

This document explains the local Nx generator we built to scaffold new Atlas services, and why it's better than copy-pasting.

## The Problem It Solves

Every Atlas service needs the same foundation:
- NestJS + **Fastify** (not Express)
- **ConfigModule** (zod-validated env config)
- **LoggerModule** (pino structured JSON)
- **DatabaseModule** (Drizzle/Postgres) — for data-owning services
- **Health endpoints** (`/health`, `/ready`, `/live`)
- **ESM** output with a `tsc` build
- A **Dockerfile**

Before the generator, scaffolding `identity-service` meant manually copying `ledger-service` and renaming everything — `name`, ports, package.json, tags — with every copy drifting further from the source of truth.

## The Approach: A Local Nx Plugin

We created a **local plugin** at `tools/atlas/` with a `service` generator:

```
tools/atlas/
├── package.json            # "generators": "./generators.json"
├── generators.json         # registers the service generator
└── src/
    └── generators/service/
        ├── service.ts      # the generator logic
        ├── schema.json     # options (name, port, needsDatabase)
        ├── schema.d.ts
        └── files/          # template files (see below)
```

The plugin is a workspace project (`@atlas/atlas`) that Nx discovers automatically, so the generator runs as:

```bash
pnpm nx g @atlas/atlas:service identity-service --port=3010
```

## How the Generator Works

The generator has two phases:

### 1. Compose `@nx/nest:app`

Rather than hand-writing the NestJS scaffold, the generator calls Nx's own `applicationGenerator` programmatically:

```typescript
await nestAppGenerator(tree, {
  directory: 'apps/identity-service',
  name: 'identity-service',
  unitTestRunner: 'jest',
  e2eTestRunner: 'none',
  linter: 'eslint',
  strict: true,
  useProjectJson: true,
  tags: 'scope:identity,type:app',
});
```

This gets us the battle-tested scaffold: package.json, tsconfigs, jest config, eslint config, project.json, Nx project registration.

### 2. Overlay Atlas conventions

Then it applies our template files and rewrites configs:

- **Templates** — `generateFiles` copies the `files/` tree and interpolates `name`, `pascalName`, `port`, etc.:
  - `src/main.ts` — Fastify bootstrap reading config from DI
  - `src/app/app.module.ts` — ConfigModule + LoggerModule + DatabaseModule
  - `src/app/health/health.controller.ts` + spec
  - `src/config/__name__-config.ts` — zod schema (base + service port + postgres)
  - `Dockerfile`
- **package.json** — adds `"type": "module"`, swaps express→fastify, adds `@atlas/*` deps
- **project.json** — replaces webpack `build` with `tsc --build tsconfig.app.json`
- **tsconfig.app.json** — `emitDeclarationOnly: false`, `target: es2022`
- **Nest-generated files** — adds `.js` extensions to relative imports (ESM requirement)
- Deletes the unused `webpack.config.js`

## Template Files: How Nx Interpolates

Two mechanisms work together:

1. **File content** — EJS: `<%= name %>`, `<% if (needsDatabase) { %>...<% } %>`
2. **File names** — `__name__` substitutions: a file named `__name__-config.ts__tmpl__` becomes `identity-service-config.ts`
3. **The `__tmpl__` suffix** is stripped from every file name (passed as `tmpl: ''`)

Example — the config template:
```
files/src/config/__name__-config.ts__tmpl__
→  apps/identity-service/src/config/identity-service-config.ts
```

## What the Generated Service Looks Like

Running `nx g @atlas/atlas:service identity-service --port=3010` produces a service that:
- Builds with `tsc` (ESM output)
- Runs with `node dist/main.js` (verified live: `/health`, `/ready` respond, DB connectivity checked)
- Passes typecheck, jest tests (5), and lint out of the box

```
apps/identity-service/
├── Dockerfile
├── jest.config.cts
├── package.json          # type: module, @atlas/* deps
├── project.json          # tsc build + @nx/js:node serve
├── src/
│   ├── main.ts           # Fastify + config + logger
│   ├── app/
│   │   ├── app.module.ts # Config + Logger + Database modules
│   │   ├── app.controller.ts (from @nx/nest)
│   │   └── health/       # /health, /ready, /live
│   └── config/
│       └── identity-service-config.ts  # zod schema
└── tsconfig.app.json     # emitDeclarationOnly: false
```

## Why a Generator Over Copy-Paste

| | Copy-paste | Generator |
|--|-----------|-----------|
| Scaffold a new service | Manual find-replace everywhere | One command |
| Fix a bug in the template | Existing services never get it | Regenerate / fix once |
| Naming (name, port, tags) | Easy to miss | Baked in |
| Encodes "definition of done" | No | Yes — it IS the convention |

This is the same pattern real platform teams use: the generator *is* the internal developer platform. When we build `identity-service` in Phase 1, we run one command and add the domain logic.

## Tradeoffs & Notes

- **Generators are code** — they need maintenance. But the "template" is version-controlled, reviewed, and tested like any other code.
- **Composing `@nx/nest:app`** means upgrades to Nx's scaffold propagate automatically. The downside: we depend on its output shape (we must know the generated file names to overlay on).
- The `installPackagesTask` callback runs `pnpm install` after generation so `@atlas/*` workspace symlinks resolve immediately.
- `needsDatabase: false` produces a stateless service (no DatabaseModule) — like the gateway.

## How to Use It

```bash
# A full data-owning service (default)
pnpm nx g @atlas/atlas:service transfer-service --port=3004

# A stateless service (no database)
pnpm nx g @atlas/atlas:service webhook-service --port=3008 --needsDatabase=false
```

## What's Next

- Add a **gRPC controller template** (ledger/transfer expose proto services)
- Add **OpenAPI/Swagger** setup to the template
- Extend the generator to add a `domain`/`application`/`infrastructure` folder structure per the SAS
