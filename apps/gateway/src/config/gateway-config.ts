import { z } from 'zod';
import { baseConfigSchema } from '@atlas/config';

/**
 * Gateway-specific configuration. Extends the base schema shared by all
 * services with gateway-only settings.
 */
export const gatewayConfigSchema = baseConfigSchema.extend({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  GATEWAY_GLOBAL_PREFIX: z.string().default('api'),
});

export type GatewayConfig = z.infer<typeof gatewayConfigSchema>;
