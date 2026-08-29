import type { FastifyPluginAsync } from "fastify";

export const rootRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({
    name: "Bound API",
    version: "0.1.0",
    health: "/health",
  }));
};
