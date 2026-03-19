import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as pgSchema from './schema.js';

const DEFAULT_POSTGRES_URL = 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';

type PostgresDb = PostgresJsDatabase<typeof pgSchema>;

interface DatabaseConnection {
  db: PostgresDb;
  schema: typeof pgSchema;
}

async function tryPostgresConnection(url: string): Promise<DatabaseConnection | null> {
  try {
    const client = postgres(url, {
      connect_timeout: 5,
      max: 10,
    });

    // Test the connection
    await client`SELECT 1`;

    console.log(`Connected to PostgreSQL: ${url.replace(/:[^:@]+@/, ':****@')}`);
    const db = drizzlePg(client, { schema: pgSchema });
    return { db, schema: pgSchema };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`PostgreSQL connection failed (${url.replace(/:[^:@]+@/, ':****@')}): ${message}`);
    return null;
  }
}

async function initDatabase(): Promise<DatabaseConnection> {
  const databaseUrl = process.env.DATABASE_URL;

  // Try configured DATABASE_URL first
  if (databaseUrl) {
    const connection = await tryPostgresConnection(databaseUrl);
    if (connection) return connection;
  }

  // Try localhost PostgreSQL as failover
  if (!databaseUrl || databaseUrl !== DEFAULT_POSTGRES_URL) {
    const connection = await tryPostgresConnection(DEFAULT_POSTGRES_URL);
    if (connection) return connection;
  }

  // No fallback - PostgreSQL is required
  throw new Error('PostgreSQL database is required. Please ensure DATABASE_URL is set or PostgreSQL is running on localhost:5432');
}

// Initialize database connection
const connection = await initDatabase();

export const db = connection.db;
export const schema = connection.schema;

// Re-export schema types
export * from './schema.js';
