import "dotenv/config";

import { buildApp } from "./app.js";
import { ConfigurationError, loadEnv } from "./config/env.js";

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({
    corsOrigin: env.CORS_ORIGIN,
    databaseUrl: env.DATABASE_URL,
    logger: { level: env.LOG_LEVEL },
  });

  async function shutdown(signal: NodeJS.Signals) {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.HOST, port: env.PORT });
}

start().catch((error: unknown) => {
  const message = error instanceof ConfigurationError
    ? error.message
    : "Server startup failed. Check database availability and sanitized configuration.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
