import { z } from "zod";

import {
  agentAssuranceClaimSchema,
  identifierSchema,
  moneySchema,
  reasonCodeSchema,
  sha256Schema,
  utcRfc3339Schema,
} from "../../contracts/v1/index.js";

const attestationEvidenceBase = {
  attestation_id: identifierSchema,
  agent_id: identifierSchema,
  principal_id: identifierSchema,
  provider: z.enum(["fake", "didit"]),
  binding_hash: sha256Schema,
  evidence_hash: sha256Schema,
  occurred_at: utcRfc3339Schema,
};

const mandateTransitionSchema = z.object({
  mandate_id: identifierSchema,
  from_status: z.enum(["DRAFT", "ACTIVE"]),
  to_status: z.enum(["ACTIVE", "REVOKED"]),
  terms_hash: sha256Schema.optional(),
  payment_executor_called: z.literal(false).optional(),
  occurred_at: utcRfc3339Schema,
}).strict();

const verifyDecisionSchema = z.object({
  mandate_id: identifierSchema,
  checkout_id: identifierSchema,
  principal_id: identifierSchema,
  agent_id: identifierSchema,
  decision: z.enum(["DENY", "ESCALATE"]),
  reasons: z.array(reasonCodeSchema),
  policy_version: z.string().min(1).max(64),
  evidence_hash: sha256Schema,
  request_hash: sha256Schema,
  proof_payload_hash: sha256Schema,
  decided_at: utcRfc3339Schema,
  payment_executor_called: z.literal(false),
}).strict();

const paymentEvidenceBase = {
  principal_id: identifierSchema,
  agent_id: identifierSchema,
  mandate_id: identifierSchema,
  checkout_id: identifierSchema,
  authorization_id: identifierSchema,
  payment_attempt_id: identifierSchema,
  amount: moneySchema,
  occurred_at: utcRfc3339Schema,
  request_correlation_id: identifierSchema,
  payment_executor_called: z.literal(true),
};

export const ledgerPayloadSchemas = {
  "agent.registered": z.object({
    agent_id: identifierSchema,
    principal_id: identifierSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
    build_fingerprint: sha256Schema,
    key_id: identifierSchema,
    registered_at: utcRfc3339Schema,
  }).strict(),
  "agent.attestation_started": z.object({ ...attestationEvidenceBase, status: z.literal("PENDING") }).strict(),
  "agent.attestation_verified": z.object({ ...attestationEvidenceBase, status: z.literal("VERIFIED"), assurance_claims: z.array(agentAssuranceClaimSchema).min(1), expires_at: utcRfc3339Schema }).strict(),
  "agent.attestation_rejected": z.object({ ...attestationEvidenceBase, status: z.literal("REJECTED"), failure_code: z.string().min(1).max(64) }).strict(),
  "agent.attestation_expired": z.object({ ...attestationEvidenceBase, status: z.literal("EXPIRED") }).strict(),
  "agent.attestation_revoked": z.object({ ...attestationEvidenceBase, status: z.literal("REVOKED") }).strict(),
  "agent.passport_issued": z.object({ passport_id: identifierSchema, attestation_id: identifierSchema, agent_id: identifierSchema, binding_hash: sha256Schema, evidence_hash: sha256Schema, expires_at: utcRfc3339Schema, occurred_at: utcRfc3339Schema }).strict(),
  "agent.passport_invalidated": z.object({ passport_id: identifierSchema, attestation_id: identifierSchema, agent_id: identifierSchema, reason: z.enum(["attestation_expired", "attestation_revoked", "binding_changed", "agent_not_active"]), occurred_at: utcRfc3339Schema }).strict(),
  "mandate.created": z.object({
    mandate_id: identifierSchema,
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    status: z.literal("DRAFT"),
    created_at: utcRfc3339Schema,
  }).strict(),
  "mandate.activated": mandateTransitionSchema.refine(
    (payload) => payload.from_status === "DRAFT"
      && payload.to_status === "ACTIVE"
      && payload.terms_hash !== undefined
      && payload.payment_executor_called === undefined,
    "Mandate activation must bind DRAFT to ACTIVE and include terms_hash",
  ),
  "mandate.revoked": mandateTransitionSchema.refine(
    (payload) => payload.from_status === "ACTIVE"
      && payload.to_status === "REVOKED"
      && payload.terms_hash === undefined
      && payload.payment_executor_called === false,
    "Mandate revocation must bind ACTIVE to REVOKED",
  ),
  "authorization.reserved": z.object({
    authorization_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    merchant_id: identifierSchema,
    decision: z.literal("ALLOW"),
    policy_version: z.string().min(1).max(64),
    evidence_hash: sha256Schema,
    reserved_amount: moneySchema,
    reserved_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
    payment_executor_called: z.literal(false),
  }).strict(),
  "authorization.cancelled": z.object({
    authorization_id: identifierSchema,
    from_status: z.literal("RESERVED"),
    to_status: z.literal("CANCELLED"),
    reason: z.literal("reservation_expired"),
    cancelled_at: utcRfc3339Schema,
    payment_executor_called: z.literal(false),
  }).strict(),
  "authorization.denied": verifyDecisionSchema.refine(
    (payload) => payload.decision === "DENY" && !payload.reasons.includes("replay_detected"),
    "A regular denial cannot represent replay detection",
  ),
  "authorization.replay_detected": verifyDecisionSchema.refine(
    (payload) => payload.decision === "DENY" && payload.reasons.includes("replay_detected"),
    "A replay event must be a DENY containing replay_detected",
  ),
  "authorization.escalated": verifyDecisionSchema.refine(
    (payload) => payload.decision === "ESCALATE",
    "An escalation event must contain an ESCALATE decision",
  ),
  "payment.attempt_started": z.object({
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    authorization_id: identifierSchema,
    payment_attempt_id: identifierSchema,
    amount: moneySchema,
    started_at: utcRfc3339Schema,
    request_correlation_id: identifierSchema,
    payment_executor_called: z.literal(false),
  }).strict(),
  "payment.approved": z.object({
    ...paymentEvidenceBase,
    status: z.literal("APPROVED"),
    payment_id: identifierSchema,
    provider_reference_hash: sha256Schema.optional(),
  }).strict(),
  "payment.declined": z.object({
    ...paymentEvidenceBase,
    status: z.literal("DECLINED"),
    payment_id: identifierSchema.optional(),
    decline_code: z.string().min(1).max(128),
  }).strict(),
  "payment.timeout": z.object({
    ...paymentEvidenceBase,
    status: z.literal("TIMEOUT"),
  }).strict(),
  "payment.unknown": z.object({
    ...paymentEvidenceBase,
    status: z.literal("UNKNOWN"),
    payment_id: identifierSchema.optional(),
  }).strict(),
  "order.confirmed": z.object({
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    authorization_id: identifierSchema,
    payment_attempt_id: identifierSchema,
    payment_id: identifierSchema,
    order_id: identifierSchema,
    receipt_id: identifierSchema,
    merchant_id: identifierSchema,
    status: z.literal("CONFIRMED"),
    total: moneySchema,
    issued_at: utcRfc3339Schema,
    request_correlation_id: identifierSchema,
    payment_executor_called: z.literal(true),
  }).strict(),
} as const;

export type LedgerEventType = keyof typeof ledgerPayloadSchemas;

export type LedgerPayloadByType = {
  [EventType in LedgerEventType]: z.infer<(typeof ledgerPayloadSchemas)[EventType]>;
};

export type LedgerPayload = LedgerPayloadByType[LedgerEventType];

export function sanitizeLedgerPayload<EventType extends LedgerEventType>(
  eventType: EventType,
  payload: LedgerPayloadByType[EventType],
): LedgerPayloadByType[EventType] {
  return ledgerPayloadSchemas[eventType].parse(payload) as LedgerPayloadByType[EventType];
}

export function isLedgerEventType(eventType: string): eventType is LedgerEventType {
  return Object.hasOwn(ledgerPayloadSchemas, eventType);
}

export const auditTimelineEventSchema = z.object({
  event_id: identifierSchema,
  correlation_id: identifierSchema,
  event_type: z.string().min(1).max(128),
  subject_id: identifierSchema,
  payload: z.record(z.string(), z.unknown()).nullable(),
  payload_hash: sha256Schema,
  previous_hash: sha256Schema.nullable(),
  event_hash: sha256Schema,
  recorded_at: utcRfc3339Schema,
}).strict();

export const auditTimelineSchema = z.object({
  correlation_id: identifierSchema,
  events: z.array(auditTimelineEventSchema),
}).strict();

export type AuditTimeline = z.infer<typeof auditTimelineSchema>;
