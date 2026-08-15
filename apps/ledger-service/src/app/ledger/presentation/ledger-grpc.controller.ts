import { RpcException } from '@nestjs/microservices';
import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { AtlasError } from '@atlas/shared';
import { httpStatusToGrpcStatus } from '@atlas/grpc';
import { CreateAccountUseCase } from '../application/create-account.use-case.js';
import { GetBalanceUseCase } from '../application/get-balance.use-case.js';
import { PostJournalUseCase } from '../application/post-journal.use-case.js';

/**
 * Internal gRPC API for the Ledger Service.
 *
 * Serves the same use cases as the REST controller (`v1/ledger/*`) over gRPC
 * for service-to-service calls. Proto contract: `packages/protobuf/proto/ledger.proto`.
 */
@Controller()
export class LedgerGrpcController {
  constructor(
    private readonly createAccountUseCase: CreateAccountUseCase,
    private readonly postJournalUseCase: PostJournalUseCase,
    private readonly getBalanceUseCase: GetBalanceUseCase,
  ) {}

  @GrpcMethod('LedgerService', 'CreateAccount')
  async createAccount(@Payload() payload: CreateAccountRequest) {
    try {
      const { account } = await this.createAccountUseCase.execute({
        accountCode: payload.account_code,
        name: payload.name,
        type: payload.type as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
        currency: payload.currency as 'NGN',
      });
      return {
        id: account.id,
        account_code: account.accountCode,
        name: account.name,
        type: account.type,
        currency: account.currency,
        status: account.status,
      };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  @GrpcMethod('LedgerService', 'PostJournal')
  async postJournal(@Payload() payload: PostJournalRequest) {
    try {
      const result = await this.postJournalUseCase.execute({
        reference: payload.reference,
        description: payload.description || undefined,
        currency: payload.currency as 'NGN',
        postings: (payload.postings ?? []).map((p) => ({
          accountId: p.account_id,
          direction: p.direction as 'debit' | 'credit',
          amount: p.amount,
        })),
      });
      return {
        journal_id: result.journalId,
        reference: result.reference,
      };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  @GrpcMethod('LedgerService', 'GetBalance')
  async getBalance(@Payload() payload: GetBalanceRequest) {
    try {
      const result = await this.getBalanceUseCase.execute({
        accountId: payload.account_id,
      });
      return {
        account_id: result.account.id,
        account_code: result.account.accountCode,
        currency: result.account.currency,
        balance: result.balance,
      };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  private toRpc(err: unknown): RpcException {
    if (err instanceof AtlasError) {
      return new RpcException({
        code: httpStatusToGrpcStatus(err.statusCode),
        message: err.message,
      });
    }
    return new RpcException({ code: 13, message: 'internal error' });
  }
}

interface CreateAccountRequest {
  account_code: string;
  name: string;
  type: string;
  currency: string;
}

interface PostingRequest {
  account_id: string;
  direction: string;
  amount: number;
}

interface PostJournalRequest {
  reference: string;
  description?: string;
  currency: string;
  postings: PostingRequest[];
}

interface GetBalanceRequest {
  account_id: string;
}
