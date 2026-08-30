import type { FastifyPluginAsync } from "fastify";

import { correlationIdSchema, PublicApiError } from "../../contracts/v1/index.js";
import { readSessionCookie, type PrincipalAuthService } from "../auth/index.js";

import type { AuditLedgerPort } from "./ports.js";

interface AuditRoutesOptions {
  ledger: Pick<AuditLedgerPort, "getTimeline">;
  auth?: Pick<PrincipalAuthService, "requireSession">;
  receipts?: {
    getReceipt(receiptId: string): Promise<unknown>;
    listReceipts?(principalId: string): Promise<unknown>;
  };
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (app, options) => {
  app.get<{ Params: { correlationId: string } }>("/audit/:correlationId", async (request) => {
    const correlationId = correlationIdSchema.safeParse(request.params.correlationId);
    if (!correlationId.success) {
      throw new PublicApiError(404, "not_found", "Audit timeline not found");
    }
    return options.ledger.getTimeline(correlationId.data);
  });
  const receipts = options.receipts;
  if (receipts !== undefined) {
    const listReceipts = receipts.listReceipts;
    const auth = options.auth;
    if (listReceipts !== undefined && auth !== undefined) {
      app.get("/receipts", async (request) => {
        const session = await auth.requireSession(readSessionCookie(request.headers.cookie));
        return listReceipts(session.principal.principal_id);
      });
    }
    app.get<{ Params: { id: string } }>("/receipts/:id", async (request) => {
      const receiptId = correlationIdSchema.safeParse(request.params.id);
      if (!receiptId.success) throw new PublicApiError(404, "not_found", "Receipt not found");
      return receipts.getReceipt(receiptId.data);
    });
  }
};
