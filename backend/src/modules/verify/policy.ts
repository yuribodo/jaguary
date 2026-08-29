import { z } from "zod";

import {
  agentIdentitySchema,
  mandateSchema,
  moneySchema,
  normalizedAuthorizationSchema,
  normalizedCheckoutSchema,
  nonceStatusSchema,
  policyEvaluationSchema,
  sha256CanonicalJson,
  utcRfc3339Schema,
  verifiedAgentRequestSchema,
  type AgentIdentity,
  type AuthorizationUsage,
  type Mandate,
  type NormalizedAuthorization,
  type NormalizedCheckout,
  type NonceStatus,
  type PolicyEvaluation,
  type PolicyEvidenceInputs,
  type ReasonCode,
  type UtcRfc3339,
  type VerifiedAgentRequest,
} from "../../contracts/v1/index.js";

export const VERIFY_POLICY_VERSION = "bound.verify.v1";

export interface VerifyPolicyInput {
  agent: AgentIdentity;
  agent_request: VerifiedAgentRequest;
  mandate: Mandate;
  mandate_signature_valid: boolean;
  authorization: NormalizedAuthorization;
  checkout: NormalizedCheckout;
  checkout_signature_valid: boolean;
  human_approval_required: boolean;
  now: UtcRfc3339;
  usage: AuthorizationUsage;
  nonce_status: NonceStatus;
}

export type VerifyEvidenceInputs = PolicyEvidenceInputs;
export type VerifyPolicyResult = PolicyEvaluation;

const nonnegativeSafeIntegerSchema = z.number().int().safe().nonnegative();
const policyInputKeys = new Set<keyof VerifyPolicyInput>([
  "agent",
  "agent_request",
  "mandate",
  "mandate_signature_valid",
  "authorization",
  "checkout",
  "checkout_signature_valid",
  "human_approval_required",
  "now",
  "usage",
  "nonce_status",
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseValue<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const result = schema.safeParse(value);
  if (!result.success) return undefined;
  return result.data;
}

interface ParsedPolicyInput {
  raw: Record<string, unknown>;
  agent: AgentIdentity | undefined;
  agentRequest: VerifiedAgentRequest | undefined;
  mandate: Mandate | undefined;
  mandateSignatureValid: boolean | undefined;
  authorization: NormalizedAuthorization | undefined;
  checkout: NormalizedCheckout | undefined;
  checkoutSignatureValid: boolean | undefined;
  humanApprovalRequired: boolean | undefined;
  nowValue: UtcRfc3339 | undefined;
  aggregateSpend: AuthorizationUsage["aggregate_spend"] | undefined;
  uses: number | undefined;
  nonceStatus: NonceStatus | undefined;
}

type AddReason = (reason: ReasonCode) => void;

function parsePolicyInput(input: unknown): ParsedPolicyInput {
  const raw = asRecord(input);
  const usage = asRecord(raw.usage);
  return {
    raw,
    agent: parseValue(agentIdentitySchema, raw.agent),
    agentRequest: parseValue(verifiedAgentRequestSchema, raw.agent_request),
    mandate: parseValue(mandateSchema, raw.mandate),
    mandateSignatureValid: parseValue(z.boolean(), raw.mandate_signature_valid),
    authorization: parseValue(normalizedAuthorizationSchema, raw.authorization),
    checkout: parseValue(normalizedCheckoutSchema, raw.checkout),
    checkoutSignatureValid: parseValue(z.boolean(), raw.checkout_signature_valid),
    humanApprovalRequired: parseValue(z.boolean(), raw.human_approval_required),
    nowValue: parseValue(utcRfc3339Schema, raw.now),
    aggregateSpend: parseValue(moneySchema, usage.aggregate_spend),
    uses: parseValue(nonnegativeSafeIntegerSchema, usage.uses),
    nonceStatus: parseValue(nonceStatusSchema, raw.nonce_status),
  };
}

function hasUnknownInputField(raw: Record<string, unknown>): boolean {
  return Object.keys(raw).some((key) => !policyInputKeys.has(key as keyof VerifyPolicyInput));
}

function hasInvalidAgentProofBinding(input: ParsedPolicyInput): boolean {
  const { agent, agentRequest } = input;
  if (agent === undefined || agentRequest === undefined) return false;
  return agent.verification_key.key_id !== agentRequest.key_id
    || agent.build_fingerprint !== agentRequest.build_fingerprint;
}

function evaluateAgent(input: ParsedPolicyInput, addReason: AddReason): void {
  if (
    input.agentRequest === undefined
    || hasUnknownInputField(input.raw)
    || hasInvalidAgentProofBinding(input)
  ) {
    addReason("invalid_agent_signature");
  }
  if (input.agent === undefined) {
    addReason("agent_not_found");
    return;
  }
  if (input.agent.status !== "ACTIVE") addReason("agent_not_active");
}

function activeMandateIsInvalid(input: ParsedPolicyInput): boolean {
  const { authorization, mandate, mandateSignatureValid } = input;
  if (mandate?.status !== "ACTIVE" || authorization === undefined) return true;
  return !mandate.authority_valid
    || mandateSignatureValid !== true
    || sha256CanonicalJson(mandate.terms) !== mandate.terms_hash
    || authorization.mandate_id !== mandate.terms.mandate_id;
}

function evaluateMandate(input: ParsedPolicyInput, addReason: AddReason): void {
  const { authorization, mandate } = input;
  if (mandate === undefined || authorization === undefined) {
    addReason("mandate_not_active");
    return;
  }
  if (mandate.status === "REVOKED") {
    addReason("mandate_revoked");
    return;
  }
  if (mandate.status === "EXPIRED") {
    addReason("mandate_expired");
    return;
  }
  if (activeMandateIsInvalid(input)) addReason("mandate_not_active");
}

function hasIdentityBindingMismatch(input: ParsedPolicyInput): boolean {
  const { agent, agentRequest, authorization, mandate } = input;
  if (
    agent === undefined
    || agentRequest === undefined
    || authorization === undefined
    || mandate === undefined
  ) return false;
  return agent.agent_id !== agentRequest.agent_id
    || agent.agent_id !== mandate.terms.agent_id
    || agent.agent_id !== authorization.agent_id
    || agent.principal_id !== mandate.terms.principal_id
    || agent.principal_id !== authorization.principal_id;
}

function evaluateIdentityBinding(input: ParsedPolicyInput, addReason: AddReason): void {
  if (hasIdentityBindingMismatch(input)) addReason("agent_not_authorized");
}

function evaluateMerchant(input: ParsedPolicyInput, addReason: AddReason): void {
  const { authorization, checkout, mandate } = input;
  if (authorization === undefined || checkout === undefined || mandate === undefined) return;
  const merchantId = checkout.terms.merchant_id;
  if (
    !mandate.terms.allowed_merchant_ids.includes(merchantId)
    || !authorization.allowed_merchant_ids.includes(merchantId)
  ) addReason("merchant_not_authorized");
}

function checkoutIntegrityIsInvalid(input: ParsedPolicyInput): boolean {
  const { authorization, checkout, checkoutSignatureValid } = input;
  if (checkout === undefined || checkoutSignatureValid !== true) return true;
  if (sha256CanonicalJson(checkout.terms) !== checkout.checkout_hash) return true;
  return authorization !== undefined && authorization.checkout_hash !== checkout.checkout_hash;
}

function evaluateCheckoutIntegrity(input: ParsedPolicyInput, addReason: AddReason): void {
  if (checkoutIntegrityIsInvalid(input)) addReason("checkout_integrity_failure");
}

function evaluateScope(input: ParsedPolicyInput, addReason: AddReason): void {
  const { checkout, mandate } = input;
  if (checkout === undefined || mandate === undefined) return;
  const fulfillment = checkout.terms.fulfillment;
  if (
    fulfillment.origin !== mandate.terms.route.origin
    || fulfillment.destination !== mandate.terms.route.destination
    || fulfillment.cabin !== mandate.terms.cabin
  ) addReason("scope_mismatch");
}

function evaluateAmount(input: ParsedPolicyInput, addReason: AddReason): void {
  const { authorization, checkout, mandate } = input;
  if (authorization === undefined || checkout === undefined || mandate === undefined) return;
  const amount = checkout.terms.total.amount;
  if (
    amount > mandate.terms.max_per_purchase.amount
    || amount > authorization.max_amount.amount
  ) addReason("amount_limit_exceeded");
}

function evaluateCurrency(input: ParsedPolicyInput, addReason: AddReason): void {
  const { aggregateSpend, authorization, checkout, mandate } = input;
  if (
    aggregateSpend === undefined
    || authorization === undefined
    || checkout === undefined
    || mandate === undefined
  ) return;
  const expected = mandate.terms.max_per_purchase.currency;
  if (
    checkout.terms.total.currency !== expected
    || mandate.terms.max_aggregate.currency !== expected
    || authorization.max_amount.currency !== expected
    || aggregateSpend.currency !== expected
  ) addReason("currency_mismatch");
}

function evaluateAgentValidity(
  agentRequest: VerifiedAgentRequest | undefined,
  now: number,
  addReason: AddReason,
): void {
  if (agentRequest === undefined) return;
  if (now >= Date.parse(agentRequest.expires_at)) {
    addReason("agent_request_expired");
    return;
  }
  if (now < Date.parse(agentRequest.issued_at)) addReason("agent_request_not_yet_valid");
}

function evaluateMandateValidity(input: ParsedPolicyInput, now: number, addReason: AddReason): void {
  const { authorization, mandate } = input;
  if (authorization === undefined || mandate?.status !== "ACTIVE") return;
  if (
    now >= Date.parse(mandate.terms.expires_at)
    || now >= Date.parse(authorization.expires_at)
  ) {
    addReason("mandate_expired");
    return;
  }
  if (
    now < Date.parse(mandate.terms.valid_from)
    || now < Date.parse(mandate.activated_at)
  ) addReason("mandate_not_active");
}

function evaluateCheckoutValidity(
  checkout: NormalizedCheckout | undefined,
  now: number,
  addReason: AddReason,
): void {
  if (checkout === undefined) return;
  if (
    now < Date.parse(checkout.terms.created_at)
    || now >= Date.parse(checkout.terms.expires_at)
  ) addReason("checkout_integrity_failure");
}

function evaluateValidity(input: ParsedPolicyInput, addReason: AddReason): void {
  if (input.nowValue === undefined) {
    addReason("mandate_not_active");
    return;
  }
  const now = Date.parse(input.nowValue);
  evaluateAgentValidity(input.agentRequest, now, addReason);
  evaluateMandateValidity(input, now, addReason);
  evaluateCheckoutValidity(input.checkout, now, addReason);
}

function evaluateAggregateSpend(input: ParsedPolicyInput, addReason: AddReason): void {
  const { aggregateSpend, checkout, mandate } = input;
  if (aggregateSpend === undefined) {
    addReason("aggregate_limit_exceeded");
    return;
  }
  if (checkout === undefined || mandate === undefined) return;
  const aggregateAmount = aggregateSpend.amount + checkout.terms.total.amount;
  if (
    !Number.isSafeInteger(aggregateAmount)
    || aggregateAmount > mandate.terms.max_aggregate.amount
  ) addReason("aggregate_limit_exceeded");
}

function evaluateAggregateUses(input: ParsedPolicyInput, addReason: AddReason): void {
  const { authorization, mandate, uses } = input;
  if (uses === undefined) {
    addReason("usage_limit_exceeded");
    return;
  }
  if (authorization === undefined || mandate === undefined) return;
  const aggregateUses = uses + 1;
  if (
    !Number.isSafeInteger(aggregateUses)
    || aggregateUses > mandate.terms.max_uses
    || aggregateUses > authorization.max_uses
  ) addReason("usage_limit_exceeded");
}

function evaluateNonce(nonceStatus: NonceStatus | undefined, addReason: AddReason): void {
  if (nonceStatus === undefined || nonceStatus === "USED") addReason("replay_detected");
}

function mandateTermsHash(mandate: Mandate | undefined): string | null {
  if (mandate === undefined || !("terms_hash" in mandate)) return null;
  return mandate.terms_hash;
}

function decisionFor(denied: boolean, humanApprovalRequired: boolean | undefined) {
  if (denied) return "DENY" as const;
  if (humanApprovalRequired) return "ESCALATE" as const;
  return "ALLOW" as const;
}

function evidenceFor(input: ParsedPolicyInput): VerifyEvidenceInputs {
  return {
    agent_id: input.agent?.agent_id ?? null,
    agent_request_nonce: input.agentRequest?.nonce ?? null,
    mandate_id: input.mandate?.terms.mandate_id ?? null,
    mandate_terms_hash: mandateTermsHash(input.mandate),
    authorization_proof_hash: input.authorization?.proof_hash ?? null,
    checkout_id: input.checkout?.terms.checkout_id ?? null,
    checkout_hash: input.checkout?.checkout_hash ?? null,
    evaluated_at: input.nowValue ?? null,
    aggregate_spend: input.aggregateSpend ?? null,
    uses: input.uses ?? null,
    nonce_status: input.nonceStatus ?? null,
    human_approval_required: input.humanApprovalRequired ?? null,
  };
}

function createReasonCollector(): { reasons: ReasonCode[]; addReason: AddReason } {
  const reasons: ReasonCode[] = [];
  return {
    reasons,
    addReason(reason) {
      if (!reasons.includes(reason)) reasons.push(reason);
    },
  };
}

/** Pure pre-reservation policy evaluation. Persistence and evidence hashing belong to BE-07. */
export function evaluate(input: unknown): VerifyPolicyResult {
  const parsed = parsePolicyInput(input);
  const { addReason, reasons } = createReasonCollector();

  evaluateAgent(parsed, addReason);
  evaluateMandate(parsed, addReason);
  evaluateIdentityBinding(parsed, addReason);
  evaluateMerchant(parsed, addReason);
  evaluateCheckoutIntegrity(parsed, addReason);
  evaluateScope(parsed, addReason);
  evaluateAmount(parsed, addReason);
  evaluateCurrency(parsed, addReason);
  evaluateValidity(parsed, addReason);
  evaluateAggregateSpend(parsed, addReason);
  evaluateAggregateUses(parsed, addReason);
  evaluateNonce(parsed.nonceStatus, addReason);
  if (parsed.humanApprovalRequired === undefined) addReason("mandate_not_active");

  const denied = reasons.length > 0;
  if (!denied && parsed.humanApprovalRequired) addReason("human_approval_required");
  return policyEvaluationSchema.parse({
    decision: decisionFor(denied, parsed.humanApprovalRequired),
    reasons,
    policy_version: VERIFY_POLICY_VERSION,
    evidence_inputs: evidenceFor(parsed),
  });
}
