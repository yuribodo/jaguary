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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Pure pre-reservation policy evaluation. Persistence and evidence hashing belong to BE-07. */
export function evaluate(input: VerifyPolicyInput): VerifyPolicyResult {
  const raw = asRecord(input);
  const agentResult = agentIdentitySchema.safeParse(raw.agent);
  const requestResult = verifiedAgentRequestSchema.safeParse(raw.agent_request);
  const mandateResult = mandateSchema.safeParse(raw.mandate);
  const authorizationResult = normalizedAuthorizationSchema.safeParse(raw.authorization);
  const checkoutResult = normalizedCheckoutSchema.safeParse(raw.checkout);
  const nowResult = utcRfc3339Schema.safeParse(raw.now);
  const usageRecord = asRecord(raw.usage);
  const aggregateSpendResult = moneySchema.safeParse(usageRecord.aggregate_spend);
  const usesResult = nonnegativeSafeIntegerSchema.safeParse(usageRecord.uses);
  const nonceResult = nonceStatusSchema.safeParse(raw.nonce_status);
  const mandateSignatureResult = z.boolean().safeParse(raw.mandate_signature_valid);
  const checkoutSignatureResult = z.boolean().safeParse(raw.checkout_signature_valid);
  const humanApprovalResult = z.boolean().safeParse(raw.human_approval_required);
  const agent = agentResult.success ? agentResult.data : undefined;
  const agentRequest = requestResult.success ? requestResult.data : undefined;
  const mandate = mandateResult.success ? mandateResult.data : undefined;
  const authorization = authorizationResult.success ? authorizationResult.data : undefined;
  const checkout = checkoutResult.success ? checkoutResult.data : undefined;
  const nowValue = nowResult.success ? nowResult.data : undefined;
  const aggregateSpend = aggregateSpendResult.success ? aggregateSpendResult.data : undefined;
  const uses = usesResult.success ? usesResult.data : undefined;
  const nonceStatus = nonceResult.success ? nonceResult.data : undefined;
  const humanApprovalRequired = humanApprovalResult.success
    ? humanApprovalResult.data
    : undefined;
  const reasons: ReasonCode[] = [];
  const addReason = (reason: ReasonCode): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (
    agentRequest === undefined
    || Object.keys(raw).some((key) => !policyInputKeys.has(key as keyof VerifyPolicyInput))
    || (
      agent !== undefined
      && agentRequest !== undefined
      && (
        agent.verification_key.key_id !== agentRequest.key_id
        || agent.build_fingerprint !== agentRequest.build_fingerprint
      )
    )
  ) {
    addReason("invalid_agent_signature");
  }
  if (agent === undefined) {
    addReason("agent_not_found");
  } else if (agent.status !== "ACTIVE") {
    addReason("agent_not_active");
  }

  if (mandate === undefined || authorization === undefined) {
    addReason("mandate_not_active");
  } else if (mandate.status === "REVOKED") {
    addReason("mandate_revoked");
  } else if (mandate.status === "EXPIRED") {
    addReason("mandate_expired");
  } else if (
    mandate.status !== "ACTIVE"
    || !mandate.authority_valid
    || !mandateSignatureResult.success
    || !mandateSignatureResult.data
    || sha256CanonicalJson(mandate.terms) !== mandate.terms_hash
    || authorization.mandate_id !== mandate.terms.mandate_id
  ) {
    addReason("mandate_not_active");
  }

  if (
    agent !== undefined
    && agentRequest !== undefined
    && mandate !== undefined
    && authorization !== undefined
    && (
      agent.agent_id !== agentRequest.agent_id
      || agent.agent_id !== mandate.terms.agent_id
      || agent.agent_id !== authorization.agent_id
      || agent.principal_id !== mandate.terms.principal_id
      || agent.principal_id !== authorization.principal_id
    )
  ) {
    addReason("agent_not_authorized");
  }

  if (
    mandate !== undefined
    && authorization !== undefined
    && checkout !== undefined
    && (
      !mandate.terms.allowed_merchant_ids.includes(checkout.terms.merchant_id)
      || !authorization.allowed_merchant_ids.includes(checkout.terms.merchant_id)
    )
  ) {
    addReason("merchant_not_authorized");
  }

  if (
    checkout === undefined
    || !checkoutSignatureResult.success
    || !checkoutSignatureResult.data
    || sha256CanonicalJson(checkout.terms) !== checkout.checkout_hash
    || (authorization !== undefined && authorization.checkout_hash !== checkout.checkout_hash)
  ) {
    addReason("checkout_integrity_failure");
  }

  if (
    mandate !== undefined
    && checkout !== undefined
    && (
      checkout.terms.fulfillment.origin !== mandate.terms.route.origin
      || checkout.terms.fulfillment.destination !== mandate.terms.route.destination
      || checkout.terms.fulfillment.cabin !== mandate.terms.cabin
    )
  ) {
    addReason("scope_mismatch");
  }

  const checkoutTotal = checkout?.terms.total;
  if (
    checkoutTotal !== undefined
    && mandate !== undefined
    && authorization !== undefined
    && (
      checkoutTotal.amount > mandate.terms.max_per_purchase.amount
      || checkoutTotal.amount > authorization.max_amount.amount
    )
  ) {
    addReason("amount_limit_exceeded");
  }

  const expectedCurrency = mandate?.terms.max_per_purchase.currency;
  if (
    checkoutTotal !== undefined
    && mandate !== undefined
    && authorization !== undefined
    && aggregateSpend !== undefined
    && (
      checkoutTotal.currency !== expectedCurrency
      || mandate.terms.max_aggregate.currency !== expectedCurrency
      || authorization.max_amount.currency !== expectedCurrency
      || aggregateSpend.currency !== expectedCurrency
    )
  ) {
    addReason("currency_mismatch");
  }

  const now = nowValue === undefined ? undefined : Date.parse(nowValue);
  if (now === undefined) {
    addReason("mandate_not_active");
  } else if (agentRequest !== undefined) {
    if (now >= Date.parse(agentRequest.expires_at)) {
      addReason("agent_request_expired");
    } else if (now < Date.parse(agentRequest.issued_at)) {
      addReason("agent_request_not_yet_valid");
    }
  }
  if (
    now !== undefined
    && mandate?.status === "ACTIVE"
    && authorization !== undefined
    && (
      now >= Date.parse(mandate.terms.expires_at)
      || now >= Date.parse(authorization.expires_at)
    )
  ) {
    addReason("mandate_expired");
  } else if (
    now !== undefined
    && mandate?.status === "ACTIVE"
    && (
      now < Date.parse(mandate.terms.valid_from)
      || now < Date.parse(mandate.activated_at)
    )
  ) {
    addReason("mandate_not_active");
  }
  if (
    now !== undefined
    && checkout !== undefined
    && (
      now < Date.parse(checkout.terms.created_at)
      || now >= Date.parse(checkout.terms.expires_at)
    )
  ) {
    addReason("checkout_integrity_failure");
  }

  if (aggregateSpend === undefined) {
    addReason("aggregate_limit_exceeded");
  } else if (checkoutTotal !== undefined && mandate !== undefined) {
    const aggregateAmount = aggregateSpend.amount + checkoutTotal.amount;
    if (
      !Number.isSafeInteger(aggregateAmount)
      || aggregateAmount > mandate.terms.max_aggregate.amount
    ) {
      addReason("aggregate_limit_exceeded");
    }
  }

  if (uses === undefined) {
    addReason("usage_limit_exceeded");
  } else if (mandate !== undefined && authorization !== undefined) {
    const aggregateUses = uses + 1;
    if (
      !Number.isSafeInteger(aggregateUses)
      || aggregateUses > mandate.terms.max_uses
      || aggregateUses > authorization.max_uses
    ) {
      addReason("usage_limit_exceeded");
    }
  }

  if (nonceStatus === undefined || nonceStatus === "USED") {
    addReason("replay_detected");
  }
  if (humanApprovalRequired === undefined) {
    addReason("mandate_not_active");
  }

  const denied = reasons.length > 0;
  if (!denied && humanApprovalRequired) {
    addReason("human_approval_required");
  }
  return policyEvaluationSchema.parse({
    decision: denied
      ? "DENY"
      : humanApprovalRequired ? "ESCALATE" : "ALLOW",
    reasons,
    policy_version: VERIFY_POLICY_VERSION,
    evidence_inputs: {
      agent_id: agent?.agent_id ?? null,
      agent_request_nonce: agentRequest?.nonce ?? null,
      mandate_id: mandate?.terms.mandate_id ?? null,
      mandate_terms_hash: mandate !== undefined && "terms_hash" in mandate
        ? mandate.terms_hash
        : null,
      authorization_proof_hash: authorization?.proof_hash ?? null,
      checkout_id: checkout?.terms.checkout_id ?? null,
      checkout_hash: checkout?.checkout_hash ?? null,
      evaluated_at: nowValue ?? null,
      aggregate_spend: aggregateSpend ?? null,
      uses: uses ?? null,
      nonce_status: nonceStatus ?? null,
      human_approval_required: humanApprovalRequired ?? null,
    },
  });
}
