import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  PublicApiError,
  mandateTermsSchema,
  purchaseDisputeEvidenceSchema,
  purchaseDisputeSchema,
  sha256CanonicalJson,
  type ClockPort,
  type PurchaseDispute,
  type PurchaseDisputeEvidence,
  type PurchaseDisputeEvidenceChecks,
  type PurchaseDisputeReason,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection } from "../../db/database.js";
import {
  agents,
  authorizations,
  checkouts,
  mandates,
  orders,
  payments,
  purchaseDisputes,
} from "../../db/schema.js";
import type { AuditLedgerPort } from "../ledger/index.js";
import type { StoredAuditEvent } from "../ledger/types.js";

import { adjudicatePurchaseDispute } from "./adjudication.js";

type DisputeRow = typeof purchaseDisputes.$inferSelect;

interface PurchaseGraph {
  order: typeof orders.$inferSelect;
  authorization: typeof authorizations.$inferSelect;
  payment: typeof payments.$inferSelect;
  mandate: typeof mandates.$inferSelect;
  checkout: typeof checkouts.$inferSelect;
  agent: typeof agents.$inferSelect;
}

export interface OpenPurchaseDisputeInput {
  principalId: string;
  receiptId: string;
  reason: PurchaseDisputeReason;
  idempotencyKey: string;
  correlationId: string;
}

export interface OpenPurchaseDisputeResult {
  dispute: PurchaseDispute;
  replayed: boolean;
}

function publicDispute(row: DisputeRow): PurchaseDispute {
  return purchaseDisputeSchema.parse({
    dispute_id: row.disputeId,
    receipt_id: row.receiptId,
    order_id: row.orderId,
    authorization_id: row.authorizationId,
    payment_id: row.paymentId,
    principal_id: row.principalId,
    merchant_id: row.merchantId,
    reason: row.reason,
    status: row.status,
    verdict: row.verdict,
    liable_party: row.liableParty,
    financial_outcome: row.financialOutcome,
    resolution_code: row.resolutionCode,
    evidence: row.evidence,
    opened_at: row.openedAt.toISOString(),
    resolved_at: row.resolvedAt.toISOString(),
    audit_correlation_id: row.correlationId,
  });
}

function eventPayload(event: StoredAuditEvent | undefined): Record<string, unknown> | undefined {
  return event?.sanitizedPayload as Record<string, unknown> | undefined;
}

function moneyMatches(value: unknown, amount: number, currency: string): boolean {
  if (typeof value !== "object" || value === null) return false;
  const money = value as Record<string, unknown>;
  return money.amount === amount && money.currency === currency;
}

function mandateTermsHashMatches(mandate: PurchaseGraph["mandate"]): boolean {
  if (mandate.termsHash === null) return false;
  const terms = mandateTermsSchema.safeParse({
    mandate_id: mandate.mandateId,
    version: mandate.version,
    ...(mandate.supersedesMandateId === null ? {} : { supersedes_mandate_id: mandate.supersedesMandateId }),
    principal_id: mandate.principalId,
    agent_id: mandate.agentId,
    allowed_merchant_ids: mandate.allowedMerchantIds,
    allowed_merchant_categories: mandate.allowedMerchantCategories,
    route: { origin: mandate.routeOrigin, destination: mandate.routeDestination },
    cabin: mandate.cabin,
    ...(mandate.flightConstraints === null ? {} : { flight_constraints: mandate.flightConstraints }),
    max_per_purchase: { amount: mandate.maxPerPurchaseAmount, currency: mandate.maxPerPurchaseCurrency },
    max_aggregate: { amount: mandate.maxAggregateAmount, currency: mandate.maxAggregateCurrency },
    max_uses: mandate.maxUses,
    valid_from: mandate.validFrom.toISOString(),
    expires_at: mandate.expiresAt.toISOString(),
    credential_id: mandate.credentialId,
  });
  return terms.success && mandate.termsHash === sha256CanonicalJson(terms.data);
}

function evidenceChecks(graph: PurchaseGraph, events: readonly StoredAuditEvent[]): PurchaseDisputeEvidenceChecks {
  const { order, authorization, payment, mandate, checkout, agent } = graph;
  const reservedPayload = eventPayload(events.find(({ eventType }) => eventType === "authorization.reserved"));
  const attemptPayload = eventPayload(events.find(({ eventType }) => eventType === "payment.attempt_started"));
  const approvedPayload = eventPayload(events.find(({ eventType }) => eventType === "payment.approved"));
  const confirmedPayload = eventPayload(events.find(({ eventType }) => eventType === "order.confirmed"));
  const reservedAt = authorization.reservedAt.getTime();

  return {
    receipt_ownership_verified: order.authorizationId === authorization.authorizationId
      && authorization.principalId === mandate.principalId,
    commercial_binding_verified: order.checkoutId === checkout.checkoutId
      && order.authorizationId === authorization.authorizationId
      && order.paymentId === payment.paymentId
      && order.merchantId === authorization.merchantId
      && checkout.merchantId === authorization.merchantId
      && order.totalAmount === authorization.reservedAmount
      && checkout.totalAmount === authorization.reservedAmount
      && payment.amount === authorization.reservedAmount
      && order.currency === authorization.currency
      && checkout.currency === authorization.currency
      && payment.currency === authorization.currency,
    mandate_authority_verified: mandate.mandateId === authorization.mandateId
      && mandate.principalId === authorization.principalId
      && mandate.agentId === authorization.agentId
      && mandate.activatedAt !== null
      && mandate.activatedAt.getTime() <= reservedAt
      && mandate.validFrom.getTime() <= reservedAt
      && reservedAt < mandate.expiresAt.getTime()
      && mandateTermsHashMatches(mandate)
      && mandate.principalSignatureValue !== null
      && (mandate.allowedMerchantIds.includes(authorization.merchantId)
        || mandate.allowedMerchantCategories.length > 0)
      && mandate.maxPerPurchaseAmount >= authorization.reservedAmount
      && mandate.maxPerPurchaseCurrency === authorization.currency
      && authorization.allowedMerchantIds.includes(authorization.merchantId)
      && authorization.maxAmount >= authorization.reservedAmount
      && authorization.maxAmountCurrency === authorization.currency,
    agent_identity_verified: agent.agentId === authorization.agentId
      && (agent.accessScope === "PUBLIC" || agent.principalId === authorization.principalId)
      && reservedPayload?.agent_id === authorization.agentId
      && reservedPayload.principal_id === authorization.principalId
      && reservedPayload.mandate_id === authorization.mandateId
      && reservedPayload.evidence_hash === authorization.evidenceHash
      && moneyMatches(reservedPayload.reserved_amount, authorization.reservedAmount, authorization.currency),
    payment_approved_verified: payment.status === "APPROVED"
      && payment.paymentId !== null
      && approvedPayload?.payment_id === payment.paymentId
      && approvedPayload.authorization_id === authorization.authorizationId
      && moneyMatches(approvedPayload.amount, payment.amount, payment.currency)
      && attemptPayload?.authorization_id === authorization.authorizationId
      && confirmedPayload?.payment_id === payment.paymentId
      && confirmedPayload.order_id === order.orderId
      && confirmedPayload.receipt_id === order.receiptId
      && moneyMatches(confirmedPayload.total, order.totalAmount, order.currency),
    audit_chain_verified: events.length >= 4
      && reservedPayload !== undefined
      && attemptPayload !== undefined
      && approvedPayload !== undefined
      && confirmedPayload !== undefined,
  };
}

export class PurchaseDisputeService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly ledger: AuditLedgerPort,
    private readonly clock: ClockPort,
  ) {}

  async open(input: OpenPurchaseDisputeInput): Promise<OpenPurchaseDisputeResult> {
    const replay = (await this.database.db.select().from(purchaseDisputes)
      .where(eq(purchaseDisputes.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    if (replay !== undefined) return this.replay(input, replay);

    const graph = await this.loadOwnedPurchase(input.principalId, input.receiptId);
    let events: StoredAuditEvent[] = [];
    try {
      events = await this.ledger.validateSubject(graph.authorization.authorizationId);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Audit chain validation failed")) throw error;
    }

    const checks = evidenceChecks(graph, events);
    const evidenceWithoutHash = {
      mandate_id: graph.mandate.mandateId,
      agent_id: graph.authorization.agentId,
      checkout_id: graph.checkout.checkoutId,
      policy_version: graph.authorization.policyVersion,
      amount: { amount: graph.order.totalAmount, currency: graph.order.currency },
      original_purchase_correlation_id: graph.authorization.correlationId,
      checks,
    };
    const evidence: PurchaseDisputeEvidence = purchaseDisputeEvidenceSchema.parse({
      ...evidenceWithoutHash,
      evidence_hash: sha256CanonicalJson(evidenceWithoutHash),
    });
    const adjudication = adjudicatePurchaseDispute(checks);
    const now = this.clock.now();
    const disputeId = `dispute_${randomUUID()}`;

    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`purchase-dispute:${input.receiptId}`}, 0))`);
      const concurrentReplay = (await transaction.select().from(purchaseDisputes)
        .where(eq(purchaseDisputes.idempotencyKey, input.idempotencyKey)).limit(1))[0];
      if (concurrentReplay !== undefined) return this.replay(input, concurrentReplay);
      const existing = (await transaction.select().from(purchaseDisputes)
        .where(eq(purchaseDisputes.receiptId, input.receiptId)).limit(1))[0];
      if (existing !== undefined) {
        throw new PublicApiError(409, "idempotency_conflict", "This purchase already has a dispute");
      }

      const inserted = (await transaction.insert(purchaseDisputes).values({
        disputeId,
        receiptId: graph.order.receiptId,
        orderId: graph.order.orderId,
        authorizationId: graph.authorization.authorizationId,
        paymentId: graph.order.paymentId,
        principalId: input.principalId,
        merchantId: graph.order.merchantId,
        reason: input.reason,
        status: "RESOLVED",
        verdict: adjudication.verdict,
        liableParty: adjudication.liable_party,
        financialOutcome: adjudication.financial_outcome,
        resolutionCode: adjudication.resolution_code,
        evidence,
        evidenceHash: evidence.evidence_hash,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        openedAt: now,
        resolvedAt: now,
      }).returning())[0];
      if (inserted === undefined) throw new Error("Dispute insert returned no row");

      await this.ledger.append(transaction, {
        correlationId: input.correlationId,
        eventType: "dispute.opened",
        subjectId: disputeId,
        payload: {
          dispute_id: disputeId,
          receipt_id: graph.order.receiptId,
          order_id: graph.order.orderId,
          authorization_id: graph.authorization.authorizationId,
          principal_id: input.principalId,
          merchant_id: graph.order.merchantId,
          reason: input.reason,
          amount: evidence.amount,
          opened_at: now.toISOString(),
        },
        recordedAt: now,
        deduplicationKey: `dispute:${disputeId}:opened`,
      });
      await this.ledger.append(transaction, {
        correlationId: input.correlationId,
        eventType: "dispute.evidence_evaluated",
        subjectId: disputeId,
        payload: {
          dispute_id: disputeId,
          mandate_id: evidence.mandate_id,
          agent_id: evidence.agent_id,
          checkout_id: evidence.checkout_id,
          evidence_hash: evidence.evidence_hash,
          checks: evidence.checks,
          original_purchase_correlation_id: evidence.original_purchase_correlation_id,
          evaluated_at: now.toISOString(),
        },
        recordedAt: now,
        deduplicationKey: `dispute:${disputeId}:evidence`,
      });
      await this.ledger.append(transaction, {
        correlationId: input.correlationId,
        eventType: "dispute.resolved",
        subjectId: disputeId,
        payload: {
          dispute_id: disputeId,
          ...adjudication,
          resolved_at: now.toISOString(),
        },
        recordedAt: now,
        deduplicationKey: `dispute:${disputeId}:resolved`,
      });

      return { dispute: publicDispute(inserted), replayed: false };
    });
  }

  async get(principalId: string, disputeId: string): Promise<PurchaseDispute> {
    const row = (await this.database.db.select().from(purchaseDisputes).where(and(
      eq(purchaseDisputes.disputeId, disputeId),
      eq(purchaseDisputes.principalId, principalId),
    )).limit(1))[0];
    if (row === undefined) throw new PublicApiError(404, "not_found", "Dispute not found");
    return publicDispute(row);
  }

  async getForReceipt(principalId: string, receiptId: string): Promise<PurchaseDispute | null> {
    const row = (await this.database.db.select().from(purchaseDisputes).where(and(
      eq(purchaseDisputes.receiptId, receiptId),
      eq(purchaseDisputes.principalId, principalId),
    )).limit(1))[0];
    return row === undefined ? null : publicDispute(row);
  }

  private replay(input: OpenPurchaseDisputeInput, row: DisputeRow): OpenPurchaseDisputeResult {
    if (
      row.principalId !== input.principalId
      || row.receiptId !== input.receiptId
      || row.reason !== input.reason
    ) {
      throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was reused with different dispute data");
    }
    return { dispute: publicDispute(row), replayed: true };
  }

  private async loadOwnedPurchase(principalId: string, receiptId: string): Promise<PurchaseGraph> {
    const graph = (await this.database.db.select({
      order: orders,
      authorization: authorizations,
      payment: payments,
      mandate: mandates,
      checkout: checkouts,
      agent: agents,
    }).from(orders)
      .innerJoin(authorizations, eq(authorizations.authorizationId, orders.authorizationId))
      .innerJoin(payments, eq(payments.paymentId, orders.paymentId))
      .innerJoin(mandates, eq(mandates.mandateId, authorizations.mandateId))
      .innerJoin(checkouts, eq(checkouts.checkoutId, orders.checkoutId))
      .innerJoin(agents, eq(agents.agentId, authorizations.agentId))
      .where(eq(orders.receiptId, receiptId)).limit(1))[0];
    if (graph === undefined || graph.authorization.principalId !== principalId) {
      throw new PublicApiError(404, "not_found", "Receipt not found");
    }
    return graph;
  }
}
