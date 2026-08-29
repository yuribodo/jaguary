import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  agentRequestProofSchema,
  normalizedAuthorizationSchema,
  normalizedCheckoutSchema,
  PublicApiError,
  type AuthorizationDecision,
} from "../../contracts/v1/index.js";

import type { VerifyRequest } from "./orchestrator.js";

export const BOUND_VERIFY_ROUTE = "/verify";

export const verifyRequestSchema: z.ZodType<VerifyRequest> = z.object({
  request_body: z.object({
    authorization: normalizedAuthorizationSchema,
    checkout: normalizedCheckoutSchema,
  }).strict(),
  proof: agentRequestProofSchema,
}).strict();

export interface VerifyHandler {
  verify(
    request: VerifyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<AuthorizationDecision>;
}

interface VerifyRoutesOptions {
  orchestrator: VerifyHandler;
}

export const verifyRoutes: FastifyPluginAsync<VerifyRoutesOptions> = async (app, options) => {
  app.post(BOUND_VERIFY_ROUTE, async (request) => {
    const parsed = verifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new PublicApiError(400, "validation_error", "Bound Verify request is invalid");
    }
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string") {
      throw new Error("HTTP conventions did not validate Idempotency-Key");
    }
    return options.orchestrator.verify(parsed.data, idempotencyKey, request.id);
  });
};
