import { z } from "zod";

import {
  authorizationStatusSchema,
  identifierSchema,
  moneySchema,
  paymentResultStatusSchema,
  reasonCodeSchema,
  sha256Schema,
  utcRfc3339Schema,
  type PaymentResultStatus,
} from "../../contracts/v1/index.js";

const mandateTransitionSchema = z.object({
  mandate_id: identifierSchema,
  from_status: z.enum(["DRAFT", "ACTIVE"]),
  to_status: z.enum(["ACTIVE", "REVOKED"]),
  terms_hash: sha256Schema.optional(),
  occurred_at: utcRfc3339Schema,
}).strict();

const verifyDecisionSchema = z.object({
  mandate_id: identifierSchema,
  checkout_id: identifierSchema,
  agent_id: identifierSchema,
  decision: z.enum(["DENY", "ESCALATE"]),
  reasons: z.array(reasonCodeSchema),
  policy_version: z.string().min(1).max(64),
  evidence_hash: sha256Schema,
  decided_at: utcRfc3339Schema,
  payment_executor_called: z.literal(false),
}).strict();

function authorizationStatusForResult(
  status: PaymentResultStatus,
): "CONSUMED" | "FAILED" | "PAYMENT_PENDING" {
  if (status === "APPROVED") return "CONSUMED";
  if (status === "DECLINED") return "FAILED";
  return "PAYMENT_PENDING";
}

const paymentResultRecordedSchema = z.object({
  payment_attempt_id: identifierSchema,
  authorization_id: identifierSchema,
  provider_idempotency_key: z.uuid(),
  result_status: paymentResultStatusSchema,
  from_status: z.literal("PAYMENT_PENDING"),
  to_status: authorizationStatusSchema,
  payment_id: identifierSchema.optional(),
  provider_reference: identifierSchema.optional(),
  decline_code: identifierSchema.optional(),
  amount: moneySchema,
  occurred_at: utcRfc3339Schema,
  recorded_at: utcRfc3339Schema,
}).strict().superRefine((payload, context) => {
  const expectedStatus = authorizationStatusForResult(payload.result_status);
  if (payload.to_status !== expectedStatus) {
    context.addIssue({
      code: "custom",
      message: `${payload.result_status} must transition to ${expectedStatus}`,
    });
  }
});

export const ledgerPayloadSchemas = {
  "agent.registered": z.object({
    agent_id: identifierSchema,
    principal_id: identifierSchema,
    status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
    build_fingerprint: sha256Schema,
    key_id: identifierSchema,
    registered_at: utcRfc3339Schema,
  }).strict(),
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
      && payload.terms_hash !== undefined,
    "Mandate activation must bind DRAFT to ACTIVE and include terms_hash",
  ),
  "mandate.revoked": mandateTransitionSchema.refine(
    (payload) => payload.from_status === "ACTIVE"
      && payload.to_status === "REVOKED"
      && payload.terms_hash === undefined,
    "Mandate revocation must bind ACTIVE to REVOKED",
  ),
  "authorization.reserved": z.object({
    authorization_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    decision: z.literal("ALLOW"),
    policy_version: z.string().min(1).max(64),
    evidence_hash: sha256Schema,
    reserved_amount: moneySchema,
    reserved_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
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
  "payment.claimed": z.object({
    payment_attempt_id: identifierSchema,
    authorization_id: identifierSchema,
    provider_idempotency_key: z.uuid(),
    from_status: z.literal("RESERVED"),
    to_status: z.literal("PAYMENT_PENDING"),
    amount: moneySchema,
    claimed_at: utcRfc3339Schema,
  }).strict(),
  "payment.result_recorded": paymentResultRecordedSchema,
  "order.confirmed": z.object({
    order_id: identifierSchema,
    checkout_id: identifierSchema,
    authorization_id: identifierSchema,
    payment_id: identifierSchema,
    merchant_id: identifierSchema,
    total: moneySchema,
    confirmed_at: utcRfc3339Schema,
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
