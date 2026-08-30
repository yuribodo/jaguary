import { and, eq } from "drizzle-orm";

import {
  canonicalizeJson,
  mandateSchema,
  mandateStatusSchema,
  mandateTermsSchema,
  PublicApiError,
  sha256CanonicalJson,
  type ActiveMandate,
  type AgentEligibilityPort,
  type ClockPort,
  type CreateMandateDraftInput,
  type Mandate,
  type MandateTerms,
  type SignerPort,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection, TransactionClient } from "../../db/database.js";
import { agents, mandates, paymentCredentials } from "../../db/schema.js";
import {
  AuditLedgerService,
  PostgresAuditEventRepository,
  type AuditLedgerPort,
} from "../ledger/index.js";
import type { MandateBiometricConsentGate } from "./biometric-consent.js";

type MandateRow = typeof mandates.$inferSelect;

interface StoredMandate {
  row: MandateRow;
  credentialDisplay: string;
}

function maskedCredentialDisplay(display: string): string {
  const digits = display.replaceAll(/\D/g, "");
  if (digits.length > 4 || /(pan|cvv|token|secret)/i.test(display)) {
    return digits.length >= 4 ? `Payment •••• ${digits.slice(-4)}` : "Payment credential";
  }
  return display;
}

async function findStoredMandate(
  transaction: TransactionClient,
  mandateId: string,
  lock = false,
): Promise<StoredMandate | undefined> {
  const query = transaction
    .select({ row: mandates, credentialDisplay: paymentCredentials.display })
    .from(mandates)
    .innerJoin(paymentCredentials, eq(paymentCredentials.credentialId, mandates.credentialId))
    .where(eq(mandates.mandateId, mandateId));
  const rows = lock ? await query.for("update", { of: mandates }) : await query;
  return rows[0];
}

function rowTerms(row: MandateRow): MandateTerms {
  return mandateTermsSchema.parse({
    mandate_id: row.mandateId,
    version: row.version,
    ...(row.supersedesMandateId === null ? {} : { supersedes_mandate_id: row.supersedesMandateId }),
    principal_id: row.principalId,
    agent_id: row.agentId,
    allowed_merchant_ids: row.allowedMerchantIds,
    allowed_merchant_categories: row.allowedMerchantCategories,
    route: { origin: row.routeOrigin, destination: row.routeDestination },
    cabin: row.cabin,
    ...(row.flightConstraints === null ? {} : { flight_constraints: row.flightConstraints }),
    max_per_purchase: {
      amount: row.maxPerPurchaseAmount,
      currency: row.maxPerPurchaseCurrency,
    },
    max_aggregate: {
      amount: row.maxAggregateAmount,
      currency: row.maxAggregateCurrency,
    },
    max_uses: row.maxUses,
    valid_from: row.validFrom.toISOString(),
    expires_at: row.expiresAt.toISOString(),
    credential_id: row.credentialId,
  });
}

function publicMandate(stored: StoredMandate, now: Date): Mandate {
  const { row } = stored;
  const status = mandateStatusSchema.parse(row.status);
  const terms = rowTerms(row);
  const common = {
    terms,
    payment_credential: {
      credential_id: row.credentialId,
      display: maskedCredentialDisplay(stored.credentialDisplay),
    },
    status,
    created_at: row.createdAt.toISOString(),
  };
  if (status === "DRAFT") {
    return mandateSchema.parse({ ...common, authority_valid: false });
  }
  if (
    row.termsHash === null
    || row.principalSignatureAlgorithm === null
    || row.principalSignatureKeyId === null
    || row.principalSignatureValue === null
    || row.activatedAt === null
  ) {
    throw new Error("Signed mandate row is missing its activation proof");
  }
  const signed = {
    ...common,
    terms_hash: row.termsHash,
    principal_signature: {
      algorithm: row.principalSignatureAlgorithm,
      key_id: row.principalSignatureKeyId,
      value: row.principalSignatureValue,
    },
    activated_at: row.activatedAt.toISOString(),
    authority_valid: status === "ACTIVE"
      && now >= row.validFrom
      && now < row.expiresAt
      && row.termsHash === sha256CanonicalJson(terms),
  };
  if (status === "REVOKED") {
    if (row.revokedAt === null) throw new Error("Revoked mandate row is missing revoked_at");
    return mandateSchema.parse({ ...signed, authority_valid: false, revoked_at: row.revokedAt.toISOString() });
  }
  return mandateSchema.parse({ ...signed, authority_valid: status === "ACTIVE" ? signed.authority_valid : false });
}

async function persistExpiry(
  transaction: TransactionClient,
  stored: StoredMandate,
  now: Date,
): Promise<StoredMandate> {
  if (stored.row.status !== "ACTIVE" || now < stored.row.expiresAt) return stored;
  const updated = (await transaction
    .update(mandates)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(mandates.mandateId, stored.row.mandateId), eq(mandates.status, "ACTIVE")))
    .returning())[0];
  if (updated === undefined) throw new Error("Locked active mandate changed before expiry");
  return { ...stored, row: updated };
}

export class MandateService {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly signer: SignerPort,
    private readonly clock: ClockPort,
    private readonly ledger: AuditLedgerPort = new AuditLedgerService(
      new PostgresAuditEventRepository(database.db),
    ),
    private readonly eligibility?: AgentEligibilityPort,
    private readonly biometricConsent?: MandateBiometricConsentGate,
  ) {}

  async createDraft(
    input: CreateMandateDraftInput,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<{ mandate: Mandate; replayed: boolean }> {
    const requestHash = sha256CanonicalJson(input);
    return this.database.transaction(async (transaction) => {
      const replay = (await transaction
        .select({ mandateId: mandates.mandateId, creationRequestHash: mandates.creationRequestHash })
        .from(mandates)
        .where(eq(mandates.idempotencyKey, idempotencyKey)))[0];
      if (replay !== undefined) {
        if (replay.creationRequestHash !== requestHash) {
          throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was already used with a different request");
        }
        const stored = await findStoredMandate(transaction, replay.mandateId);
        if (stored === undefined) throw new Error("Idempotent mandate row disappeared");
        return { mandate: publicMandate(stored, this.clock.now()), replayed: true };
      }

      const existingId = (await transaction
        .select({ mandateId: mandates.mandateId })
        .from(mandates)
        .where(eq(mandates.mandateId, input.mandate_id)))[0];
      if (existingId !== undefined) {
        throw new PublicApiError(409, "idempotency_conflict", "Mandate ID already exists");
      }

      if (this.eligibility !== undefined) {
        const decision = await this.eligibility.evaluate(input.agent_id, input.principal_id, this.clock.now());
        if (!decision.eligible) throw new PublicApiError(403, decision.reason ?? "agent_not_active", "Mandate agent is not eligible");
      } else {
        const agent = (await transaction.select({ status: agents.status }).from(agents)
          .where(and(eq(agents.agentId, input.agent_id), eq(agents.principalId, input.principal_id))))[0];
        if (agent === undefined || agent.status !== "ACTIVE") throw new PublicApiError(400, "invalid_request", "Mandate agent is unknown or inactive");
      }
      const credential = (await transaction
        .select({ display: paymentCredentials.display })
        .from(paymentCredentials)
        .where(and(
          eq(paymentCredentials.credentialId, input.credential_id),
          eq(paymentCredentials.principalId, input.principal_id),
        )))[0];
      if (credential === undefined) {
        throw new PublicApiError(400, "invalid_request", "Payment credential is unknown for this principal");
      }

      let version = 1;
      if (input.supersedes_mandate_id !== undefined) {
        const previous = (await transaction
          .select({ version: mandates.version, principalId: mandates.principalId, agentId: mandates.agentId })
          .from(mandates)
          .where(eq(mandates.mandateId, input.supersedes_mandate_id)))[0];
        if (
          previous === undefined
          || previous.principalId !== input.principal_id
          || previous.agentId !== input.agent_id
        ) {
          throw new PublicApiError(400, "invalid_request", "Superseded mandate is unknown or has a different identity");
        }
        version = previous.version + 1;
      }

      const terms = mandateTermsSchema.parse({
        mandate_id: input.mandate_id,
        version,
        ...(input.supersedes_mandate_id === undefined ? {} : { supersedes_mandate_id: input.supersedes_mandate_id }),
        principal_id: input.principal_id,
        agent_id: input.agent_id,
        allowed_merchant_ids: input.allowed_merchant_ids,
        allowed_merchant_categories: input.allowed_merchant_categories,
        route: input.route,
        cabin: input.cabin,
        ...(input.flight_constraints === undefined ? {} : { flight_constraints: input.flight_constraints }),
        max_per_purchase: input.max_per_purchase,
        max_aggregate: input.max_aggregate,
        max_uses: input.max_uses,
        valid_from: input.valid_from,
        expires_at: input.expires_at,
        credential_id: input.credential_id,
      });
      const now = this.clock.now();
      await transaction.insert(mandates).values({
        mandateId: terms.mandate_id,
        version: terms.version,
        supersedesMandateId: terms.supersedes_mandate_id,
        principalId: terms.principal_id,
        agentId: terms.agent_id,
        allowedMerchantIds: terms.allowed_merchant_ids,
        allowedMerchantCategories: terms.allowed_merchant_categories,
        routeOrigin: terms.route.origin,
        routeDestination: terms.route.destination,
        cabin: terms.cabin,
        flightConstraints: terms.flight_constraints,
        maxPerPurchaseAmount: terms.max_per_purchase.amount,
        maxPerPurchaseCurrency: terms.max_per_purchase.currency,
        maxAggregateAmount: terms.max_aggregate.amount,
        maxAggregateCurrency: terms.max_aggregate.currency,
        maxUses: terms.max_uses,
        validFrom: new Date(terms.valid_from),
        expiresAt: new Date(terms.expires_at),
        credentialId: terms.credential_id,
        status: "DRAFT",
        creationRequestHash: requestHash,
        correlationId,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
      });
      await this.ledger.append(transaction, {
        correlationId,
        eventType: "mandate.created",
        subjectId: terms.mandate_id,
        payload: {
          mandate_id: terms.mandate_id,
          principal_id: terms.principal_id,
          agent_id: terms.agent_id,
          status: "DRAFT",
          created_at: now.toISOString(),
        },
        recordedAt: now,
      });
      const stored = await findStoredMandate(transaction, terms.mandate_id);
      if (stored === undefined) throw new Error("Created mandate row could not be read");
      return { mandate: publicMandate(stored, now), replayed: false };
    });
  }

  async getMandate(mandateId: string): Promise<Mandate> {
    return this.database.transaction(async (transaction) => {
      const stored = await findStoredMandate(transaction, mandateId, true);
      if (stored === undefined) throw new PublicApiError(404, "not_found", "Mandate not found");
      const now = this.clock.now();
      return publicMandate(await persistExpiry(transaction, stored, now), now);
    });
  }

  async loadActiveMandate(mandateId: string): Promise<ActiveMandate> {
    const mandate = await this.getMandate(mandateId);
    if (mandate.status === "ACTIVE" && mandate.authority_valid) return mandate;
    let code: "mandate_revoked" | "mandate_expired" | "mandate_not_active" = "mandate_not_active";
    if (mandate.status === "REVOKED") code = "mandate_revoked";
    else if (mandate.status === "EXPIRED") code = "mandate_expired";
    throw new PublicApiError(409, code, "Mandate is not current active authority", {
      current_status: mandate.status,
    });
  }

  async activate(
    mandateId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<Mandate> {
    return this.database.transaction(async (transaction) => {
      const replay = (await transaction
        .select({ mandateId: mandates.mandateId })
        .from(mandates)
        .where(eq(mandates.activationIdempotencyKey, idempotencyKey)))[0];
      if (replay !== undefined && replay.mandateId !== mandateId) {
        throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was already used for another mandate");
      }

      const stored = await findStoredMandate(transaction, mandateId, true);
      if (stored === undefined) throw new PublicApiError(404, "not_found", "Mandate not found");
      if (stored.row.status !== "DRAFT") {
        if (stored.row.activationIdempotencyKey === idempotencyKey) {
          return publicMandate(stored, this.clock.now());
        }
        throw new PublicApiError(409, "mandate_not_active", "Only a draft mandate can be activated", {
          current_status: stored.row.status,
        });
      }

      const now = this.clock.now();
      if (now >= stored.row.expiresAt) {
        throw new PublicApiError(409, "mandate_expired", "Expired mandate terms cannot be activated");
      }
      const terms = rowTerms(stored.row);
      const canonicalTerms = canonicalizeJson(terms);
      const termsHash = sha256CanonicalJson(terms);
      const biometricProof = this.biometricConsent === undefined ? undefined : await this.biometricConsent.consumeInTransaction(transaction, {
        mandateId,
        principalId: terms.principal_id,
        agentId: terms.agent_id,
        termsHash,
        correlationId,
        now,
      });
      const signature = await this.signer.sign(new TextEncoder().encode(canonicalTerms));
      const updated = (await transaction
        .update(mandates)
        .set({
          status: "ACTIVE",
          termsHash,
          principalSignatureAlgorithm: signature.algorithm,
          principalSignatureKeyId: signature.key_id,
          principalSignatureValue: signature.value,
          activationIdempotencyKey: idempotencyKey,
          activatedAt: now,
          updatedAt: now,
        })
        .where(and(eq(mandates.mandateId, mandateId), eq(mandates.status, "DRAFT")))
        .returning({ mandateId: mandates.mandateId }))[0];
      if (updated === undefined) throw new Error("Locked draft mandate changed before activation");
      await this.ledger.append(transaction, {
        correlationId,
        eventType: "mandate.activated",
        subjectId: mandateId,
        payload: {
          mandate_id: mandateId,
          from_status: "DRAFT",
          to_status: "ACTIVE",
          terms_hash: termsHash,
          ...(biometricProof === undefined ? {} : {
            biometric_consent_id: biometricProof.consentId,
            biometric_evidence_hash: biometricProof.evidenceHash,
          }),
          occurred_at: now.toISOString(),
        },
        recordedAt: now,
      });
      const activated = await findStoredMandate(transaction, mandateId);
      if (activated === undefined) throw new Error("Activated mandate row could not be read");
      return publicMandate(activated, now);
    });
  }

  async revoke(
    mandateId: string,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<Mandate> {
    const outcome = await this.database.transaction(async (transaction): Promise<
      { kind: "revoked"; mandate: Mandate } | { kind: "expired" }
    > => {
      const replay = (await transaction
        .select({ mandateId: mandates.mandateId })
        .from(mandates)
        .where(eq(mandates.revocationIdempotencyKey, idempotencyKey)))[0];
      if (replay !== undefined && replay.mandateId !== mandateId) {
        throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was already used for another mandate");
      }

      const stored = await findStoredMandate(transaction, mandateId, true);
      if (stored === undefined) throw new PublicApiError(404, "not_found", "Mandate not found");
      const now = this.clock.now();
      if (stored.row.status === "REVOKED") {
        return { kind: "revoked", mandate: publicMandate(stored, now) };
      }
      if (stored.row.status !== "ACTIVE") {
        const code = stored.row.status === "EXPIRED" ? "mandate_expired" : "mandate_not_active";
        throw new PublicApiError(409, code, "Only an active mandate can be revoked", {
          current_status: stored.row.status,
        });
      }
      if (now >= stored.row.expiresAt) {
        await persistExpiry(transaction, stored, now);
        return { kind: "expired" };
      }

      const revokedAt = now.toISOString();
      const updated = (await transaction
        .update(mandates)
        .set({
          status: "REVOKED",
          revokedAt: now,
          revocationIdempotencyKey: idempotencyKey,
          updatedAt: now,
        })
        .where(and(eq(mandates.mandateId, mandateId), eq(mandates.status, "ACTIVE")))
        .returning({ mandateId: mandates.mandateId }))[0];
      if (updated === undefined) throw new Error("Locked active mandate changed before revocation");

      await this.ledger.append(transaction, {
        correlationId,
        eventType: "mandate.revoked",
        subjectId: mandateId,
        payload: {
          mandate_id: mandateId,
          from_status: "ACTIVE",
          to_status: "REVOKED",
          payment_executor_called: false,
          occurred_at: revokedAt,
        },
        recordedAt: now,
      });

      const revoked = await findStoredMandate(transaction, mandateId);
      if (revoked === undefined) throw new Error("Revoked mandate row could not be read");
      return { kind: "revoked", mandate: publicMandate(revoked, now) };
    });
    if (outcome.kind === "expired") {
      throw new PublicApiError(409, "mandate_expired", "Expired mandates cannot be revoked");
    }
    return outcome.mandate;
  }
}

export async function loadMandateForVerification(
  transaction: TransactionClient,
  mandateId: string,
  now: Date,
): Promise<Mandate | undefined> {
  const stored = await findStoredMandate(transaction, mandateId, true);
  if (stored === undefined) return undefined;
  return publicMandate(await persistExpiry(transaction, stored, now), now);
}
