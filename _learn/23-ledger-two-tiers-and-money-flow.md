# 23 — Ledger Accounts: Two Tiers, and Where the Money Actually Lives

This document answers two questions that came up while building the per-wallet account model (see `22-ledger-account-model.md`):

1. **Do we create a new account for escrow, fees, revenue, refunds, etc. every time we face one?**
2. **If a wallet doesn't hold money, and every wallet creates a new account — how does money move, and where does it stay?**

The short answers: **no** (system accounts are created once, ever), and **money moves through journal entries and stays in asset accounts** — wallets are *claims*, not *vaults*. This document unpacks both.

## The Mental Model: The Ledger IS a Balance Sheet

Every ledger account is a row in the accounting equation:

```
Assets = Liabilities + Equity
```

- **Asset accounts** (1xxx) — things the platform owns: cash in the bank, settlement receivables.
- **Liability accounts** (2xxx) — what the platform owes: customer wallets.
- **Equity** (3xxx) — retained earnings, treasury.
- **Revenue** (4xxx) / **Expense** (5xxx) — income and costs, which ultimately flow into equity.

A wallet's ledger account is a **liability** because it represents an obligation: *"we owe this wallet's owner ₦X."* The wallet account does not hold a pile of money — it tracks a debt the platform owes.

## Tier 1: System Accounts (created ONCE)

The chart of accounts seed creates exactly **one** row per system account. These are the operating buckets of the business, and they are **never** recreated per wallet or per transaction.

| Account code | Name | Class | Purpose |
|--------------|------|-------|---------|
| 1110 | Main Bank Account | Asset | Where physical cash lives (external bank) |
| 1120 | Escrow Account | Asset | Funds held in escrow |
| 1200 | Settlement Receivables | Asset | Money owed to us by payment providers |
| 2100 | Customer Wallets | Liability | Classification header for personal/business wallets |
| 2200 | Merchant Wallets | Liability | Classification header for merchant wallets |
| 2300 | Outstanding Transfers | Liability | In-flight transfers |
| 3100 | Retained Earnings | Equity | Accumulated profit |
| 4100 | Processing Fees | Revenue | Fee income |
| 4200 | FX Revenue | Revenue | FX income |
| 5100 | Refunds | Expense | Money returned to customers |
| 5200 | Operational Costs | Expense | Platform operating costs |

**Key fact:** there is one `4100 Processing Fees` account in the whole ledger. Every fee from every wallet posts to it, and revenue reports read it directly. Same for refunds, escrow, and the bank.

## Tier 2: Leaf Accounts (created per business entity)

Only **wallets** get their own account. Each wallet creation auto-provisions a dedicated liability account, coded under its type's classification header:

```
PERSONAL / BUSINESS  →  2100-{CURRENCY}-{seq}   (customer wallets)
MERCHANT              →  2200-{CURRENCY}-{seq}
SYSTEM                →  2300-{CURRENCY}-{seq}
ESCROW                →  1120-{CURRENCY}-{seq}
SETTLEMENT            →  1200-{CURRENCY}-{seq}
FEE                   →  4100-{CURRENCY}-{seq}
TREASURY              →  3100-{CURRENCY}-{seq}
```

So `2100-NGN-19`, `2200-NGN-7`, `1120-NGN-3` are real leaf accounts, each belonging to exactly one wallet and reported against its type's header.

## The Rule of Thumb

| Kind | How many? | Example |
|------|-----------|---------|
| System account (bank, fees, refunds, escrow, earnings) | **One, ever** | `4100 Processing Fees` |
| Leaf account (wallet) | **One per wallet** | `2100-NGN-19` → wallet `ATL-NGN-0000000019-2` |

You create a **system** account once when bootstrapping the chart of accounts. You create a **leaf** account only when a new business entity (a wallet) comes into existence. Revenue, fees, and refunds are business *events*, not business *entities* — they post to existing system accounts and never get their own.

## How Money Moves (Worked Examples)

Every movement is a **balanced journal** (debits = credits). The wallet itself is never "touched" as a container — its ledger account is credited or debited.

### 1. Top-up — customer adds ₦50,000 from their bank

```
DEBIT  1110 Main Bank Account        50,000   (we now have more cash)
CREDIT 2100-NGN-19 (wallet liability) 50,000  (we owe the customer more)
```

Cash went **into** the bank (asset up), and the wallet's liability (what we owe) went up by the same amount. Balanced. The wallet's projected balance is now ₦50,000.

### 2. Transfer — Wallet A → Wallet B, ₦10,000

```
DEBIT  2100-NGN-19 (A's liability)   10,000   (we owe A less)
CREDIT 2100-NGN-20 (B's liability)   10,000   (we owe B more)
```

**No bank account is touched.** Cash didn't move at all — the total we owe is unchanged. We just changed *who* we owe. This is why a transfer between two wallets of the same platform is "internal": no external money movement, just a relabeling of obligations.

### 3. Fee — charge ₦500 on a wallet

```
DEBIT  2100-NGN-19 (wallet liability)   500
CREDIT 4100 Processing Fees (revenue)   500
```

We reduce what we owe the customer (their wallet balance drops) and recognize revenue. The fee account accumulates across every wallet — one row, millions of fees.

### 4. Payout — customer withdraws ₦20,000 to their external bank

```
DEBIT  2100-NGN-19 (wallet liability)   20,000   (we owe them less)
CREDIT 1110 Main Bank Account           20,000   (we send real cash out)
```

Here cash actually leaves the bank (asset down) and the customer's claim on us goes down. Money is leaving the platform.

### 5. Refund — return ₦3,000 of a fee

```
DEBIT  5100 Refunds (expense)           3,000
CREDIT 2100-NGN-19 (wallet liability)   3,000   (we owe the customer more)
```

The refund expense account accumulates; the customer's wallet balance is restored.

## Where Money Actually Lives

Money **physically lives in asset accounts** — the bank (1110), escrow (1120), settlement (1200). Wallet liability accounts record *claims on that cash*, not the cash itself.

This is why the sum of all wallet liabilities must never exceed cash on hand: if customers withdrew everything, the platform would need to produce the cash. The accounting equation enforces this automatically — you cannot credit a liability without debiting an asset somewhere.

## The Wallet Is a Projection (No Double-Holding)

Each wallet has a `ledgerAccountId` and a local `ledger_balance` column. That column is a **projection**, synced from the ledger via `JournalPosted` events (see `19-event-driven-sync.md`). The real number lives in the ledger; the wallet row is a cached read model for fast queries and business rules (reservations, holds).

So a wallet never "holds" money twice — it holds the *claim* (in the ledger) and a *cached copy of that claim* (its projection). The ledger is the source of truth; the projection is a convenience.

## The ESCROW / FEE Nuance

`ACCOUNT_CODE_BY_TYPE` maps `ESCROW → 1120`, `FEE → 4100`, `SETTLEMENT → 1200`, `TREASURY → 3100`. If you create a wallet **of type** ESCROW or FEE, it provisions a *per-wallet leaf* under that code prefix — the shared system account (`1120 Escrow Account`) and the per-wallet leaf (`1120-NGN-3`) are **separate rows**.

That's consistent with "leaf accounts per business entity," but it's a distinction worth keeping straight:

- The **system account** (`4100 Processing Fees`) is the reporting bucket for the business.
- A **FEE-type wallet's leaf** (`4100-NGN-7`) is a *specific counterparty's* fee pool.

If you'd rather treat escrow/fee purely as shared system accounts with **no** per-entity leaves, that mapping would need revisiting. For now the design provisions leaves per entity, which is what reconciliation wants.

## The Takeaway

- **System accounts: one each, forever.** Fees, refunds, escrow, revenue don't multiply with volume.
- **Leaf accounts: one per wallet.** Only business entities (wallets) provision new accounts.
- **Wallets are liabilities, not vaults.** They track what the platform owes.
- **Money moves via balanced journals**, staying in asset accounts; transfers between wallets just re-assign obligations without moving cash.
- **The wallet's balance is a projection** of its ledger account, never a second store of money.
