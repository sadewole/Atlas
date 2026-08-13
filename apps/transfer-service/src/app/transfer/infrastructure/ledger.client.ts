import { Injectable } from '@nestjs/common';
import { LedgerServiceError } from '../domain/index.js';

export interface PostJournalInput {
  reference: string;
  currency: string;
  description?: string;
  postings: Array<{
    accountId: string;
    direction: 'debit' | 'credit';
    amount: number;
  }>;
}

export interface PostJournalResult {
  journalId: string;
  reference: string;
}

/**
 * HTTP client for the Ledger Service.
 *
 * NOTE: this is the REST implementation. The plan is to swap this to gRPC as
 * the platform matures — consumers of this class shouldn't care which.
 */
@Injectable()
export class LedgerClient {
  constructor(private readonly baseUrl: string) {}

  /** Post a balanced journal to the ledger. */
  async postJournal(input: PostJournalInput): Promise<PostJournalResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/ledger/journals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new LedgerServiceError(`Ledger service unreachable (${this.baseUrl})`);
    }
    const body = (await res.json()) as {
      data?: { journalId?: string; reference?: string };
      error?: { message?: string; code?: string };
    };
    if (!res.ok) {
      throw new LedgerServiceError(
        body.error?.message ?? `Ledger post failed (${res.status})`,
      );
    }
    return {
      journalId: body.data?.journalId ?? '',
      reference: body.data?.reference ?? '',
    };
  }

  /** Read an account's balance from the ledger. */
  async getBalance(accountId: string): Promise<{ balance: number }> {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/v1/ledger/accounts/${accountId}/balance`,
      );
    } catch {
      throw new LedgerServiceError(`Ledger service unreachable (${this.baseUrl})`);
    }
    const body = (await res.json()) as {
      data?: { balance?: number };
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      throw new LedgerServiceError(
        body.error?.message ?? `Ledger balance failed (${res.status})`,
      );
    }
    return { balance: body.data.balance ?? 0 };
  }
}
