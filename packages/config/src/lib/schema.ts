import { z } from 'zod';

/**
 * Common environment variables shared by every Atlas service.
 * Individual services extend this with their own schema.
 */
export const baseConfigSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  SERVICE_NAME: z.string().min(1).default('atlas'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type BaseConfig = z.infer<typeof baseConfigSchema>;
