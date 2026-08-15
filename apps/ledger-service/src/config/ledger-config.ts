import { z } from 'zod';
import { baseConfigSchema } from '@atlas/config';
import { postgresConfigSchema } from '@atlas/database';

/**
 * Ledger Service configuration. Extends the base schema with the service
 * port and Postgres settings (from @atlas/database).
 */
export const ledgerConfigSchema = baseConfigSchema
  .extend({
    LEDGER_PORT: z.coerce.number().int().positive().default(3001),
    /** Internal gRPC port (REST stays the external API). */
    LEDGER_GRPC_PORT: z.coerce.number().int().positive().default(50051),
  })
  .merge(postgresConfigSchema);

export type LedgerConfig = z.infer<typeof ledgerConfigSchema>;
