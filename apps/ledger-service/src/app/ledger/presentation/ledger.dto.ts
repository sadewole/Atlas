import { SUPPORTED_CURRENCIES } from '@atlas/shared';
import { z } from 'zod';

/** Request body for POST /v1/ledger/accounts */
export const createAccountSchema = z.object({
  accountCode: z.string().min(1).max(20),
  name: z.string().min(1),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  currency: z.enum(SUPPORTED_CURRENCIES),
});

/** Request body for POST /v1/ledger/journals */
export const postJournalSchema = z.object({
  reference: z.string().min(1),
  description: z.string().optional(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  postings: z
    .array(
      z.object({
        accountId: z.string().min(1),
        direction: z.enum(['debit', 'credit']),
        amount: z.number().int().positive(),
      }),
    )
    .min(2),
});

export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type PostJournalDto = z.infer<typeof postJournalSchema>;
