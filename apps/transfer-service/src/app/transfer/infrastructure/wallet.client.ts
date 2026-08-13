import { Injectable } from '@nestjs/common';
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
}

/**
 * HTTP client for the Wallet Service.
 *
 * NOTE: this is the REST implementation. The plan is to swap this to gRPC as
 * the platform matures — consumers of this class shouldn't care which.
 */
@Injectable()
export class WalletClient {
  constructor(private readonly baseUrl: string) {}

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
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/v1/wallets/${walletId}/reserve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
    } catch {
      throw new WalletServiceError(`Wallet service unreachable (${this.baseUrl})`);
    }
    const body = (await res.json()) as {
      data?: { id?: string; status?: string };
      error?: { message?: string; code?: string };
    };
    if (!res.ok) {
      throw new WalletServiceError(
        body.error?.message ?? `Wallet reserve failed (${res.status})`,
      );
    }
    return {
      reservationId: body.data?.id ?? '',
      status: body.data?.status ?? '',
    };
  }

  /** Capture a reservation (permanently debit the reserved funds). */
  async capture(reservationId: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/v1/wallets/reservations/${reservationId}/capture`,
        { method: 'POST' },
      );
    } catch {
      throw new WalletServiceError(`Wallet service unreachable (${this.baseUrl})`);
    }
    if (!res.ok) {
      const body = (await res.json()) as { error?: { message?: string } };
      throw new WalletServiceError(
        body.error?.message ?? `Wallet capture failed (${res.status})`,
      );
    }
  }

  /** Release a reservation (return funds to available). */
  async release(reservationId: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/v1/wallets/reservations/${reservationId}/release`,
        { method: 'POST' },
      );
    } catch {
      throw new WalletServiceError(`Wallet service unreachable (${this.baseUrl})`);
    }
    if (!res.ok) {
      const body = (await res.json()) as { error?: { message?: string } };
      throw new WalletServiceError(
        body.error?.message ?? `Wallet release failed (${res.status})`,
      );
    }
  }

  /** Read a wallet's current balance and status. */
  async getWallet(walletId: string): Promise<WalletBalance> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/wallets/${walletId}`);
    } catch {
      throw new WalletServiceError(`Wallet service unreachable (${this.baseUrl})`);
    }
    const body = (await res.json()) as {
      data?: {
        id?: string;
        ledgerBalance?: number;
        reservedBalance?: number;
        availableBalance?: number;
        status?: string;
      };
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      throw new WalletServiceError(
        body.error?.message ?? `Wallet fetch failed (${res.status})`,
      );
    }
    return {
      walletId: body.data.id ?? walletId,
      ledgerBalance: body.data.ledgerBalance ?? 0,
      reservedBalance: body.data.reservedBalance ?? 0,
      availableBalance: body.data.availableBalance ?? 0,
      status: body.data.status ?? '',
    };
  }
}
