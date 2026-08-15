import { Injectable } from '@nestjs/common';
import { createGrpcClient, grpcCall, GRPC_STATUS } from '@atlas/grpc';
import { WALLET_PROTO_PATH } from '@atlas/protobuf';
import { WalletServiceError } from '../domain/index.js';

export interface ReserveFundsResult {
  reservationId: string;
  status: string;
}

export interface WalletBalance {
  walletId: string;
  ledgerBalance: number;
  reservedBalance: number;
  availableBalance: number;
  status: string;
  /** The wallet's dedicated ledger account (used to post journal entries). */
  ledgerAccountId?: string;
}

interface WalletServiceClient {
  Reserve(request: {
    wallet_id: string;
    reference: string;
    amount: number;
    currency: string;
    expires_at?: string;
  }): Promise<{ id: string; wallet_id: string; status: string; expires_at: string }>;
  Capture(request: { reservation_id: string }): Promise<{ id: string; status: string }>;
  Release(request: { reservation_id: string }): Promise<{ id: string; status: string }>;
  GetWallet(request: { wallet_id: string }): Promise<{
    id: string;
    wallet_number: string;
    owner_id: string;
    owner_type: string;
    type: string;
    currency: string;
    status: string;
    ledger_balance: number;
    reserved_balance: number;
    available_balance: number;
    ledger_account_id: string;
  }>;
}

/**
 * gRPC client for the Wallet Service.
 *
 * Speaks to the wallet's internal gRPC API (`wallet.v1.WalletService`).
 * REST is reserved for external consumers.
 */
@Injectable()
export class WalletClient {
  private readonly client: WalletServiceClient;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
    const stub = createGrpcClient({
      protoPath: WALLET_PROTO_PATH,
      packageName: 'wallet.v1',
      serviceName: 'WalletService',
      url,
    });
    const call = <Req, Res>(method: string, request: Req) =>
      grpcCall<Req, Res>(stub, method, request);
    this.client = {
      Reserve: (request) =>
        call('reserve', request),
      Capture: (request) =>
        call('capture', request),
      Release: (request) =>
        call('release', request),
      GetWallet: (request) =>
        call('getWallet', request),
    };
  }

  /** Reserve funds on a wallet. Returns the created reservation. */
  async reserve(
    walletId: string,
    input: {
      reference: string;
      amount: number;
      currency: string;
      expiresAt?: string;
    },
  ): Promise<ReserveFundsResult> {
    try {
      const res = await this.client.Reserve({
        wallet_id: walletId,
        reference: input.reference,
        amount: input.amount,
        currency: input.currency,
        expires_at: input.expiresAt,
      });
      return { reservationId: res.id, status: res.status };
    } catch (err) {
      throw this.toError('reserve', err);
    }
  }

  /** Capture a reservation (permanently debit the reserved funds). */
  async capture(reservationId: string): Promise<void> {
    try {
      await this.client.Capture({ reservation_id: reservationId });
    } catch (err) {
      throw this.toError('capture', err);
    }
  }

  /** Release a reservation (return funds to available). */
  async release(reservationId: string): Promise<void> {
    try {
      await this.client.Release({ reservation_id: reservationId });
    } catch (err) {
      throw this.toError('release', err);
    }
  }

  /** Read a wallet's current balance and status. */
  async getWallet(walletId: string): Promise<WalletBalance> {
    try {
      const res = await this.client.GetWallet({ wallet_id: walletId });
      return {
        walletId: res.id ?? walletId,
        ledgerBalance: res.ledger_balance ?? 0,
        reservedBalance: res.reserved_balance ?? 0,
        availableBalance: res.available_balance ?? 0,
        status: res.status ?? '',
        ledgerAccountId: res.ledger_account_id || undefined,
      };
    } catch (err) {
      throw this.toError('getWallet', err);
    }
  }

  private toError(operation: string, err: unknown): WalletServiceError {
    const message =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : `Wallet ${operation} failed`;
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === GRPC_STATUS.UNAVAILABLE
    ) {
      return new WalletServiceError(`Wallet service unreachable (${this.url})`);
    }
    return new WalletServiceError(`Wallet ${operation} failed: ${message}`);
  }
}
