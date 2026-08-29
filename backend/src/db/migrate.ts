import "dotenv/config";

import { fileURLToPath, pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { loadEnv } from "../config/env.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const useTestDatabase = process.argv.includes("--test");
  const env = loadEnv({
    ...process.env,
    DATABASE_URL: useTestDatabase ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
  });
  await migrateDatabase(env.DATABASE_URL);
  process.stdout.write("Database migrations completed.\n");
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch(() => {
    process.stderr.write("Database migration failed. Check the sanitized database configuration and server availability.\n");
    process.exitCode = 1;
  });
}
