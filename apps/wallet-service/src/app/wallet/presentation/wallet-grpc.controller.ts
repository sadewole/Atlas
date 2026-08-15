import { AtlasError } from '@atlas/shared';
import { httpStatusToGrpcStatus } from '@atlas/grpc';
import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload, RpcException } from '@nestjs/microservices';
import type { Currency } from '@atlas/shared';
import { GetWalletUseCase } from '../application/get-wallet.use-case.js';
import { ReservationActionUseCase } from '../application/reservation-action.use-case.js';
import { ReserveFundsUseCase } from '../application/reserve-funds.use-case.js';

/**
 * Internal gRPC API for the Wallet Service.
 *
 * Serves the operations the Transfer Service needs (reserve / capture /
 * release / getWallet) over gRPC. Proto contract:
 * `packages/protobuf/proto/wallet.proto`.
 */
@Controller()
export class WalletGrpcController {
  constructor(
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly reserveFundsUseCase: ReserveFundsUseCase,
    private readonly reservationActionUseCase: ReservationActionUseCase,
  ) {}

  @GrpcMethod('WalletService', 'GetWallet')
  async getWallet(@Payload() payload: GetWalletRequest) {
    try {
      const { wallet } = await this.getWalletUseCase.execute({
        walletId: payload.wallet_id,
      });
      return {
        id: wallet.id,
        wallet_number: wallet.walletNumber,
        owner_id: wallet.ownerId,
        owner_type: wallet.ownerType,
        type: wallet.type,
        currency: wallet.currency,
        status: wallet.status,
        ledger_balance: wallet.ledgerBalance,
        reserved_balance: wallet.reservedBalance,
        available_balance: wallet.availableBalance,
        ledger_account_id: wallet.ledgerAccountId ?? '',
      };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  @GrpcMethod('WalletService', 'Reserve')
  async reserve(@Payload() payload: ReserveRequest) {
    try {
      const { reservation } = await this.reserveFundsUseCase.execute({
        walletId: payload.wallet_id,
        reference: payload.reference,
        amount: payload.amount,
        currency: payload.currency as ReserveRequest['currency'],
        expiresAt: payload.expires_at || undefined,
      });
      return {
        id: reservation.id,
        wallet_id: reservation.walletId,
        status: reservation.status,
        expires_at: reservation.expiresAt ?? '',
      };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  @GrpcMethod('WalletService', 'Capture')
  async capture(@Payload() payload: CaptureRequest) {
    try {
      const { reservation } =
        await this.reservationActionUseCase.capture({
          reservationId: payload.reservation_id,
        });
      return { id: reservation.id, status: reservation.status };
    } catch (err) {
      throw this.toRpc(err);
    }
  }

  @GrpcMethod('WalletService', 'Release')
  async release(@Payload() payload: ReleaseRequest) {
    try {
      const { reservation } =
        await this.reservationActionUseCase.release({
          reservationId: payload.reservation_id,
        });
      return { id: reservation.id, status: reservation.status };
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

interface GetWalletRequest {
  wallet_id: string;
}

interface ReserveRequest {
  wallet_id: string;
  reference: string;
  amount: number;
  currency: Currency;
  expires_at?: string;
}

interface CaptureRequest {
  reservation_id: string;
}

interface ReleaseRequest {
  reservation_id: string;
}
