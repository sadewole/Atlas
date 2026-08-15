import { Injectable } from '@nestjs/common';
import { createGrpcClient, grpcCall, GRPC_STATUS } from '@atlas/grpc';
import { LEDGER_PROTO_PATH } from '@atlas/protobuf';
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

interface LedgerServiceClient {
  CreateAccount(
    request: {
      account_code: string;
      name: string;
      type: string;
      currency: string;
    },
  ): Promise<{
    id: string;
    account_code: string;
    name: string;
    type: string;
    currency: string;
    status: string;
  }>;
}

/**
 * gRPC client for the Ledger Service. Used by the wallet to provision its
 * ledger account on creation.
 *
 * The wallet talks to the ledger's internal gRPC API (`ledger.v1.LedgerService`)
 * instead of REST — REST is reserved for external consumers.
 */
@Injectable()
export class LedgerClient {
  private readonly client: LedgerServiceClient & { close: () => void };
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
    const stub = createGrpcClient({
      protoPath: LEDGER_PROTO_PATH,
      packageName: 'ledger.v1',
      serviceName: 'LedgerService',
      url,
    });
    this.client = {
      CreateAccount: (request) =>
        grpcCall(stub, 'createAccount', request),
      close: () => stub.close(),
    };
  }

  /** Create a ledger account (e.g. a wallet's liability account). */
  async createAccount(
    input: CreateLedgerAccountInput,
  ): Promise<CreateLedgerAccountResult> {
    try {
      const response = await this.client.CreateAccount({
        account_code: input.accountCode,
        name: input.name,
        type: input.type,
        currency: input.currency,
      });
      return {
        id: response.id,
        accountCode: response.account_code,
      };
    } catch (err) {
      const message =
        typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Ledger create account failed';
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === GRPC_STATUS.UNAVAILABLE
      ) {
        throw new LedgerServiceError(
          `Ledger service unreachable (${this.url})`,
        );
      }
      throw new LedgerServiceError(`Ledger create account failed: ${message}`);
    }
  }
}
