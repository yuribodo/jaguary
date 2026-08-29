import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { configureHttpConventions, generateCorrelationId } from "./http/conventions.js";
import { healthRoutes } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: generateCorrelationId,
  });

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
