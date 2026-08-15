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
    /** Internal gRPC endpoints of the Wallet and Ledger services. */
    WALLET_GRPC_URL: z.string().default('localhost:50052'),
    LEDGER_GRPC_URL: z.string().default('localhost:50051'),
  })
  .merge(postgresConfigSchema);

export type TransferServiceConfig = z.infer<typeof transferServiceConfigSchema>;
