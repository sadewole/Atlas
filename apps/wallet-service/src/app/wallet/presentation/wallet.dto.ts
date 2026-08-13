import { SUPPORTED_CURRENCIES } from '@atlas/shared';
import { z } from 'zod';

/** POST /v1/wallets */
export const createWalletSchema = z.object({
  ownerId: z.string().min(1),
  ownerType: z.enum(['USER', 'ORGANIZATION']),
  type: z.enum([
    'PERSONAL',
    'BUSINESS',
    'MERCHANT',
    'SYSTEM',
    'ESCROW',
    'SETTLEMENT',
    'FEE',
    'TREASURY',
  ]),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

/** POST /v1/wallets/:id/reserve */
export const reserveFundsSchema = z.object({
  reference: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  reason: z.string().optional(),
  expiresAt: z.iso.datetime().optional(),
});

/** POST /v1/wallets/:id/status */
export const changeStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'SUSPENDED', 'CLOSED']),
});

export type CreateWalletDto = z.infer<typeof createWalletSchema>;
export type ReserveFundsDto = z.infer<typeof reserveFundsSchema>;
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>;
