import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
const defaultPostgresUrl = 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl || defaultPostgresUrl,
  },
});
