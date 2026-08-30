import type { FastifyPluginAsync } from "fastify";

import { readSessionCookie, type PrincipalAuthService } from "../auth/index.js";
import type { PaymentCredentialReader } from "./credentials.js";

interface PaymentCredentialRoutesOptions {
  auth: Pick<PrincipalAuthService, "requireSession">;
  credentials: PaymentCredentialReader;
}

const paymentMethodSummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["credential_id", "network", "last_four", "label", "created_at", "updated_at"],
  properties: {
    credential_id: { type: "string" },
    network: { type: "string", enum: ["VISA", "MASTERCARD", "OTHER"] },
    last_four: { anyOf: [{ type: "string", pattern: "^[0-9]{4}$" }, { type: "null" }] },
    label: { type: "string", minLength: 1, maxLength: 64 },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
} as const;

export const paymentCredentialRoutes: FastifyPluginAsync<PaymentCredentialRoutesOptions> = async (app, options) => {
  app.get("/v1/payment-methods", {
    schema: {
      response: {
        200: { type: "array", items: paymentMethodSummaryJsonSchema },
      },
    },
  }, async (request) => {
    const session = await options.auth.requireSession(readSessionCookie(request.headers.cookie));
    return options.credentials.listForPrincipal(session.principal.principal_id);
  });
};
