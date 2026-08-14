import { baseConfigSchema } from '@atlas/config';
import { postgresConfigSchema } from '@atlas/database';
import { z } from 'zod';

/**
 * WalletService configuration. Extends the base schema with the service
 * port and Postgres settings (from @atlas/database).
 */
export const walletServiceConfigSchema = baseConfigSchema
  .extend({
    SERVICE_PORT: z.coerce.number().int().positive().default(3002),
    LEDGER_SERVICE_URL: z.string().default('http://localhost:3001'),
  })
  .merge(postgresConfigSchema);

export type WalletServiceConfig = z.infer<typeof walletServiceConfigSchema>;
