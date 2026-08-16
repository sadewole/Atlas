# 24 — Internal gRPC: The Service-to-Service Swap

This document explains why and how we moved Atlas's internal service-to-service calls from REST to gRPC — the "gRPC swap." For a deep dive on what `.proto` files are and how a proto contract works, see `25-proto-files.md`.

## The Architecture Decision

Atlas has three communication channels (from `sas.md`):

| Channel | Used for | Transport |
|---------|----------|-----------|
| **REST** | External / public API | HTTP + JSON + OpenAPI |
| **gRPC** | Internal service-to-service | HTTP/2 + Protocol Buffers |
| **Events** | Async fan-out | Pub/Sub |

For a long time the internal calls were REST too (it's the fastest way to build the first slice), with comments marking each client: *"the plan is to swap this to gRPC as the platform matures — consumers of this class shouldn't care which."* The swap happened exactly as that comment promised: the **public method signatures didn't change**, only the transport underneath.

## What Was Converted

Three client classes spoke REST internally. All three now speak gRPC:

| Caller | Target | gRPC method(s) | Proto service |
|--------|--------|----------------|---------------|
| Wallet → Ledger | provision account | `CreateAccount` | `ledger.v1.LedgerService` |
| Transfer → Ledger | post journal, read balance | `PostJournal`, `GetBalance` | `ledger.v1.LedgerService` |
| Transfer → Wallet | hold, settle, release, read | `Reserve`, `Capture`, `Release`, `GetWallet` | `wallet.v1.WalletService` |

The REST endpoints stayed (they're the public API). gRPC was added *alongside* them as the internal transport.

## The Two Packages

### `@atlas/protobuf` — the contracts

Holds the `.proto` files at the **package root** (`proto/ledger.proto`, `proto/wallet.proto`), and exports their absolute paths:

```ts
export const LEDGER_PROTO_PATH = fileURLToPath(new URL('../proto/ledger.proto', import.meta.url));
```

The files live at the package root (not `src/`) so the `../proto/...` path resolves identically from `src/index.ts` (dev) and `dist/index.js` (build) — one source of truth, no build-time copying needed.

Proto conventions per `api-guidelines.md`:
- Package versioning: `ledger.v1`, `wallet.v1`
- Money in minor units, `int64`
- Never break field numbers

### `@atlas/grpc` — the client helper

Loads a `.proto` at runtime with `@grpc/proto-loader` (the same loader NestJS microservices uses) and returns a typed client stub. Key exports:

- `createGrpcClient({ protoPath, packageName, serviceName, url })` — builds the stub
- `grpcCall(client, method, request)` — promisifies a unary call, rejects with a `GrpcServiceError` carrying the canonical gRPC status
- `httpStatusToGrpcStatus(httpStatus)` — maps Atlas's HTTP-style error statuses to gRPC codes (404 → NOT_FOUND, 409 → ALREADY_EXISTS, 422 → FAILED_PRECONDITION, ...)
- `GRPC_STATUS` — re-export of `@grpc/grpc-js` statuses

Because we use **runtime proto loading** (not codegen), message types are defined by hand as TS interfaces in each client. Tradeoff: no compile-time wire-type checking, but no protoc build step in an ESM + tsc workspace — and the `.proto` files remain the single source of truth.

## The Server Side (NestJS microservices transport)

Each service that is *called* internally exposes a gRPC microservice alongside its Fastify REST server:

```ts
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.GRPC,
  options: {
    package: 'ledger.v1',
    protoPath: LEDGER_PROTO_PATH,
    url: `0.0.0.0:${config.LEDGER_GRPC_PORT}`,
    loader: { keepCase: true, longs: Number, defaults: true },
  },
});
// ...
await app.startAllMicroservices();
await app.listen(config.LEDGER_PORT, '0.0.0.0');
```

A gRPC controller maps wire methods to the **same use cases** the REST controller uses — no business logic duplicated:

```ts
@GrpcMethod('LedgerService', 'CreateAccount')
async createAccount(@Payload() payload: CreateAccountRequest) {
  try {
    const { account } = await this.createAccountUseCase.execute({ ... });
    return { id: account.id, account_code: account.accountCode, ... };
  } catch (err) {
    throw this.toRpc(err);
  }
}
```

Errors are thrown as `RpcException` with a canonical gRPC status code, derived from the domain error's HTTP status.

## The Client Side (transport swap)

The existing `LedgerClient` / `WalletClient` classes kept their **exact public API** — only the `fetch` internals changed:

```ts
// before: REST
res = await fetch(`${this.baseUrl}/v1/ledger/accounts`, { method: 'POST', ... });

// after: gRPC
const stub = createGrpcClient({ protoPath: LEDGER_PROTO_PATH, packageName: 'ledger.v1', serviceName: 'LedgerService', url });
const res = await grpcCall(stub, 'createAccount', { account_code, name, type, currency });
```

The use cases that call these clients (`CreateWalletUseCase`, `CreateTransferUseCase`) **did not change at all**. That's the payoff of the abstraction.

## Ports & Config

Each service now runs **two** listeners:

| Service | REST | gRPC |
|---------|------|------|
| ledger-service | 3001 | 50051 |
| wallet-service | 3002 | 50052 |
| transfer-service | 3003 | — (only calls out) |

Config added: `LEDGER_GRPC_PORT`/`GRPC_PORT` (server ports) and `LEDGER_GRPC_URL`/`WALLET_GRPC_URL` (client targets). The old REST URLs (`LEDGER_SERVICE_URL`, `WALLET_SERVICE_URL`) were removed.

## Gotchas We Hit (the valuable part)

1. **Method-name case.** `@grpc/proto-loader` registers client methods as `createAccount` (lowerCamelCase), but the full RPC path is `/ledger.v1.LedgerService/CreateAccount`. `grpcCall` had to call the stub by its local method name, not the full path.

2. **`this` binding.** grpc-js client methods depend on `this` (channel + request config). Extracting `const fn = client[method]` and calling it detached threw `Cannot read properties of undefined (reading 'checkOptionalUnaryResponseArguments')`. Fix: invoke through the client: `client[method](request, cb)`.

3. **Field-name casing on the server.** NestJS gRPC decodes snake_case proto fields to camelCase by default. `payload.account_code` was `undefined` while `payload.accountCode` held the value. Fix: set `loader: { keepCase: true }` on the server so payloads match the proto exactly.

4. **Proto files must be reachable at runtime.** Plain `tsc` doesn't copy `.proto` files into `dist`. Keeping them at the package root and resolving with `import.meta.url` (`../proto/...`) works from both `src` and `dist`.

## The Result

- Internal calls are now fast, typed, HTTP/2 — matching the architecture spec
- REST is cleanly the external API; gRPC is cleanly internal
- Use cases didn't change; only transport layers did
- Live E2E verified: wallet creation provisions its ledger account over gRPC, and a transfer resolves accounts → reserves → posts the journal → captures, all over gRPC

## Meta-Lesson

The "consumers shouldn't care which transport" comment was the whole point of the client abstraction. When you build service-to-service calls, wrap them behind a stable interface — the transport can then evolve (REST → gRPC) without touching business logic. The swap was mostly plumbing + three real gotchas that only live testing exposed.
