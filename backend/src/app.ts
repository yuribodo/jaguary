import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import { type ClockPort, type SignerPort } from "./contracts/v1/index.js";
import { configureHttpConventions, generateCorrelationId } from "./http/conventions.js";
import { VuelaYaMerchant } from "./modules/vuelaya/merchant.js";
import { vuelaYaRoutes } from "./modules/vuelaya/routes.js";
import { EphemeralEs256Signer } from "./modules/vuelaya/signer.js";
import { healthRoutes } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  clock?: ClockPort;
  logger?: FastifyServerOptions["logger"];
  signer?: SignerPort;
}

const deterministicDemoClock: ClockPort = {
  now: () => new Date("2026-08-29T12:04:01.000Z"),
};

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
  const merchant = new VuelaYaMerchant(
    options.signer ?? new EphemeralEs256Signer(),
    options.clock ?? deterministicDemoClock,
  );
  await app.register(vuelaYaRoutes, { merchant });

  return app;
}
