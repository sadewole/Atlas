import { SUPPORTED_CURRENCIES } from '@atlas/shared';
import { z } from 'zod';

/** POST /v1/transfers */
export const createTransferSchema = z.object({
  reference: z.string().min(1),
  type: z.enum([
    'INTERNAL',
    'EXTERNAL',
    'BANK_TRANSFER',
    'MERCHANT_PAYMENT',
    'PAYOUT',
    'REFUND',
    'REVERSAL',
    'ESCROW',
    'SETTLEMENT',
    'FEE',
    'ADJUSTMENT',
  ]),
  sourceWalletId: z.string().min(1),
  destinationWalletId: z.string().min(1),
  currency: z.enum(SUPPORTED_CURRENCIES),
  amount: z.number().int().positive(),
  feeAmount: z.number().int().positive().optional(),
  description: z.string().optional(),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().optional(),
  // Ledger accounts are NOT caller-supplied — the saga resolves them from
  // the source/destination wallets (per the per-wallet account model).
});

export type CreateTransferDto = z.infer<typeof createTransferSchema>;
