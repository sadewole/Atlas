import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config for the Ledger Service schema.
 *
 * DATABASE_URL defaults to the Docker Compose local Postgres so the default
 * `pnpm db:generate` / `pnpm db:push` just work.
 */
export default defineConfig({
  schema: './src/app/ledger/infrastructure/ledger-schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://atlas:atlas@localhost:5432/atlas',
  },
});
