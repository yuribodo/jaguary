import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import {
  identifierSchema,
  openPurchaseDisputeInputSchema,
  PublicApiError,
} from "../../contracts/v1/index.js";
import { readSessionCookie, type PrincipalAuthService } from "../auth/index.js";

import type { PurchaseDisputeService } from "./service.js";

interface PurchaseDisputeRoutesOptions {
  service: PurchaseDisputeService;
  auth: Pick<PrincipalAuthService, "requireSession">;
  allowedOrigin: string;
}

const identifierJsonSchema = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" } as const;
const moneyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["amount", "currency"],
  properties: {
    amount: { type: "integer", minimum: 0 },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
  },
} as const;
const evidenceChecksJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["receipt_ownership_verified", "commercial_binding_verified", "mandate_authority_verified", "agent_identity_verified", "payment_approved_verified", "audit_chain_verified"],
  properties: {
    receipt_ownership_verified: { type: "boolean" },
    commercial_binding_verified: { type: "boolean" },
    mandate_authority_verified: { type: "boolean" },
    agent_identity_verified: { type: "boolean" },
    payment_approved_verified: { type: "boolean" },
    audit_chain_verified: { type: "boolean" },
  },
} as const;
const purchaseDisputeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dispute_id", "receipt_id", "order_id", "authorization_id", "payment_id", "principal_id", "merchant_id", "reason", "status", "verdict", "liable_party", "financial_outcome", "resolution_code", "evidence", "opened_at", "resolved_at", "audit_correlation_id"],
  properties: {
    dispute_id: identifierJsonSchema,
    receipt_id: identifierJsonSchema,
    order_id: identifierJsonSchema,
    authorization_id: identifierJsonSchema,
    payment_id: identifierJsonSchema,
    principal_id: identifierJsonSchema,
    merchant_id: identifierJsonSchema,
    reason: { type: "string", enum: ["UNRECOGNIZED_PURCHASE"] },
    status: { type: "string", enum: ["RESOLVED"] },
    verdict: { type: "string", enum: ["AUTHORIZED", "UNAUTHORIZED"] },
    liable_party: { type: "string", enum: ["PRINCIPAL", "MERCHANT"] },
    financial_outcome: { type: "string", enum: ["NO_CHARGEBACK", "CHARGEBACK_RECORDED"] },
    resolution_code: { type: "string", enum: ["VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE", "AUTHORITY_EVIDENCE_INCOMPLETE"] },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["mandate_id", "agent_id", "checkout_id", "policy_version", "amount", "original_purchase_correlation_id", "checks", "evidence_hash"],
      properties: {
        mandate_id: identifierJsonSchema,
        agent_id: identifierJsonSchema,
        checkout_id: identifierJsonSchema,
        policy_version: { type: "string", minLength: 1, maxLength: 64 },
        amount: moneyJsonSchema,
        original_purchase_correlation_id: identifierJsonSchema,
        checks: evidenceChecksJsonSchema,
        evidence_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
    },
    opened_at: { type: "string", format: "date-time" },
    resolved_at: { type: "string", format: "date-time" },
    audit_correlation_id: identifierJsonSchema,
  },
} as const;

function identifier(value: string): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, "validation_error", "Identifier is invalid");
  return parsed.data;
}

function idempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string") throw new Error("HTTP conventions did not validate Idempotency-Key");
  return value;
}

async function mutablePrincipal(request: FastifyRequest, options: PurchaseDisputeRoutesOptions) {
  if (request.headers.origin !== options.allowedOrigin) {
    throw new PublicApiError(403, "invalid_request", "Request origin is not allowed");
  }
  const csrf = request.headers["x-csrf-token"];
  return options.auth.requireSession(
    readSessionCookie(request.headers.cookie),
    typeof csrf === "string" ? csrf : "",
  );
}

async function readPrincipal(request: FastifyRequest, options: PurchaseDisputeRoutesOptions) {
  return options.auth.requireSession(readSessionCookie(request.headers.cookie));
}

export const purchaseDisputeRoutes: FastifyPluginAsync<PurchaseDisputeRoutesOptions> = async (app, options) => {
  app.post<{ Params: { receiptId: string } }>("/v1/receipts/:receiptId/disputes", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["receiptId"], properties: { receiptId: identifierJsonSchema } },
      body: { type: "object", additionalProperties: false, required: ["reason"], properties: { reason: { type: "string", enum: ["UNRECOGNIZED_PURCHASE"] } } },
      response: { 200: purchaseDisputeJsonSchema, 201: purchaseDisputeJsonSchema },
    },
  }, async (request, reply) => {
    const receiptId = identifier(request.params.receiptId);
    const body = openPurchaseDisputeInputSchema.safeParse(request.body);
    if (!body.success) throw new PublicApiError(400, "validation_error", "Dispute request is invalid");
    const session = await mutablePrincipal(request, options);
    const result = await options.service.open({
      principalId: session.principal.principal_id,
      receiptId,
      reason: body.data.reason,
      idempotencyKey: idempotencyKey(request),
      correlationId: request.id,
    });
    return reply.code(result.replayed ? 200 : 201).send(result.dispute);
  });

  app.get<{ Params: { disputeId: string } }>("/v1/disputes/:disputeId", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["disputeId"], properties: { disputeId: identifierJsonSchema } },
      response: { 200: purchaseDisputeJsonSchema },
    },
  }, async (request) => {
    const session = await readPrincipal(request, options);
    return options.service.get(session.principal.principal_id, identifier(request.params.disputeId));
  });

  app.get<{ Params: { receiptId: string } }>("/v1/receipts/:receiptId/dispute", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["receiptId"], properties: { receiptId: identifierJsonSchema } },
      response: { 200: { anyOf: [purchaseDisputeJsonSchema, { type: "null" }] } },
    },
  }, async (request) => {
    const session = await readPrincipal(request, options);
    return options.service.getForReceipt(session.principal.principal_id, identifier(request.params.receiptId));
  });
};
