import { randomUUID } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import {
  authorizedPaymentSchema,
  authorizationStatusSchema,
  canonicalizeJson,
  canTransitionAuthorization,
  paymentResultSchema,
  PublicApiError,
  sha256CanonicalJson,
  type ClockPort,
  type AuthorizationStatus,
  type PaymentResult,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection } from "../../db/database.js";
import {
  authorizations,
  checkouts,
  mandates,
  orders,
  paymentCredentials,
  payments,
} from "../../db/schema.js";
import {
  AuditLedgerService,
  PostgresAuditEventRepository,
  type AuditLedgerPort,
} from "../ledger/index.js";

import type {
  PaymentClaim,
  PaymentClaimStore,
  PaymentReconciliationAttempt,
  PaymentReconciliationStore,
} from "./service.js";

type AuthorizationRow = typeof authorizations.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function paymentResultFromRow(row: PaymentRow): PaymentResult | undefined {
  if (row.status === null || row.occurredAt === null) return undefined;
  const base = {
    authorization_id: row.authorizationId,
    amount: { amount: row.amount, currency: row.currency },
    occurred_at: row.occurredAt.toISOString(),
  };
  switch (row.status) {
    case "APPROVED":
      return paymentResultSchema.parse({
        ...base,
        status: row.status,
        payment_id: row.paymentId,
        ...(row.providerReference === null ? {} : { provider_reference: row.providerReference }),
      });
    case "DECLINED":
      return paymentResultSchema.parse({
        ...base,
        status: row.status,
        ...(row.paymentId === null ? {} : { payment_id: row.paymentId }),
        decline_code: row.declineCode,
      });
    case "TIMEOUT":
      return paymentResultSchema.parse({ ...base, status: row.status });
    case "UNKNOWN":
      return paymentResultSchema.parse({
        ...base,
        status: row.status,
        ...(row.paymentId === null ? {} : { payment_id: row.paymentId }),
      });
    default:
      throw new Error("Stored payment has an unsupported result status");
  }
}

async function existingClaim(
  database: DatabaseClient,
  authorizationId: string,
  authorizationStatus: AuthorizationStatus,
): Promise<PaymentClaim | undefined> {
  const row = (await database
    .select()
    .from(payments)
    .where(eq(payments.authorizationId, authorizationId))
    .limit(1))[0];
  if (row === undefined) return undefined;
  const result = paymentResultFromRow(row);
  if (result !== undefined) {
    if (authorizationStatusFor(result) !== authorizationStatus) {
      throw new Error("Persisted payment result and authorization status are inconsistent");
    }
    return { kind: "COMPLETED", result };
  }
  throw new PublicApiError(409, "invalid_request", "Payment is already pending", {
    authorization_id: authorizationId,
  });
}

function assertPersistedBindings(
  authorization: AuthorizationRow,
  binding: {
    mandate: typeof mandates.$inferSelect | undefined;
    checkout: typeof checkouts.$inferSelect | undefined;
    credential: typeof paymentCredentials.$inferSelect | undefined;
  },
): asserts binding is {
  mandate: typeof mandates.$inferSelect;
  checkout: typeof checkouts.$inferSelect;
  credential: typeof paymentCredentials.$inferSelect;
} {
  const valid = binding.mandate !== undefined
    && binding.checkout !== undefined
    && binding.credential !== undefined
    && authorization.mandateId === binding.mandate.mandateId
    && authorization.principalId === binding.mandate.principalId
    && authorization.agentId === binding.mandate.agentId
    && authorization.checkoutId === binding.checkout.checkoutId
    && authorization.checkoutHash === binding.checkout.checkoutHash
    && authorization.merchantId === binding.checkout.merchantId
    && authorization.allowedMerchantIds.includes(binding.checkout.merchantId)
    && authorization.reservedAmount === binding.checkout.totalAmount
    && authorization.currency === binding.checkout.currency
    && binding.mandate.credentialId === binding.credential.credentialId
    && binding.mandate.principalId === binding.credential.principalId;
  if (!valid) {
    throw new PublicApiError(
      422,
      "checkout_integrity_failure",
      "Persisted payment bindings are inconsistent",
    );
  }
}

function assertResultBindings(payment: PaymentRow, result: PaymentResult): void {
  if (
    result.authorization_id !== payment.authorizationId
    || result.amount.amount !== payment.amount
    || result.amount.currency !== payment.currency
  ) {
    throw new Error("Payment result does not match its persisted attempt");
  }
}

function maskedCredentialDisplay(display: string): string {
  const digits = display.replaceAll(/\D/g, "");
  if (digits.length > 4 || /(pan|cvv|token|secret)/i.test(display)) {
    return digits.length >= 4 ? `Payment •••• ${digits.slice(-4)}` : "Payment credential";
  }
  return display;
}

function stableIdentifier(prefix: string, source: string): string {
  const readable = `${prefix}_${source}`;
  return readable.length <= 128
    ? readable
    : `${prefix}_${sha256CanonicalJson({ source }).slice(0, 32)}`;
}

function authorizationStatusFor(result: PaymentResult): "PAYMENT_PENDING" | "CONSUMED" | "FAILED" {
  if (result.status === "APPROVED") return "CONSUMED";
  if (result.status === "DECLINED") return "FAILED";
  return "PAYMENT_PENDING";
}

function resultUpdate(result: PaymentResult, updatedAt: Date) {
  return {
    status: result.status,
    paymentId: "payment_id" in result ? (result.payment_id ?? null) : null,
    providerReference: "provider_reference" in result
      ? (result.provider_reference ?? null)
      : null,
    declineCode: "decline_code" in result ? result.decline_code : null,
    occurredAt: new Date(result.occurred_at),
    updatedAt,
  };
}

function canReplacePendingResult(stored: PaymentResult, incoming: PaymentResult): boolean {
  return (stored.status === "TIMEOUT" || stored.status === "UNKNOWN")
    && (incoming.status === "APPROVED" || incoming.status === "DECLINED")
    && (!("payment_id" in stored) || stored.payment_id === undefined
      || !("payment_id" in incoming) || stored.payment_id === incoming.payment_id);
}

export class PostgresPaymentClaimStore implements PaymentClaimStore, PaymentReconciliationStore {
  readonly #ledger: AuditLedgerPort;

  constructor(
    private readonly database: DatabaseConnection,
    private readonly clock: ClockPort,
    ledger?: AuditLedgerPort,
  ) {
    this.#ledger = ledger
      ?? new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  }

  async claim(authorizationId: string, correlationId: string): Promise<PaymentClaim> {
    return this.database.transaction(async (transaction) => {
      const authorization = (await transaction
        .select()
        .from(authorizations)
        .where(eq(authorizations.authorizationId, authorizationId))
        .limit(1)
        .for("update"))[0];
      if (authorization === undefined) {
        throw new PublicApiError(404, "not_found", "Authorization not found", {
          authorization_id: authorizationId,
        });
      }
      if (authorization.status !== "RESERVED") {
        const existing = await existingClaim(
          transaction,
          authorizationId,
          authorizationStatusSchema.parse(authorization.status),
        );
        if (existing !== undefined) return existing;
        throw new PublicApiError(409, "invalid_request", "Authorization is not payable", {
          authorization_id: authorizationId,
          status: authorization.status,
        });
      }
      if (!canTransitionAuthorization("RESERVED", "PAYMENT_PENDING")) {
        throw new Error("Payment state machine rejected RESERVED to PAYMENT_PENDING");
      }

      const mandate = (await transaction
        .select()
        .from(mandates)
        .where(eq(mandates.mandateId, authorization.mandateId))
        .limit(1)
        .for("share"))[0];
      const checkout = (await transaction
        .select()
        .from(checkouts)
        .where(eq(checkouts.checkoutId, authorization.checkoutId))
        .limit(1)
        .for("share"))[0];
      const credential = mandate === undefined
        ? undefined
        : (await transaction
          .select()
          .from(paymentCredentials)
          .where(eq(paymentCredentials.credentialId, mandate.credentialId))
          .limit(1)
          .for("share"))[0];
      const binding = { mandate, checkout, credential };
      assertPersistedBindings(authorization, binding);

      const now = this.clock.now();
      const claimed = (await transaction
        .update(authorizations)
        .set({ status: "PAYMENT_PENDING", updatedAt: now })
        .where(and(
          eq(authorizations.authorizationId, authorizationId),
          eq(authorizations.status, "RESERVED"),
          gt(authorizations.expiresAt, now),
        ))
        .returning({ authorizationId: authorizations.authorizationId }))[0];
      if (claimed === undefined) {
        const existing = await existingClaim(
          transaction,
          authorizationId,
          authorizationStatusSchema.parse(authorization.status),
        );
        if (existing !== undefined) return existing;
        throw new PublicApiError(409, "invalid_request", "Authorization is expired or already claimed", {
          authorization_id: authorizationId,
        });
      }

      const paymentAttemptId = `payment_attempt_${randomUUID()}`;
      const providerIdempotencyKey = randomUUID();
      await transaction.insert(payments).values({
        paymentAttemptId,
        authorizationId,
        credentialId: binding.mandate.credentialId,
        amount: authorization.reservedAmount,
        currency: authorization.currency,
        correlationId,
        providerIdempotencyKey,
        createdAt: now,
        updatedAt: now,
      });
      await this.#ledger.append(transaction, {
        correlationId,
        eventType: "payment.claimed",
        subjectId: authorizationId,
        payload: {
          payment_attempt_id: paymentAttemptId,
          authorization_id: authorizationId,
          provider_idempotency_key: providerIdempotencyKey,
          from_status: "RESERVED",
          to_status: "PAYMENT_PENDING",
          amount: { amount: authorization.reservedAmount, currency: authorization.currency },
          claimed_at: now.toISOString(),
        },
        recordedAt: now,
      });
      return {
        kind: "CLAIMED",
        payment_attempt_id: paymentAttemptId,
        idempotency_key: providerIdempotencyKey,
        payment: authorizedPaymentSchema.parse({
          authorization: {
            authorization_id: authorization.authorizationId,
            mandate_id: authorization.mandateId,
            checkout_id: authorization.checkoutId,
            checkout_hash: authorization.checkoutHash,
            principal_id: authorization.principalId,
            agent_id: authorization.agentId,
            merchant_id: authorization.merchantId,
            reserved_amount: {
              amount: authorization.reservedAmount,
              currency: authorization.currency,
            },
            status: "RESERVED",
            reserved_at: authorization.reservedAt.toISOString(),
            expires_at: authorization.expiresAt.toISOString(),
          },
          credential: {
            credential_id: binding.credential.credentialId,
            display: maskedCredentialDisplay(binding.credential.display),
          },
          correlation_id: correlationId,
        }),
      };
    });
  }

  async persistResult(paymentAttemptId: string, result: PaymentResult): Promise<PaymentResult> {
    const parsed = paymentResultSchema.parse(result);
    return this.database.transaction(async (transaction) => {
      const payment = (await transaction
        .select()
        .from(payments)
        .where(eq(payments.paymentAttemptId, paymentAttemptId))
        .limit(1)
        .for("update"))[0];
      if (payment === undefined) throw new Error("Payment attempt does not exist");
      assertResultBindings(payment, parsed);

      const stored = paymentResultFromRow(payment);
      if (stored !== undefined) {
        if (canonicalizeJson(stored) === canonicalizeJson(parsed)) return stored;
        if (!canReplacePendingResult(stored, parsed)) {
          throw new Error("Payment result conflicts with the result already persisted");
        }
      }

      const authorization = (await transaction
        .select()
        .from(authorizations)
        .where(eq(authorizations.authorizationId, payment.authorizationId))
        .limit(1)
        .for("update"))[0];
      if (authorization === undefined || authorization.status !== "PAYMENT_PENDING") {
        throw new Error("Payment result cannot transition a non-pending authorization");
      }

      const nextAuthorizationStatus = authorizationStatusFor(parsed);
      if (
        nextAuthorizationStatus !== "PAYMENT_PENDING"
        && !canTransitionAuthorization("PAYMENT_PENDING", nextAuthorizationStatus)
      ) {
        throw new Error("Payment state machine rejected the terminal transition");
      }

      const now = this.clock.now();
      const updatedPayment = (await transaction
        .update(payments)
        .set(resultUpdate(parsed, now))
        .where(eq(payments.paymentAttemptId, paymentAttemptId))
        .returning())[0];
      if (updatedPayment === undefined) throw new Error("Payment result update returned no row");

      if (nextAuthorizationStatus !== "PAYMENT_PENDING") {
        const transitioned = (await transaction
          .update(authorizations)
          .set({ status: nextAuthorizationStatus, updatedAt: now })
          .where(and(
            eq(authorizations.authorizationId, authorization.authorizationId),
            eq(authorizations.status, "PAYMENT_PENDING"),
          ))
          .returning({ authorizationId: authorizations.authorizationId }))[0];
        if (transitioned === undefined) throw new Error("Authorization terminal transition lost its claim");
      }

      await this.#ledger.append(transaction, {
        correlationId: payment.correlationId,
        eventType: "payment.result_recorded",
        subjectId: payment.authorizationId,
        payload: {
          payment_attempt_id: payment.paymentAttemptId,
          authorization_id: payment.authorizationId,
          provider_idempotency_key: payment.providerIdempotencyKey,
          result_status: parsed.status,
          from_status: "PAYMENT_PENDING",
          to_status: nextAuthorizationStatus,
          ...("payment_id" in parsed && parsed.payment_id !== undefined
            ? { payment_id: parsed.payment_id }
            : {}),
          ...("provider_reference" in parsed && parsed.provider_reference !== undefined
            ? { provider_reference: parsed.provider_reference }
            : {}),
          ...("decline_code" in parsed ? { decline_code: parsed.decline_code } : {}),
          amount: parsed.amount,
          occurred_at: parsed.occurred_at,
          recorded_at: now.toISOString(),
        },
        recordedAt: now,
      });

      if (parsed.status === "APPROVED") {
        const checkout = (await transaction
          .select()
          .from(checkouts)
          .where(eq(checkouts.checkoutId, authorization.checkoutId))
          .limit(1))[0];
        if (checkout === undefined) throw new Error("Approved payment checkout does not exist");
        const orderId = stableIdentifier("order", authorization.authorizationId);
        const orderEvent = await this.#ledger.append(transaction, {
          correlationId: payment.correlationId,
          eventType: "order.confirmed",
          subjectId: orderId,
          payload: {
            order_id: orderId,
            checkout_id: checkout.checkoutId,
            authorization_id: authorization.authorizationId,
            payment_id: parsed.payment_id,
            merchant_id: checkout.merchantId,
            total: { amount: checkout.totalAmount, currency: checkout.currency },
            confirmed_at: now.toISOString(),
          },
          recordedAt: now,
        });
        await transaction.insert(orders).values({
          orderId,
          receiptId: stableIdentifier("receipt", authorization.authorizationId),
          checkoutId: checkout.checkoutId,
          authorizationId: authorization.authorizationId,
          paymentId: parsed.payment_id,
          merchantId: checkout.merchantId,
          status: "CONFIRMED",
          items: checkout.items,
          totalAmount: checkout.totalAmount,
          currency: checkout.currency,
          fulfillment: checkout.fulfillment,
          auditEventId: orderEvent.eventId,
          correlationId: payment.correlationId,
          idempotencyKey: payment.providerIdempotencyKey,
          issuedAt: now,
          updatedAt: now,
        });
      }

      return paymentResultFromRow(updatedPayment)!;
    });
  }

  async loadPendingAttempt(authorizationId: string): Promise<PaymentReconciliationAttempt> {
    const row = (await this.database.db
      .select({
        paymentAttemptId: payments.paymentAttemptId,
        providerIdempotencyKey: payments.providerIdempotencyKey,
        authorizationStatus: authorizations.status,
      })
      .from(payments)
      .innerJoin(authorizations, eq(authorizations.authorizationId, payments.authorizationId))
      .where(eq(payments.authorizationId, authorizationId))
      .limit(1))[0];
    if (row === undefined || row.authorizationStatus !== "PAYMENT_PENDING") {
      throw new PublicApiError(409, "invalid_request", "Payment is not pending reconciliation", {
        authorization_id: authorizationId,
      });
    }
    return {
      payment_attempt_id: row.paymentAttemptId,
      idempotency_key: row.providerIdempotencyKey,
    };
  }

  async persistReconciledResult(
    authorizationId: string,
    providerIdempotencyKey: string,
    result: PaymentResult,
  ): Promise<PaymentResult> {
    const attempt = await this.loadPendingAttempt(authorizationId);
    if (attempt.idempotency_key !== providerIdempotencyKey) {
      throw new Error("Reconciliation provider idempotency key does not match the pending attempt");
    }
    return this.persistResult(attempt.payment_attempt_id, result);
  }
}
