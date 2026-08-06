import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit config for generating and applying SQL migrations from the
 * example schema. Real services point `schema` at their OWN schema files.
 *
 * DATABASE_URL defaults to the Docker Compose local Postgres so the default
 * `pnpm db:generate` / `pnpm db:push` just work.
 */
export default defineConfig({
  schema: './src/lib/example-schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://atlas:atlas@localhost:5432/atlas',
  },
});
