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
    /** Internal gRPC endpoint of the Ledger Service. */
    LEDGER_GRPC_URL: z.string().default('localhost:50051'),
    /** Internal gRPC port for this service (REST stays external). */
    GRPC_PORT: z.coerce.number().int().positive().default(50052),
  })
  .merge(postgresConfigSchema);

export type WalletServiceConfig = z.infer<typeof walletServiceConfigSchema>;
