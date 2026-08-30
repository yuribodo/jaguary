import { z } from "zod";

import { moneySchema, identifierSchema, sha256Schema, utcRfc3339Schema } from "../common/primitives.js";
import { normalizedCheckoutSchema } from "../commerce/schemas.js";
import { agentTrustSnapshotSchema } from "../trust/schemas.js";

export const reasonCodeSchema = z.enum([
  "invalid_agent_signature",
  "agent_not_found",
  "agent_not_active",
  "agent_request_expired",
  "agent_request_not_yet_valid",
  "mandate_not_active",
  "mandate_revoked",
  "mandate_expired",
  "agent_not_authorized",
  "merchant_not_authorized",
  "checkout_integrity_failure",
  "scope_mismatch",
  "currency_mismatch",
  "amount_limit_exceeded",
  "aggregate_limit_exceeded",
  "usage_limit_exceeded",
  "replay_detected",
  "human_approval_required",
  "agent_attestation_required",
  "agent_attestation_pending",
  "agent_attestation_rejected",
  "agent_attestation_expired",
  "agent_attestation_revoked",
  "agent_attestation_binding_mismatch",
  "agent_attestation_provider_unavailable",
  "biometric_consent_required",
  "biometric_consent_pending",
  "biometric_consent_rejected",
  "biometric_consent_expired",
  "biometric_consent_binding_mismatch",
]);

export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const decisionSchema = z.enum(["ALLOW", "DENY", "ESCALATE"]);

export type Decision = z.infer<typeof decisionSchema>;

export const authorizationDecisionSchema = z
  .object({
    decision: decisionSchema,
    reasons: z.array(reasonCodeSchema),
    authorization_id: identifierSchema.optional(),
    policy_version: z.string().min(1).max(64),
    evidence_hash: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.decision === "ALLOW") !== (value.authorization_id !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "authorization_id must be present only for ALLOW decisions",
        path: ["authorization_id"],
      });
    }
    if (value.decision !== "ALLOW" && value.reasons.length === 0) {
      context.addIssue({
        code: "custom",
        message: "DENY and ESCALATE decisions require at least one reason",
        path: ["reasons"],
      });
    }
  });

export type AuthorizationDecision = z.infer<typeof authorizationDecisionSchema>;

export const authorizationUsageSchema = z
  .object({
    aggregate_spend: moneySchema,
    uses: z.number().int().safe().nonnegative(),
  })
  .strict();

export type AuthorizationUsage = z.infer<typeof authorizationUsageSchema>;

export const nonceStatusSchema = z.enum(["UNUSED", "USED"]);

export type NonceStatus = z.infer<typeof nonceStatusSchema>;

export const policyEvidenceInputsSchema = z
  .object({
    agent_id: identifierSchema.nullable(),
    agent_request_nonce: identifierSchema.nullable(),
    mandate_id: identifierSchema.nullable(),
    mandate_terms_hash: sha256Schema.nullable(),
    authorization_proof_hash: sha256Schema.nullable(),
    checkout_id: identifierSchema.nullable(),
    checkout_hash: sha256Schema.nullable(),
    evaluated_at: utcRfc3339Schema.nullable(),
    aggregate_spend: moneySchema.nullable(),
    uses: z.number().int().safe().nonnegative().nullable(),
    nonce_status: nonceStatusSchema.nullable(),
    human_approval_required: z.boolean().nullable(),
    trust_snapshot: agentTrustSnapshotSchema.nullable(),
  })
  .strict();

export type PolicyEvidenceInputs = z.infer<typeof policyEvidenceInputsSchema>;

export const policyEvaluationSchema = z
  .object({
    decision: decisionSchema,
    reasons: z.array(reasonCodeSchema),
    policy_version: z.string().min(1).max(64),
    evidence_inputs: policyEvidenceInputsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "ALLOW" && value.reasons.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "ALLOW decisions cannot contain reasons",
        path: ["reasons"],
      });
    }
    if (value.decision !== "ALLOW" && value.reasons.length === 0) {
      context.addIssue({
        code: "custom",
        message: "DENY and ESCALATE decisions require at least one reason",
        path: ["reasons"],
      });
    }
  });

export type PolicyEvaluation = z.infer<typeof policyEvaluationSchema>;

export const proofTypeSchema = z.enum(["AP2", "VISA_INSTRUCTION", "ACP_ALLOWANCE"]);

export const normalizedAuthorizationSchema = z
  .object({
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    mandate_id: identifierSchema,
    allowed_merchant_ids: z.array(identifierSchema).min(1),
    checkout_hash: sha256Schema,
    max_amount: moneySchema,
    expires_at: utcRfc3339Schema,
    max_uses: z.number().int().positive(),
    proof_type: proofTypeSchema,
    proof_reference: identifierSchema,
    proof_hash: sha256Schema,
  })
  .strict();

export type NormalizedAuthorization = z.infer<typeof normalizedAuthorizationSchema>;

export const authorizationStatusSchema = z.enum([
  "RESERVED",
  "PAYMENT_PENDING",
  "CONSUMED",
  "FAILED",
  "CANCELLED",
]);

export type AuthorizationStatus = z.infer<typeof authorizationStatusSchema>;

export const authorizationStatusTransitions: Readonly<Record<AuthorizationStatus, readonly AuthorizationStatus[]>> = {
  RESERVED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["CONSUMED", "FAILED"],
  CONSUMED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransitionAuthorization(
  from: AuthorizationStatus,
  to: AuthorizationStatus,
): boolean {
  return authorizationStatusTransitions[from].includes(to);
}

export const reservedAuthorizationSchema = z
  .object({
    authorization_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    checkout_hash: sha256Schema,
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    merchant_id: identifierSchema,
    reserved_amount: moneySchema,
    status: z.literal("RESERVED"),
    reserved_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
  })
  .strict();

export type ReservedAuthorization = z.infer<typeof reservedAuthorizationSchema>;

export const authorizedCheckoutSchema = z
  .object({
    checkout: normalizedCheckoutSchema,
    authorization: reservedAuthorizationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const { terms } = value.checkout;
    const { authorization } = value;
    const bindings: Array<[unknown, unknown, string]> = [
      [terms.checkout_id, authorization.checkout_id, "checkout_id"],
      [value.checkout.checkout_hash, authorization.checkout_hash, "checkout_hash"],
      [terms.merchant_id, authorization.merchant_id, "merchant_id"],
      [terms.total.amount, authorization.reserved_amount.amount, "amount"],
      [terms.total.currency, authorization.reserved_amount.currency, "currency"],
    ];
    for (const [checkoutValue, authorizationValue, field] of bindings) {
      if (checkoutValue !== authorizationValue) {
        context.addIssue({ code: "custom", message: `${field} binding mismatch` });
      }
    }
  });

export type AuthorizedCheckout = z.infer<typeof authorizedCheckoutSchema>;
