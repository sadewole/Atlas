import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ChangeWalletStatusUseCase } from '../application/change-wallet-status.use-case.js';
import { CreateWalletUseCase } from '../application/create-wallet.use-case.js';
import { GetWalletUseCase } from '../application/get-wallet.use-case.js';
import { ReservationActionUseCase } from '../application/reservation-action.use-case.js';
import { ReserveFundsUseCase } from '../application/reserve-funds.use-case.js';
import {
  changeStatusSchema,
  createWalletSchema,
  reserveFundsSchema,
} from './wallet.dto.js';

/**
 * The Wallet's public API. A wallet is a business-rules facade over the
 * ledger — balances here are projections, not the source of truth.
 *
 *   POST   /v1/wallets                              create a wallet
 *   GET    /v1/wallets/:id                          read wallet + balances
 *   POST   /v1/wallets/:id/reserve                  hold funds (no money moves)
 *   POST   /v1/wallets/reservations/:id/capture     permanently debit reserved funds
 *   POST   /v1/wallets/reservations/:id/release     return reserved funds to available
 *   POST   /v1/wallets/reservations/:id/expire      auto-release a timed-out hold
 *   POST   /v1/wallets/:id/status                   freeze/unfreeze/suspend/close
 *
 * Balance math: available = ledgerBalance − reservedBalance.
 */
@Controller('v1/wallets')
export class WalletController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
    private readonly reserveFundsUseCase: ReserveFundsUseCase,
    private readonly reservationActionUseCase: ReservationActionUseCase,
    private readonly changeWalletStatusUseCase: ChangeWalletStatusUseCase,
  ) {}

  private fail(body: unknown) {
    throw new BadRequestException({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [],
      },
    });
  }

  /** Create a new wallet. Generates a human-readable wallet number. */
  @Post()
  async createWallet(@Body() body: unknown) {
    const parsed = createWalletSchema.safeParse(body);
    if (!parsed.success) return this.fail(body);
    const { wallet } = await this.createWalletUseCase.execute(parsed.data);
    return {
      data: {
        id: wallet.id,
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        ownerType: wallet.ownerType,
        type: wallet.type,
        currency: wallet.currency,
        status: wallet.status,
        ledgerBalance: wallet.ledgerBalance,
        reservedBalance: wallet.reservedBalance,
        availableBalance: wallet.availableBalance,
        version: wallet.version,
      },
    };
  }

  /** Read a wallet and its three balances (ledger, reserved, available). */
  @Get(':id')
  async getWallet(@Param('id') walletId: string) {
    const { wallet } = await this.getWalletUseCase.execute({ walletId });
    return {
      data: {
        id: wallet.id,
        walletNumber: wallet.walletNumber,
        ownerId: wallet.ownerId,
        ownerType: wallet.ownerType,
        type: wallet.type,
        currency: wallet.currency,
        status: wallet.status,
        ledgerBalance: wallet.ledgerBalance,
        reservedBalance: wallet.reservedBalance,
        availableBalance: wallet.availableBalance,
        version: wallet.version,
      },
    };
  }

  /** Hold `amount` out of the available balance. Money does NOT move yet. */
  @Post(':id/reserve')
  async reserve(@Param('id') walletId: string, @Body() body: unknown) {
    const parsed = reserveFundsSchema.safeParse(body);
    if (!parsed.success) return this.fail(body);
    const { reservation } = await this.reserveFundsUseCase.execute({
      walletId,
      ...parsed.data,
    });
    return {
      data: {
        id: reservation.id,
        walletId: reservation.walletId,
        reference: reservation.reference,
        amount: reservation.amount,
        currency: reservation.currency,
        status: reservation.status,
        expiresAt: reservation.expiresAt,
      },
    };
  }

  /** Permanently debit the reserved funds (money actually moves now). */
  @Post('reservations/:id/capture')
  async capture(@Param('id') reservationId: string) {
    const { reservation } =
      await this.reservationActionUseCase.capture({ reservationId });
    return { data: { id: reservation.id, status: reservation.status } };
  }

  /** Return the reserved funds to available (hold lifted, no money moved). */
  @Post('reservations/:id/release')
  async release(@Param('id') reservationId: string) {
    const { reservation } =
      await this.reservationActionUseCase.release({ reservationId });
    return { data: { id: reservation.id, status: reservation.status } };
  }

  /** Release a timed-out hold automatically (like release, for expiries). */
  @Post('reservations/:id/expire')
  async expire(@Param('id') reservationId: string) {
    const { reservation } =
      await this.reservationActionUseCase.expire({ reservationId });
    return { data: { id: reservation.id, status: reservation.status } };
  }

  /** Freeze / unfreeze / suspend / close the wallet (state machine enforced). */
  @Post(':id/status')
  async changeStatus(@Param('id') walletId: string, @Body() body: unknown) {
    const parsed = changeStatusSchema.safeParse(body);
    if (!parsed.success) return this.fail(body);
    const { wallet } = await this.changeWalletStatusUseCase.execute({
      walletId,
      nextStatus: parsed.data.status,
    });
    return { data: { id: wallet.id, status: wallet.status } };
  }
}
