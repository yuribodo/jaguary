import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { type ClockPort, type SignerPort } from "./contracts/v1/index.js";
import { createDatabase, type DatabaseConnection } from "./db/database.js";
import { configureHttpConventions, generateCorrelationId } from "./http/conventions.js";
import { mandateRoutes, MandateService } from "./modules/mandates/index.js";
import { VuelaYaMerchant } from "./modules/vuelaya/merchant.js";
import { vuelaYaRoutes } from "./modules/vuelaya/routes.js";
import { EphemeralEs256Signer } from "./modules/vuelaya/signer.js";
import { healthRoutes } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  clock?: ClockPort;
  databaseUrl?: string;
  database?: DatabaseConnection;
  logger?: FastifyServerOptions["logger"];
  signer?: SignerPort;
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

const deterministicDemoClock: ClockPort = {
  now: () => new Date("2026-08-29T12:04:01.000Z"),
};

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
  const signer = options.signer ?? new EphemeralEs256Signer();
  const clock = options.clock ?? deterministicDemoClock;
  const merchant = new VuelaYaMerchant(signer, clock);
  await app.register(vuelaYaRoutes, { merchant });
  if (database !== undefined) {
    await app.register(mandateRoutes, {
      service: new MandateService(database, signer, clock),
    });
  }

  return app;
}
