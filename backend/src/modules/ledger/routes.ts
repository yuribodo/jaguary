import type { FastifyPluginAsync } from "fastify";

import { correlationIdSchema, PublicApiError } from "../../contracts/v1/index.js";

import type { AuditLedgerPort } from "./ports.js";

interface AuditRoutesOptions {
  ledger: Pick<AuditLedgerPort, "getTimeline">;
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (app, options) => {
  app.get<{ Params: { correlationId: string } }>("/audit/:correlationId", async (request) => {
    const correlationId = correlationIdSchema.safeParse(request.params.correlationId);
    if (!correlationId.success) {
      throw new PublicApiError(404, "not_found", "Audit timeline not found");
    }
    return options.ledger.getTimeline(correlationId.data);
  });
};
