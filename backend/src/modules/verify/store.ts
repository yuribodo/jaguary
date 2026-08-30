import { randomUUID } from "node:crypto";

import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

import {
  authorizationDecisionSchema,
  canonicalizeJson,
  normalizedCheckoutSchema,
  PublicApiError,
  sha256CanonicalJson,
  type AuthorizationDecision,
  type AuthorizationUsage,
  type NormalizedCheckout,
  type PolicyEvaluation,
  type AgentEligibilityDecision,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection } from "../../db/database.js";
import type { TransactionClient } from "../../db/database.js";
import {
  authorizations,
  auditEvents,
  checkouts,
  nonces,
} from "../../db/schema.js";
import { loadAgentIdentity } from "../identity/registry.js";
import {
  AuditLedgerService,
  isLedgerEventType,
  ledgerPayloadSchemas,
  PostgresAuditEventRepository,
  type AuditLedgerPort,
} from "../ledger/index.js";
import { loadMandateForVerification } from "../mandates/service.js";

import type {
  AuthorizationReservationPort,
  DecisionAuditCommand,
  ReservationCommand,
  ReservationInspection,
  ReservationInspectionCommand,
} from "./orchestrator.js";
import { evaluate } from "./policy.js";

const CAPACITY_STATUSES = ["PAYMENT_PENDING", "CONSUMED"] as const;
const DECISION_AUDIT_TYPES = [
  "authorization.denied",
  "authorization.replay_detected",
  "authorization.escalated",
] as const;

function isDecisionAuditType(value: string): value is (typeof DECISION_AUDIT_TYPES)[number] {
  return DECISION_AUDIT_TYPES.some((eventType) => eventType === value);
}

function decisionFrom(
  evaluation: PolicyEvaluation,
  authorizationId?: string,
): AuthorizationDecision {
  return authorizationDecisionSchema.parse({
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    ...(authorizationId === undefined ? {} : { authorization_id: authorizationId }),
    policy_version: evaluation.policy_version,
    evidence_hash: sha256CanonicalJson(evaluation),
  });
}

function decisionFromAuthorization(
  row: typeof authorizations.$inferSelect,
): AuthorizationDecision {
  return authorizationDecisionSchema.parse({
    decision: "ALLOW",
    reasons: [],
    authorization_id: row.authorizationId,
    policy_version: row.policyVersion,
    evidence_hash: row.evidenceHash,
  });
}

async function aggregateUsage(
  database: DatabaseClient,
  mandateId: string,
  currency: string,
  now: Date,
): Promise<AuthorizationUsage> {
  const row = (await database
    .select({
      amount: sql<number>`coalesce(sum(${authorizations.reservedAmount}), 0)`.mapWith(Number),
      uses: sql<number>`count(*)`.mapWith(Number),
    })
    .from(authorizations)
    .where(and(
      eq(authorizations.mandateId, mandateId),
      or(
        and(eq(authorizations.status, "RESERVED"), gt(authorizations.expiresAt, now)),
        inArray(authorizations.status, CAPACITY_STATUSES),
      ),
    )))[0];
  return {
    aggregate_spend: { amount: row?.amount ?? 0, currency },
    uses: row?.uses ?? 0,
  };
}

async function nonceOrRequestWasUsed(
  database: DatabaseClient,
  command: ReservationInspectionCommand,
): Promise<boolean> {
  const { authorization, checkout } = command.request.request_body;
  const nonce = await database
    .select({ nonce: nonces.nonce })
    .from(nonces)
    .where(and(
      eq(nonces.agentId, command.request.proof.payload.agent_id),
      eq(nonces.nonce, command.request.proof.payload.nonce),
    ))
    .limit(1);
  const priorAuthorization = await database
    .select({ authorizationId: authorizations.authorizationId })
    .from(authorizations)
    .where(or(
      eq(authorizations.requestHash, command.request_hash),
      eq(authorizations.checkoutId, checkout.terms.checkout_id),
      and(
        eq(authorizations.agentId, authorization.agent_id),
        eq(authorizations.checkoutHash, checkout.checkout_hash),
      ),
    ))
    .limit(1);
  return nonce[0] !== undefined || priorAuthorization[0] !== undefined;
}

async function idempotentDecision(
  database: DatabaseClient,
  command: ReservationInspectionCommand,
): Promise<AuthorizationDecision | undefined> {
  const row = (await database
    .select()
    .from(authorizations)
    .where(eq(authorizations.idempotencyKey, command.idempotency_key))
    .limit(1))[0];
  if (row === undefined) return undefined;

  const recordedNonce = (await database
    .select({ payloadHash: nonces.payloadHash })
    .from(nonces)
    .where(and(
      eq(nonces.agentId, row.agentId),
      eq(nonces.checkoutId, row.checkoutId),
    ))
    .limit(1))[0];
  if (
    row.requestHash !== command.request_hash
    || recordedNonce?.payloadHash !== command.request.proof.payload_hash
  ) {
    throw new PublicApiError(
      409,
      "idempotency_conflict",
      "Idempotency-Key was already used with a different Bound Verify request",
    );
  }
  return decisionFromAuthorization(row);
}

async function idempotentAuditedDecision(
  database: DatabaseClient,
  command: ReservationInspectionCommand,
): Promise<AuthorizationDecision | undefined> {
  const row = (await database
    .select({ eventType: auditEvents.eventType, payload: auditEvents.sanitizedPayload })
    .from(auditEvents)
    .where(eq(auditEvents.deduplicationKey, `verify:${command.idempotency_key}`))
    .limit(1))[0];
  if (
    row === undefined
    || !isLedgerEventType(row.eventType)
    || !isDecisionAuditType(row.eventType)
  ) return undefined;
  const parsed = ledgerPayloadSchemas[row.eventType].safeParse(row.payload);
  if (!parsed.success || !("decision" in parsed.data)) {
    throw new Error("Stored decision audit payload is invalid");
  }
  if (
    parsed.data.request_hash !== command.request_hash
    || parsed.data.proof_payload_hash !== command.request.proof.payload_hash
  ) {
    throw new PublicApiError(
      409,
      "idempotency_conflict",
      "Idempotency-Key was already used with a different Bound Verify request",
    );
  }
  return authorizationDecisionSchema.parse({
    decision: parsed.data.decision,
    reasons: parsed.data.reasons,
    policy_version: parsed.data.policy_version,
    evidence_hash: parsed.data.evidence_hash,
  });
}

function checkoutFromRow(row: typeof checkouts.$inferSelect): NormalizedCheckout {
  return normalizedCheckoutSchema.parse({
    terms: {
      checkout_id: row.checkoutId,
      merchant_id: row.merchantId,
      merchant_url: row.merchantUrl,
      items: row.items,
      total: { amount: row.totalAmount, currency: row.currency },
      fulfillment: row.fulfillment,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      protocol: { name: row.protocolName, version: row.protocolVersion },
    },
    checkout_hash: row.checkoutHash,
    merchant_signature: {
      algorithm: row.merchantSignatureAlgorithm,
      key_id: row.merchantSignatureKeyId,
      value: row.merchantSignatureValue,
    },
  });
}

async function storedCheckoutMatches(
  database: DatabaseClient,
  checkout: NormalizedCheckout,
): Promise<boolean> {
  const rows = await database
    .select()
    .from(checkouts)
    .where(or(
      eq(checkouts.checkoutId, checkout.terms.checkout_id),
      eq(checkouts.checkoutHash, checkout.checkout_hash),
    ));
  return rows.length === 0
    || (rows.length === 1 && canonicalizeJson(checkoutFromRow(rows[0]!)) === canonicalizeJson(checkout));
}

async function persistCheckout(
  database: DatabaseClient,
  checkout: NormalizedCheckout,
  command: ReservationCommand,
): Promise<void> {
  const { terms, merchant_signature: signature } = checkout;
  await database.insert(checkouts).values({
    checkoutId: terms.checkout_id,
    merchantId: terms.merchant_id,
    merchantUrl: terms.merchant_url,
    items: terms.items,
    totalAmount: terms.total.amount,
    currency: terms.total.currency,
    fulfillment: terms.fulfillment,
    protocolName: terms.protocol.name,
    protocolVersion: terms.protocol.version,
    checkoutHash: checkout.checkout_hash,
    merchantSignatureAlgorithm: signature.algorithm,
    merchantSignatureKeyId: signature.key_id,
    merchantSignatureValue: signature.value,
    correlationId: command.correlation_id,
    idempotencyKey: `checkout:${command.request_hash}`,
    createdAt: new Date(terms.created_at),
    expiresAt: new Date(terms.expires_at),
    updatedAt: command.now,
  }).onConflictDoNothing();
  if (!(await storedCheckoutMatches(database, checkout))) {
    throw new PublicApiError(
      422,
      "checkout_integrity_failure",
      "Stored checkout does not match the signed Bound Verify request",
    );
  }
}

async function appendDecisionAudit(
  ledger: AuditLedgerPort,
  database: DatabaseClient,
  command: DecisionAuditCommand | ReservationCommand,
  evaluation: PolicyEvaluation,
): Promise<void> {
  if (evaluation.decision === "ALLOW") {
    throw new Error("ALLOW is represented by authorization.reserved, not a decision-only event");
  }
  const { authorization, checkout } = command.request.request_body;
  const payload = {
    mandate_id: authorization.mandate_id,
    checkout_id: checkout.terms.checkout_id,
    principal_id: authorization.principal_id,
    agent_id: authorization.agent_id,
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    policy_version: evaluation.policy_version,
    evidence_hash: sha256CanonicalJson(evaluation),
    request_hash: command.request_hash,
    proof_payload_hash: command.request.proof.payload_hash,
    decided_at: command.now.toISOString(),
    payment_executor_called: false as const,
  };
  if (evaluation.decision === "ESCALATE") {
    await ledger.append(database, {
      correlationId: command.correlation_id,
      eventType: "authorization.escalated",
      subjectId: authorization.mandate_id,
      payload,
      recordedAt: command.now,
      deduplicationKey: `verify:${command.idempotency_key}`,
    });
  } else if (evaluation.reasons.includes("replay_detected")) {
    await ledger.append(database, {
      correlationId: command.correlation_id,
      eventType: "authorization.replay_detected",
      subjectId: authorization.mandate_id,
      payload,
      recordedAt: command.now,
      deduplicationKey: `verify:${command.idempotency_key}`,
    });
  } else {
    await ledger.append(database, {
      correlationId: command.correlation_id,
      eventType: "authorization.denied",
      subjectId: authorization.mandate_id,
      payload,
      recordedAt: command.now,
      deduplicationKey: `verify:${command.idempotency_key}`,
    });
  }
}

async function cancelExpiredReservations(
  ledger: AuditLedgerPort,
  database: DatabaseClient,
  mandateId: string,
  now: Date,
  correlationId: string,
): Promise<void> {
  const expired = await database
    .update(authorizations)
    .set({ status: "CANCELLED", updatedAt: now })
    .where(and(
      eq(authorizations.mandateId, mandateId),
      eq(authorizations.status, "RESERVED"),
      lte(authorizations.expiresAt, now),
    ))
    .returning({ authorizationId: authorizations.authorizationId });
  for (const row of expired) {
    await ledger.append(database, {
      correlationId,
      eventType: "authorization.cancelled",
      subjectId: row.authorizationId,
      payload: {
        authorization_id: row.authorizationId,
        from_status: "RESERVED",
        to_status: "CANCELLED",
        cancelled_at: now.toISOString(),
        reason: "reservation_expired",
        payment_executor_called: false,
      },
      recordedAt: now,
    });
  }
}

async function lockReplayKeys(
  database: DatabaseClient,
  command: ReservationInspectionCommand,
): Promise<void> {
  const keys = [
    `checkout:${command.request.request_body.checkout.terms.checkout_id}`,
    `idempotency:${command.idempotency_key}`,
    `nonce:${command.request.proof.payload.agent_id}:${command.request.proof.payload.nonce}`,
  ].sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    await database.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

export class PostgresAuthorizationReservationStore implements AuthorizationReservationPort {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly ledger: AuditLedgerPort = new AuditLedgerService(
      new PostgresAuditEventRepository(database.db),
    ),
    private readonly eligibility?: { evaluateInTransaction(transaction: TransactionClient, agentId: string, principalId: string | undefined, now: Date): Promise<AgentEligibilityDecision> },
  ) {}

  async inspect(command: ReservationInspectionCommand): Promise<ReservationInspection> {
    const idempotent = await idempotentDecision(this.database.db, command)
      ?? await idempotentAuditedDecision(this.database.db, command);
    if (idempotent !== undefined) {
      return {
        idempotent_decision: idempotent,
        usage: {
          aggregate_spend: {
            amount: 0,
            currency: command.request.request_body.authorization.max_amount.currency,
          },
          uses: 0,
        },
        nonce_status: "UNUSED",
      };
    }
    const { authorization } = command.request.request_body;
    const [usage, replayed] = await Promise.all([
      aggregateUsage(
        this.database.db,
        authorization.mandate_id,
        authorization.max_amount.currency,
        command.now,
      ),
      nonceOrRequestWasUsed(this.database.db, command),
    ]);
    return { usage, nonce_status: replayed ? "USED" : "UNUSED" };
  }

  async recordDecision(command: DecisionAuditCommand): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await appendDecisionAudit(this.ledger, transaction, command, command.evaluation);
    });
  }

  async reserve(command: ReservationCommand): Promise<AuthorizationDecision> {
    return this.database.transaction(async (transaction) => {
      await lockReplayKeys(transaction, command);
      const idempotent = await idempotentDecision(transaction, command);
      if (idempotent !== undefined) return idempotent;

      const { authorization, checkout } = command.request.request_body;
      const mandate = await loadMandateForVerification(
        transaction,
        authorization.mandate_id,
        command.now,
      );
      await cancelExpiredReservations(
        this.ledger,
        transaction,
        authorization.mandate_id,
        command.now,
        command.correlation_id,
      );
      const agent = await loadAgentIdentity(transaction, command.agent_request.agent_id);
      const eligibility = await this.eligibility?.evaluateInTransaction(
        transaction,
        command.agent_request.agent_id,
        authorization.principal_id,
        command.now,
      );
      const usage = await aggregateUsage(
        transaction,
        authorization.mandate_id,
        authorization.max_amount.currency,
        command.now,
      );
      const replayed = await nonceOrRequestWasUsed(transaction, command);
      const checkoutMatches = await storedCheckoutMatches(transaction, checkout);
      const agentRequest = agent !== undefined
        && canonicalizeJson(agent) === canonicalizeJson(command.verified_agent)
        ? command.agent_request
        : undefined;
      const evaluation = evaluate({
        agent,
        agent_request: agentRequest,
        mandate,
        mandate_signature_valid: command.mandate_signature_valid,
        authorization,
        checkout,
        checkout_signature_valid: command.checkout_signature_valid && checkoutMatches,
        human_approval_required: command.human_approval_required,
        now: command.now.toISOString(),
        usage,
        nonce_status: replayed ? "USED" : "UNUSED",
        agent_trust: eligibility?.trust,
        agent_eligibility_reason: eligibility?.reason,
      });
      if (evaluation.decision !== "ALLOW") {
        await appendDecisionAudit(this.ledger, transaction, command, evaluation);
        return decisionFrom(evaluation);
      }

      await persistCheckout(transaction, checkout, command);
      const authorizationId = `authorization_${randomUUID()}`;
      const evidenceHash = sha256CanonicalJson(evaluation);
      const expiresAt = new Date(Math.min(
        Date.parse(authorization.expires_at),
        Date.parse(checkout.terms.expires_at),
        mandate === undefined ? Number.POSITIVE_INFINITY : Date.parse(mandate.terms.expires_at),
      ));
      await transaction.insert(nonces).values({
        agentId: command.agent_request.agent_id,
        nonce: command.agent_request.nonce,
        mandateId: authorization.mandate_id,
        checkoutId: checkout.terms.checkout_id,
        checkoutHash: checkout.checkout_hash,
        payloadHash: command.request.proof.payload_hash,
        correlationId: command.correlation_id,
        issuedAt: new Date(command.agent_request.issued_at),
        expiresAt: new Date(command.agent_request.expires_at),
        recordedAt: command.now,
      });
      await transaction.insert(authorizations).values({
        authorizationId,
        mandateId: authorization.mandate_id,
        checkoutId: checkout.terms.checkout_id,
        checkoutHash: checkout.checkout_hash,
        principalId: authorization.principal_id,
        agentId: authorization.agent_id,
        merchantId: checkout.terms.merchant_id,
        allowedMerchantIds: authorization.allowed_merchant_ids,
        maxAmount: authorization.max_amount.amount,
        maxAmountCurrency: authorization.max_amount.currency,
        maxUses: authorization.max_uses,
        reservedAmount: checkout.terms.total.amount,
        currency: checkout.terms.total.currency,
        status: "RESERVED",
        proofType: authorization.proof_type,
        proofReference: authorization.proof_reference,
        proofHash: authorization.proof_hash,
        requestHash: command.request_hash,
        policyVersion: evaluation.policy_version,
        evidenceHash,
        correlationId: command.correlation_id,
        idempotencyKey: command.idempotency_key,
        reservedAt: command.now,
        expiresAt,
        updatedAt: command.now,
      });
      await this.ledger.append(transaction, {
        correlationId: command.correlation_id,
        eventType: "authorization.reserved",
        subjectId: authorizationId,
        payload: {
          authorization_id: authorizationId,
          mandate_id: authorization.mandate_id,
          checkout_id: checkout.terms.checkout_id,
          principal_id: authorization.principal_id,
          agent_id: authorization.agent_id,
          merchant_id: checkout.terms.merchant_id,
          decision: evaluation.decision,
          policy_version: evaluation.policy_version,
          evidence_hash: evidenceHash,
          reserved_amount: checkout.terms.total,
          reserved_at: command.now.toISOString(),
          expires_at: expiresAt.toISOString(),
          payment_executor_called: false,
        },
        recordedAt: command.now,
        deduplicationKey: `verify:${command.idempotency_key}`,
      });
      return decisionFrom(evaluation, authorizationId);
    });
  }
}
