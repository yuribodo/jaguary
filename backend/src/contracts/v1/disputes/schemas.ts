import { z } from "zod";

import {
  identifierSchema,
  moneySchema,
  sha256Schema,
  utcRfc3339Schema,
} from "../common/primitives.js";

export const purchaseDisputeReasonSchema = z.enum(["UNRECOGNIZED_PURCHASE"]);
export const purchaseDisputeStatusSchema = z.enum(["RESOLVED"]);
export const purchaseDisputeVerdictSchema = z.enum(["AUTHORIZED", "UNAUTHORIZED"]);
export const purchaseDisputeLiablePartySchema = z.enum(["PRINCIPAL", "MERCHANT"]);
export const purchaseDisputeFinancialOutcomeSchema = z.enum([
  "NO_CHARGEBACK",
  "CHARGEBACK_RECORDED",
]);
export const purchaseDisputeResolutionCodeSchema = z.enum([
  "VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE",
  "AUTHORITY_EVIDENCE_INCOMPLETE",
]);

export const purchaseDisputeEvidenceChecksSchema = z.object({
  receipt_ownership_verified: z.boolean(),
  commercial_binding_verified: z.boolean(),
  mandate_authority_verified: z.boolean(),
  agent_identity_verified: z.boolean(),
  payment_approved_verified: z.boolean(),
  audit_chain_verified: z.boolean(),
}).strict();

export const purchaseDisputeEvidenceSchema = z.object({
  mandate_id: identifierSchema,
  agent_id: identifierSchema,
  checkout_id: identifierSchema,
  policy_version: z.string().min(1).max(64),
  amount: moneySchema,
  original_purchase_correlation_id: identifierSchema,
  checks: purchaseDisputeEvidenceChecksSchema,
  evidence_hash: sha256Schema,
}).strict();

export const openPurchaseDisputeInputSchema = z.object({
  reason: purchaseDisputeReasonSchema,
}).strict();

export const purchaseDisputeSchema = z.object({
  dispute_id: identifierSchema,
  receipt_id: identifierSchema,
  order_id: identifierSchema,
  authorization_id: identifierSchema,
  payment_id: identifierSchema,
  principal_id: identifierSchema,
  merchant_id: identifierSchema,
  reason: purchaseDisputeReasonSchema,
  status: purchaseDisputeStatusSchema,
  verdict: purchaseDisputeVerdictSchema,
  liable_party: purchaseDisputeLiablePartySchema,
  financial_outcome: purchaseDisputeFinancialOutcomeSchema,
  resolution_code: purchaseDisputeResolutionCodeSchema,
  evidence: purchaseDisputeEvidenceSchema,
  opened_at: utcRfc3339Schema,
  resolved_at: utcRfc3339Schema,
  audit_correlation_id: identifierSchema,
}).strict();

export type PurchaseDisputeReason = z.infer<typeof purchaseDisputeReasonSchema>;
export type PurchaseDisputeEvidenceChecks = z.infer<typeof purchaseDisputeEvidenceChecksSchema>;
export type PurchaseDisputeEvidence = z.infer<typeof purchaseDisputeEvidenceSchema>;
export type PurchaseDispute = z.infer<typeof purchaseDisputeSchema>;
export type PurchaseDisputeVerdict = z.infer<typeof purchaseDisputeVerdictSchema>;
export type PurchaseDisputeLiableParty = z.infer<typeof purchaseDisputeLiablePartySchema>;
export type PurchaseDisputeFinancialOutcome = z.infer<typeof purchaseDisputeFinancialOutcomeSchema>;
export type PurchaseDisputeResolutionCode = z.infer<typeof purchaseDisputeResolutionCodeSchema>;
