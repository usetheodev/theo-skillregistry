import { defineConfig } from 'drizzle-kit';

const DEFAULT_PG_URI = 'postgresql://theoskill:theoskill@localhost:5432/theoskill';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './src/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['THEOSKILL_PG_URI'] ?? DEFAULT_PG_URI,
  },
  strict: true,
  verbose: true,
});
