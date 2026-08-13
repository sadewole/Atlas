import { defineConfig } from 'drizzle-kit';

/** Drizzle Kit config for the Transfer Service schema. */
export default defineConfig({
  schema: './src/app/transfer/infrastructure/transfer-schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://atlas:atlas@localhost:5432/atlas',
  },
});
