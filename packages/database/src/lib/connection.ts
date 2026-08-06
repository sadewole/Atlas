import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

/**
 * Postgres connection settings. Derived from the `POSTGRES_*` config values
 * (see {@link postgresConfigSchema}) or provided directly for tests.
 */
export interface PostgresConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Max connections in the pool. Defaults to 10. */
  max?: number;
  /** Use TLS. Defaults to false (local dev). */
  ssl?: boolean;
}

/**
 * Create a postgres.js connection pool.
 *
 * `postgres` is the driver underneath Drizzle — a single tagged-template
 * connection that lets you drop down to raw SQL whenever you need it
 * (learning, debugging, or an operation Drizzle doesn't model yet).
 */
export function createPool(config: PostgresConnectionConfig): Sql {
  return postgres({
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    database: config.database,
    max: config.max ?? 10,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Wrap a pool in a typed Drizzle client.
 *
 * `schema` is the object of tables this service owns. Drizzle maps your
 * table definitions onto the live database and types every query against them.
 */
export function createDatabaseClient<TSchema extends Record<string, unknown>>(
  pool: Sql,
  schema: TSchema,
): PostgresJsDatabase<TSchema> {
  return drizzle(pool, { schema });
}

/** Run `SELECT 1` against the pool. True when the database is reachable. */
export async function pingDatabase(pool: Sql): Promise<boolean> {
  try {
    await pool`select 1`;
    return true;
  } catch {
    return false;
  }
}
