import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import {
  authorizedPaymentSchema,
  canonicalizeJson,
  paymentResultSchema,
  PublicApiError,
  type ClockPort,
  type PaymentResult,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection } from "../../db/database.js";
import {
  authorizations,
  checkouts,
  mandates,
  paymentCredentials,
  payments,
} from "../../db/schema.js";

import type { PaymentClaim, PaymentClaimStore } from "./service.js";

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
): Promise<PaymentClaim | undefined> {
  const row = (await database
    .select()
    .from(payments)
    .where(and(
      eq(payments.authorizationId, authorizationId),
      eq(payments.idempotencyKey, authorizationId),
    ))
    .limit(1))[0];
  if (row === undefined) return undefined;
  const result = paymentResultFromRow(row);
  if (result !== undefined) return { kind: "COMPLETED", result };
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

function maskedCredentialDisplay(display: string): string {
  const digits = display.replaceAll(/\D/g, "");
  if (digits.length > 4 || /(pan|cvv|token|secret)/i.test(display)) {
    return digits.length >= 4 ? `Payment •••• ${digits.slice(-4)}` : "Payment credential";
  }
  return display;
}

export class PostgresPaymentClaimStore implements PaymentClaimStore {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly clock: ClockPort,
  ) {}

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
        const existing = await existingClaim(transaction, authorizationId);
        if (existing !== undefined) return existing;
        throw new PublicApiError(409, "invalid_request", "Authorization is not payable", {
          authorization_id: authorizationId,
          status: authorization.status,
        });
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
        const existing = await existingClaim(transaction, authorizationId);
        if (existing !== undefined) return existing;
        throw new PublicApiError(409, "invalid_request", "Authorization is expired or already claimed", {
          authorization_id: authorizationId,
        });
      }

      const paymentAttemptId = `payment_attempt_${randomUUID()}`;
      await transaction.insert(payments).values({
        paymentAttemptId,
        authorizationId,
        credentialId: binding.mandate.credentialId,
        amount: authorization.reservedAmount,
        currency: authorization.currency,
        correlationId,
        idempotencyKey: authorizationId,
        createdAt: now,
        updatedAt: now,
      });
      return {
        kind: "CLAIMED",
        payment_attempt_id: paymentAttemptId,
        idempotency_key: authorizationId,
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
    const updated = (await this.database.db
      .update(payments)
      .set({
        status: parsed.status,
        paymentId: "payment_id" in parsed ? (parsed.payment_id ?? null) : null,
        providerReference: "provider_reference" in parsed
          ? (parsed.provider_reference ?? null)
          : null,
        declineCode: "decline_code" in parsed ? parsed.decline_code : null,
        occurredAt: new Date(parsed.occurred_at),
        updatedAt: this.clock.now(),
      })
      .where(and(
        eq(payments.paymentAttemptId, paymentAttemptId),
        isNull(payments.status),
      ))
      .returning())[0];
    if (updated !== undefined) return paymentResultFromRow(updated)!;

    const existing = (await this.database.db
      .select()
      .from(payments)
      .where(eq(payments.paymentAttemptId, paymentAttemptId))
      .limit(1))[0];
    const stored = existing === undefined ? undefined : paymentResultFromRow(existing);
    if (stored !== undefined && canonicalizeJson(stored) === canonicalizeJson(parsed)) return stored;
    throw new Error("Payment result could not be persisted exactly once");
  }
}
