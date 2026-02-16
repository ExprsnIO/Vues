import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
const defaultPostgresUrl = 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';

// Determine dialect based on DATABASE_URL or default to PostgreSQL
const isPostgres = databaseUrl?.startsWith('postgresql://') ||
  databaseUrl?.startsWith('postgres://') ||
  !process.env.USE_SQLITE;

export default defineConfig(
  isPostgres
    ? {
        schema: './src/db/schema.ts',
        out: './drizzle',
        dialect: 'postgresql',
        dbCredentials: {
          url: databaseUrl || defaultPostgresUrl,
        },
      }
    : {
        schema: './src/db/schema.sqlite.ts',
        out: './drizzle-sqlite',
        dialect: 'sqlite',
        dbCredentials: {
          url: './data/exprsn.db',
        },
      }
);
