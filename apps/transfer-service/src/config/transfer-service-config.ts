import { baseConfigSchema } from '@atlas/config';
import { postgresConfigSchema } from '@atlas/database';
import { z } from 'zod';

/**
 * TransferService configuration. Extends the base schema with the service
 * port and Postgres settings (from @atlas/database).
 */
export const transferServiceConfigSchema = baseConfigSchema
  .extend({
    SERVICE_PORT: z.coerce.number().int().positive().default(3003),
    WALLET_SERVICE_URL: z.string().default('http://localhost:3002'),
    LEDGER_SERVICE_URL: z.string().default('http://localhost:3001'),
  })
  .merge(postgresConfigSchema);

export type TransferServiceConfig = z.infer<typeof transferServiceConfigSchema>;
