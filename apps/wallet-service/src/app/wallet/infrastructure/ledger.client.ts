import { Injectable } from '@nestjs/common';
import { LedgerServiceError } from '../domain/wallet-errors.js';

export interface CreateLedgerAccountInput {
  accountCode: string;
  name: string;
  type: string;
  currency: string;
}

export interface CreateLedgerAccountResult {
  id: string;
  accountCode: string;
}

/**
 * HTTP client for the Ledger Service. Used by the wallet to provision its
 * ledger account on creation.
 *
 * NOTE: this is the REST implementation. The plan is to swap this to gRPC as
 * the platform matures — consumers shouldn't care which.
 */
@Injectable()
export class LedgerClient {
  constructor(private readonly baseUrl: string) {}

  /** Create a ledger account (e.g. a wallet's liability account). */
  async createAccount(
    input: CreateLedgerAccountInput,
  ): Promise<CreateLedgerAccountResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/ledger/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new LedgerServiceError(
        `Ledger service unreachable (${this.baseUrl})`,
      );
    }
    const body = (await res.json()) as {
      data?: { id?: string; accountCode?: string };
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      throw new LedgerServiceError(
        body.error?.message ?? `Ledger create account failed (${res.status})`,
      );
    }
    return {
      id: body.data.id ?? '',
      accountCode: body.data.accountCode ?? '',
    };
  }
}
