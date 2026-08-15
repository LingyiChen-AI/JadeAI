import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/pg-schema.ts',
  out: './drizzle/pg-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
