import "dotenv/config";

import { createDatabase } from "./database.js";
import { loadEnv } from "../config/env.js";
import { resetLocalDemoTransactions } from "../modules/travelbot/reset.js";

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === "production") throw new Error("Demo reset is disabled in production");
  const database = createDatabase({ connectionString: env.DATABASE_URL });
  try {
    await resetLocalDemoTransactions(database);
    process.stdout.write("Local demo transactional data reset completed.\n");
  } finally {
    await database.close();
  }
}

main().catch(() => {
  process.stderr.write("Local demo reset failed. Check sanitized database configuration and availability.\n");
  process.exitCode = 1;
});
