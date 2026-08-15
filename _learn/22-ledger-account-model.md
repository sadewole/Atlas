# 22 — The Ledger Account Model: Per-Wallet Accounts

This is a **decision record** — it captures a design question we hit, the confusion it caused, and the reasoning that resolved it. Revisit this whenever someone asks "why does a wallet have a `ledgerAccountId`?"

## The Question

When we wired the Wallet to the Ledger, we gave each wallet a `ledgerAccountId` (the ledger account its balance projects from). But the specs are ambiguous about the ledger account model:

- The **chart of accounts** lists shared accounts: `2100 Customer Wallets`, `2200 Merchant Wallets` (one per *type*)
- The **ledger examples** show per-wallet accounts: `Samuel Wallet Liability`, `John Wallet Liability`

Which is right? One shared account for all wallets, or one account per wallet?

## The Two Options

**Option A — Shared account per type (literal chart reading):**
- All customer wallets post to one `2100 Customer Wallets` account
- No per-wallet ledger account; the wallet maps to its *type's* account
- Simpler, matches the chart literally, but...

**Option B — Per-wallet account (the examples' intent):**
- Every wallet gets its own liability account, provisioned under the type hierarchy
- The wallet stores its `ledgerAccountId` (what we already built)
- More accounts, but each wallet is individually attributable in the ledger

## The Tradeoff (why Option B is production-grade)

At a small scale, shared accounts seem fine. But as a *financial infrastructure platform* holding millions of wallets, shared accounts break on the things the spec itself requires:

| Requirement | Shared accounts | Per-wallet accounts |
|-------------|----------------|---------------------|
| **Reconciliation** (ledger vs wallet projection) | Only at aggregate level — can't reconcile per wallet | Reconcile per wallet ✓ |
| **Attribution / audit** ("show Samuel's ledger history") | Ledger can't answer — must rebuild from projections | Ledger answers directly ✓ |
| **Controls** (freeze Samuel's funds at the ledger layer) | Can't lock one wallet's share | Can lock the account ✓ |
| **Financial statements** (each wallet's liability) | Summed together | Itemized per wallet ✓ |

> **The ledger is the source of truth.** If the ledger can't tell you one wallet's balance, the "source of truth" claim is hollow — you'd be reconstructing truth from wallet projections.

## What Real Platforms Do

This is the decisive evidence. Atlas is modeled on:

- **Modern Treasury** — ledger accounts are provisioned per merchant/partner/counterparty
- **Stripe / Stripe Treasury** — each connected account gets its own financial accounts
- **Adyen, SurePay** — per-merchant accounts for payout and reconciliation

None of them dump all customer wallets into one liability bucket. The textbook chart of accounts is a **classification hierarchy**, not a "one row per type" rule. The hierarchy (1000/2000/4000/5000) is the *taxonomy*; the **leaf accounts are provisioned per business entity**.

## The Spec's Own Examples Agree

The ledger spec literally shows `Samuel Wallet Liability` and `John Wallet Liability` as distinct accounts. That's not casual shorthand — it's the mental model. The chart-of-accounts *listing* is a top-level template; the *examples* reveal the real design.

## The Resolution

- **Yes, per-wallet ledger accounts** (what we built) is the production-grade call.
- The **chart of accounts remains** as the classification hierarchy — it defines the types (asset/liability/etc.), codes, and place in the accounting equation that every wallet account is provisioned under. It's the schema, not the full account set.
- **Wallet creation auto-provisions** its ledger account (calls the Ledger, stores the returned `ledgerAccountId`) — no caller-supplied id.
- **Transfer reads accounts off the wallets** — the client no longer passes `sourceAccountId`/`destinationAccountId`; the saga resolves them from the wallets it fetches.
- **System accounts stay one-each**: bank, escrow, fees, refunds, earnings are created once and never per-entity. Only wallets provision leaves. See `23-ledger-two-tiers-and-money-flow.md` for the two-tier model and how money moves.

## The Code Changes (from this decision)

1. **Wallet API**: `GET /v1/wallets/:id` must expose `ledgerAccountId` (currently missing from the response)
2. **Wallet creation**: auto-provision the ledger account instead of accepting it in the request body
3. **Transfer DTO**: remove `sourceAccountId`/`destinationAccountId`
4. **Transfer saga**: fetch both wallets, read `.ledgerAccountId` off each, use in the journal postings
5. **Ledger posting**: unchanged — still records `journal_postings` with `account_id`, `direction`, `amount`

## Why This Is the "Right" Decision for Atlas

- It's what **production-grade fintech actually does** (Modern Treasury, Stripe)
- It **matches the spec's examples**, clarifying the ambiguous chart listing
- It keeps the **ledger as a true source of truth** — per-wallet reconciliation, attribution, and audit work
- It's **safer**: clients can't post to arbitrary accounts; the service resolves them

## The Meta-Lesson

We hit real confusion because a spec can be ambiguous — the *chart listing* and the *examples* pointed different ways. The way out wasn't "pick whichever the doc says" but **"what does the production system need to do?"** (reconcile, audit, attribute per wallet). When the spec is ambiguous, resolve it against production requirements and **document the decision** — which is what this file is.
