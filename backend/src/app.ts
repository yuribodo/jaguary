import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { createDatabase, type DatabaseConnection } from "./db/database.js";
import { configureHttpConventions, generateCorrelationId } from "./http/conventions.js";
import { healthRoutes } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  databaseUrl?: string;
  database?: DatabaseConnection;
  logger?: FastifyServerOptions["logger"];
}

const redactedLogPaths = [
  "DATABASE_URL",
  "databaseUrl",
  "connectionString",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.secret",
  "*.token",
  "*.pan",
  "*.cvv",
];

function loggerOptions(logger: BuildAppOptions["logger"]): FastifyServerOptions["logger"] {
  if (logger === false) return false;
  if (logger === undefined || logger === true) {
    return { redact: { paths: redactedLogPaths, censor: "[REDACTED]" } };
  }
  return {
    ...logger,
    redact: { paths: redactedLogPaths, censor: "[REDACTED]" },
  };
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: loggerOptions(options.logger),
    genReqId: generateCorrelationId,
  });

  const database = options.database
    ?? (options.databaseUrl === undefined
      ? undefined
      : createDatabase({ connectionString: options.databaseUrl }));

  if (database !== undefined) {
    try {
      await database.checkHealth();
    } catch (error) {
      await database.close();
      throw error;
    }
    app.decorate("database", database);
    app.addHook("onClose", async () => database.close());
  }

  configureHttpConventions(app);

  await app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:3000",
    credentials: true,
    exposedHeaders: ["x-correlation-id"],
  });

  await app.register(rootRoutes);
  await app.register(healthRoutes);

  return app;
}
