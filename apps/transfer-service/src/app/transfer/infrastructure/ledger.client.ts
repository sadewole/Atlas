import { Injectable } from '@nestjs/common';
import { createGrpcClient, grpcCall, GRPC_STATUS } from '@atlas/grpc';
import { LEDGER_PROTO_PATH } from '@atlas/protobuf';
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

interface LedgerServiceClient {
  PostJournal(request: {
    reference: string;
    description?: string;
    currency: string;
    postings: Array<{
      account_id: string;
      direction: string;
      amount: number;
    }>;
  }): Promise<{ journal_id: string; reference: string }>;
  GetBalance(request: { account_id: string }): Promise<{
    account_id: string;
    account_code: string;
    currency: string;
    balance: number;
  }>;
}

/**
 * gRPC client for the Ledger Service.
 *
 * Speaks to the ledger's internal gRPC API (`ledger.v1.LedgerService`).
 * REST is reserved for external consumers.
 */
@Injectable()
export class LedgerClient {
  private readonly client: LedgerServiceClient;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
    const stub = createGrpcClient({
      protoPath: LEDGER_PROTO_PATH,
      packageName: 'ledger.v1',
      serviceName: 'LedgerService',
      url,
    });
    const call = <Req, Res>(method: string, request: Req) =>
      grpcCall<Req, Res>(stub, method, request);
    this.client = {
      PostJournal: (request) =>
        call('postJournal', request),
      GetBalance: (request) =>
        call('getBalance', request),
    };
  }

  /** Post a balanced journal to the ledger. */
  async postJournal(input: PostJournalInput): Promise<PostJournalResult> {
    try {
      const res = await this.client.PostJournal({
        reference: input.reference,
        description: input.description,
        currency: input.currency,
        postings: input.postings.map((p) => ({
          account_id: p.accountId,
          direction: p.direction,
          amount: p.amount,
        })),
      });
      return { journalId: res.journal_id, reference: res.reference };
    } catch (err) {
      throw this.toError('post', err);
    }
  }

  /** Read an account's balance from the ledger. */
  async getBalance(accountId: string): Promise<{ balance: number }> {
    try {
      const res = await this.client.GetBalance({ account_id: accountId });
      return { balance: res.balance ?? 0 };
    } catch (err) {
      throw this.toError('balance', err);
    }
  }

  private toError(operation: string, err: unknown): LedgerServiceError {
    const message =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : `Ledger ${operation} failed`;
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === GRPC_STATUS.UNAVAILABLE
    ) {
      return new LedgerServiceError(`Ledger service unreachable (${this.url})`);
    }
    return new LedgerServiceError(`Ledger ${operation} failed: ${message}`);
  }
}
