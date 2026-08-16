# 25 — Understanding `.proto` Files

This document explains what a `.proto` file is, why gRPC's request/response structs look different from "the usual" (REST bodies, function arguments), and how a proto contract drives both the client and the server. Read this alongside `24-internal-grpc.md` (which covers the transport swap) — this one is about the *contract language itself*.

We'll use our own `packages/protobuf/proto/ledger.proto` as the running example.

## What a `.proto` file IS

It's an **IDL — Interface Definition Language**. It is *not* code that runs. It's a **contract file** that both the server and the client read at runtime to agree on:

- what methods exist (`service`),
- what data goes in and out (`message`),
- how to encode/decode that data on the wire.

Think of it as a **shared schema that both sides must agree on**, instead of the TypeScript interfaces being duplicated in each service. This is the big difference from "the usual": in REST, each service hand-writes its own request/response types in TS and they can silently drift apart. With proto, **both sides load the same file**, so drift is impossible.

## The Three Sections

### 1. Header

```proto
syntax = "proto3";      // the protobuf language version
package ledger.v1;      // namespacing: "ledger" service, "v1" version
```

The `package` becomes the gRPC path prefix. That's why our clients call `/ledger.v1.LedgerService/CreateAccount` — it's `{package}.{service}/{method}`.

### 2. Service (the API surface)

```proto
service LedgerService {
  rpc CreateAccount(CreateAccountRequest) returns (CreateAccountResponse);
  rpc PostJournal(PostJournalRequest) returns (PostJournalResponse);
  rpc GetBalance(GetBalanceRequest) returns (GetBalanceResponse);
}
```

Just a list of method signatures. No implementation — it declares *"there is a method `CreateAccount`, it takes a `CreateAccountRequest`, and returns a `CreateAccountResponse`."*

### 3. Messages (the data shapes)

```proto
message CreateAccountRequest {
  string account_code = 1;
  string name         = 2;
  string type         = 3;
  string currency     = 4;
}
```

This is a struct/interface. Each field has a **type**, a **name**, and a **field number**.

## Why Request/Response Are Structs, Not Individual Arguments

In a normal function you'd write:

```ts
CreateAccount(accountCode, name, type, currency)
```

But gRPC can't pass positional arguments over a network — there's no shared stack frame. So the rule is: **every RPC takes exactly ONE message and returns exactly ONE message.** All inputs bundle into a single `Request` struct; all outputs into a single `Response` struct.

Why one?

- **Extensible without breaking callers.** Adding a field later (say `metadata`) means `string metadata = 5;` — existing callers just leave it unset. With positional args, adding a 5th parameter breaks every call site.
- **Self-documenting.** The wire message carries `name`, not "argument #2".

This is the same idea as JS `options` objects (`{ accountCode, name, type, currency }` instead of four positional params) — gRPC just forces it at the protocol level.

## The Field Numbers — the Part With No TS Equivalent

This is the most unusual thing. A TypeScript interface has no field numbers. But protobuf **doesn't send field names on the wire** — it sends binary *tags* derived from the field numbers.

`CreateAccountRequest` with `account_code = "2100-NGN-19"` encodes roughly as:

```
binary: [10, 12, ...bytes for "2100-NGN-19", 18, 6, ...bytes for the name, ...]
         ↑     ↑                                   ↑
        tag   length                               tag for field 2 (name)
        for field 1 (account_code)
```

The wire format is `field_number << 3 | wire_type, length, bytes`. That's why the numbers matter: **change `account_code = 1` to `= 2` and old clients break**, because the client still sends field 1 and the server now reads it as a different field. This is exactly why `api-guidelines.md` says *"never break protobuf field numbering."*

It's also why protobuf is smaller and faster than JSON: no field names repeated, no quotes/braces — just compact binary.

## The Types

| proto | means | TS equivalent |
|-------|-------|---------------|
| `string` | UTF-8 text | `string` |
| `int64` | 64-bit integer | `number` (proto-loader with `longs: Number`) |
| `repeated Posting` | list of messages | `Posting[]` |
| `bool`, `double` | ... | `boolean`, `number` |

Note money is `int64` (minor units), never `double` — no floats for money.

## snake_case and the Casing Gotcha

Proto conventionally uses `snake_case` field names (`account_code`). The wire always carries `account_code`. But on each side:

- **Client side**: loading with proto-loader (`keepCase: true`) gives you `account_code` as the key — so clients build `{ account_code: input.accountCode }`.
- **Server side (NestJS)**: by default it *camelCases* the payload (`payload.accountCode`), so `payload.account_code` is `undefined` until you set `loader: { keepCase: true }`. (This bit us live — see `24-internal-grpc.md`.)

## The Full Round-Trip

```
Wallet (client)                         Ledger (server)
────────────────                        ────────────────
build JS object:
{ account_code, name, type, currency }
      │
      ▼
@atlas/grpc grpcCall → proto-loader encodes
      │   JS object → binary (field-number tags)
      ▼
      │   HTTP/2 request /ledger.v1.LedgerService/CreateAccount
      │────────────────────────────────────────────────►
      │                                          NestJS decodes binary
      │                                          → JS object (payload)
      │                                          LedgerGrpcController.createAccount(payload)
      │                                          → use case → account
      │                                          encodes account → binary
      │◄────────────────────────────────────────────────
      ▼
proto-loader decodes binary → JS object
{ id, account_code, ... }
```

Both sides load the **same** `ledger.proto` via `LEDGER_PROTO_PATH`, so both know field 1 = `account_code`, field 3 = `type`, and so on.

## Proto vs "The Usual" (REST / plain functions)

| Usual (REST / function) | gRPC / proto |
|---|---|
| JSON, field names on the wire | binary, field numbers on the wire |
| hand-written TS types per service | one `.proto` file both sides load |
| methods take N positional args | every RPC takes exactly 1 Request, returns 1 Response |
| versioning = new URL path `/v2/...` | versioning = new package `ledger.v2` |
| no field numbers | `= N` numbers are load-bearing; never change them |

## Where the Files Live

- Contract definitions: `packages/protobuf/proto/*.proto`
- Runtime loading + client helper: `packages/grpc/src/lib/grpc.ts`
- Server wiring: each service's `main.ts` (`app.connectMicroservice`) + its `*-grpc.controller.ts`

## The Meta-Lesson

The `message` structs are just your request/response bodies — but defined once in a neutral language, shared by both sides, and turned into compact binary instead of JSON. Once you accept the "one Request, one Response" rule and the load-bearing field numbers, proto files become a very readable way to describe an API contract.
