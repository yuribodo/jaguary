import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { databaseSchema } from "./schema.js";

declare module "fastify" {
  interface FastifyInstance {
    database: DatabaseConnection;
  }
}

export type DatabaseClient = NodePgDatabase<typeof databaseSchema>;
export type TransactionClient = DatabaseClient;

export interface TransactionManager {
  transaction<T>(callback: (transaction: TransactionClient) => Promise<T>): Promise<T>;
}

export interface DatabaseConnection extends TransactionManager {
  readonly db: DatabaseClient;
  checkHealth(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

async function runTransaction<T>(
  pool: Pool,
  callback: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const transaction = drizzle(client, { schema: databaseSchema });
    try {
      const result = await callback(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Transaction and rollback both failed");
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

export function createDatabase(options: DatabaseOptions): DatabaseConnection {
  const poolConfig: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
  };
  const pool = new Pool(poolConfig);
  const db = drizzle(pool, { schema: databaseSchema });

  return {
    db,
    transaction: (callback) => runTransaction(pool, callback),
    async checkHealth() {
      await pool.query("SELECT 1");
    },
    async close() {
      await pool.end();
    },
  };
}
