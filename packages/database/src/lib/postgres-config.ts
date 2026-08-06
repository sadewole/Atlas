import { baseConfigSchema } from '@atlas/config';
import { z } from 'zod';

/**
 * Postgres configuration shared by every Atlas service that owns data.
 * Extends the base schema with `POSTGRES_*` connection settings.
 *
 * Defaults match the Docker Compose local development values so a fresh
 * clone works without editing anything.
 */
export const postgresConfigSchema = baseConfigSchema.extend({
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().default('atlas'),
  POSTGRES_PASSWORD: z.string().default('atlas'),
  POSTGRES_DB: z.string().default('atlas'),
  POSTGRES_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  POSTGRES_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export type PostgresConfig = z.infer<typeof postgresConfigSchema>;

/** Map validated config into the shape the connection layer expects. */
export function toConnectionConfig(
  config: PostgresConfig,
): import('./connection.js').PostgresConnectionConfig {
  return {
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DB,
    max: config.POSTGRES_POOL_MAX,
    ssl: config.POSTGRES_SSL,
  };
}
