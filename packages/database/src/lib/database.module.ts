import { loadConfig } from '@atlas/config';
import { DynamicModule, Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import { createDatabaseClient, createPool, pingDatabase } from './connection.js';
import { postgresConfigSchema, toConnectionConfig } from './postgres-config.js';

/** DI token for the typed Drizzle client. */
export const DRIZZLE = Symbol('ATLAS_DRIZZLE');

/** DI token for the raw postgres.js pool (for raw SQL / health checks). */
export const POSTGRES_POOL = Symbol('ATLAS_POSTGRES_POOL');

export type DrizzleDatabase<TSchema extends Record<string, unknown>> =
  PostgresJsDatabase<TSchema>;

export interface DatabaseModuleOptions<TSchema extends Record<string, unknown>> {
  /**
   * The service's own schema — the object of tables Drizzle should know about.
   * Required: Atlas services own their data.
   */
  schema: TSchema;
  /** Config source, defaults to `process.env`. Overridable in tests. */
  source?: Record<string, unknown>;
}

/**
 * Global module that validates Postgres config, opens a connection pool, and
 * provides the typed Drizzle client and raw pool via DI.
 *
 * Usage in a service module:
 * ```ts
 * DatabaseModule.forRoot({ schema: { wallets, transfers } })
 * ```
 */
@Global()
@Module({})
export class DatabaseModule {
  static forRoot<TSchema extends Record<string, unknown>>(
    options: DatabaseModuleOptions<TSchema>,
  ): DynamicModule {
    const config = loadConfig(postgresConfigSchema, options.source);
    const pool = createPool(toConnectionConfig(config));
    const db = createDatabaseClient(pool, options.schema);

    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: DRIZZLE, useValue: db },
        { provide: POSTGRES_POOL, useValue: pool },
        { provide: DatabaseHealthService, useClass: DatabaseHealthService },
      ],
      exports: [DRIZZLE, POSTGRES_POOL, DatabaseHealthService],
    };
  }
}

/** Health probe + graceful pool shutdown, so services can gate /ready on the DB. */
export class DatabaseHealthService implements OnApplicationShutdown {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Sql) {}

  /** True when the database is reachable. */
  isHealthy(): Promise<boolean> {
    return pingDatabase(this.pool);
  }

  /** Close the pool on application shutdown. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
