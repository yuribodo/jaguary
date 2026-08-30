import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import {
  PublicApiError,
  mandateBiometricConsentSchema,
  sha256CanonicalJson,
  type ClockPort,
  type NormalizedProviderEvent,
  type PrincipalSession,
  type ProviderAssessmentResult,
  type MandateBiometricConsent,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection, TransactionClient } from "../../db/database.js";
import { mandateBiometricConsents } from "../../db/schema.js";
import { randomOpaqueToken } from "../auth/crypto.js";
import type { AuditLedgerPort } from "../ledger/index.js";
import type { DiditAgentAttestationProvider } from "../trust/didit-provider.js";
import type { AgentTrustRepositoryPort } from "../../contracts/v1/index.js";
import type { MandateService } from "./service.js";

type ConsentStatus = "PREPARING" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "ERROR" | "CONSUMED";
type ConsentRow = typeof mandateBiometricConsents.$inferSelect;

class ConsentReferenceCipher {
  readonly #key: Buffer;
  constructor(secret: string) { this.#key = createHash("sha256").update(`bound-mandate-biometric-consent:${secret}`).digest(); }
  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const data = Buffer.concat([cipher.update(value), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
  }
  decrypt(value: string): string {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", this.#key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString();
  }
}

export interface MandateBiometricConsentGate {
  consumeInTransaction(transaction: TransactionClient, input: {
    mandateId: string;
    principalId: string;
    agentId: string;
    termsHash: string;
    correlationId: string;
    now: Date;
  }): Promise<{ consentId: string; evidenceHash: string }>;
}

type TrustRepository = AgentTrustRepositoryPort & {
  getProviderAssessmentId(attestationId: string): Promise<string>;
  getCurrentForPrincipal(agentId: string, principalId: string, now: Date): ReturnType<AgentTrustRepositoryPort["getCurrent"]>;
};

export interface MandateBiometricConsentServiceOptions {
  database: DatabaseConnection;
  mandates: Pick<MandateService, "getMandate">;
  trust: TrustRepository;
  provider: Pick<DiditAgentAttestationProvider, "createBiometricAuthentication" | "getAssessment">;
  ledger: AuditLedgerPort;
  clock: ClockPort;
  callbackUrl: string;
  encryptionSecret: string;
  ttlSeconds?: number;
}

function publicStatus(status: ProviderAssessmentResult["status"]): "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "ERROR" {
  switch (status) {
    case "PENDING": return "PENDING";
    case "VERIFIED": return "VERIFIED";
    case "REJECTED": return "REJECTED";
    case "EXPIRED": return "EXPIRED";
    case "ERROR": return "ERROR";
  }
}

export class MandateBiometricConsentService implements MandateBiometricConsentGate {
  readonly #cipher: ConsentReferenceCipher;
  readonly #ttlSeconds: number;

  constructor(private readonly options: MandateBiometricConsentServiceOptions) {
    this.#cipher = new ConsentReferenceCipher(options.encryptionSecret);
    this.#ttlSeconds = options.ttlSeconds ?? 600;
  }

  #view(row: ConsentRow): MandateBiometricConsent {
    return mandateBiometricConsentSchema.parse({
      consent_id: row.consentId,
      mandate_id: row.mandateId,
      status: row.status as ConsentStatus,
      terms_hash: row.termsHash,
      expires_at: row.expiresAt.toISOString(),
      hosted_verification_url: row.hostedUrlCiphertext === null ? null : this.#cipher.decrypt(row.hostedUrlCiphertext),
    });
  }

  async start(session: PrincipalSession, mandateId: string, input: {
    consent: boolean;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<MandateBiometricConsent> {
    if (input.consent !== true) throw new PublicApiError(400, "invalid_request", "Explicit biometric consent is required");
    const mandate = await this.options.mandates.getMandate(mandateId);
    if (mandate.terms.principal_id !== session.principal.principal_id) throw new PublicApiError(404, "not_found", "Mandate not found");
    if (mandate.status !== "DRAFT") throw new PublicApiError(409, "mandate_not_active", "Only a draft mandate can receive biometric consent");
    const termsHash = sha256CanonicalJson(mandate.terms);
    const trust = await this.options.trust.getCurrentForPrincipal(
      mandate.terms.agent_id,
      session.principal.principal_id,
      this.options.clock.now(),
    );
    if (trust.attestation_id === null || trust.attestation_status !== "VERIFIED") {
      throw new PublicApiError(403, "principal_attestation_required", "Your approved identity verification is required");
    }
    const onboardingAttestationId = trust.attestation_id;

    const now = this.options.clock.now();
    const prepared = await this.options.database.transaction(async (transaction) => {
      const replay = (await transaction.select().from(mandateBiometricConsents)
        .where(eq(mandateBiometricConsents.creationIdempotencyKey, input.idempotencyKey)).for("update"))[0];
      if (replay !== undefined) {
        if (replay.mandateId !== mandateId || replay.principalId !== session.principal.principal_id || replay.termsHash !== termsHash) {
          throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was reused for another biometric consent");
        }
        return replay;
      }
      const active = (await transaction.select().from(mandateBiometricConsents).where(and(
        eq(mandateBiometricConsents.mandateId, mandateId),
        eq(mandateBiometricConsents.termsHash, termsHash),
        gt(mandateBiometricConsents.expiresAt, now),
      )).orderBy(desc(mandateBiometricConsents.createdAt)).for("update"))[0];
      if (active !== undefined && ["PREPARING", "PENDING", "VERIFIED"].includes(active.status)) return active;

      const consentId = `bioconsent_${randomUUID()}`;
      const vendorData = `biometric_${randomOpaqueToken()}`;
      const expiresAt = new Date(now.getTime() + this.#ttlSeconds * 1_000);
      const evidenceHash = sha256CanonicalJson({ consent_id: consentId, mandate_id: mandateId, terms_hash: termsHash, status: "PREPARING" });
      const inserted = (await transaction.insert(mandateBiometricConsents).values({
        consentId,
        mandateId,
        principalId: session.principal.principal_id,
        agentId: mandate.terms.agent_id,
        termsHash,
        onboardingAttestationId,
        provider: "didit",
        providerVendorDataHash: sha256CanonicalJson(vendorData),
        providerVendorDataCiphertext: this.#cipher.encrypt(vendorData),
        status: "PREPARING",
        evidenceHash,
        correlationId: input.correlationId,
        creationIdempotencyKey: input.idempotencyKey,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      }).returning())[0]!;
      await this.options.ledger.append(transaction, {
        correlationId: input.correlationId,
        eventType: "mandate.biometric_consent_started",
        subjectId: mandateId,
        payload: { consent_id: consentId, mandate_id: mandateId, terms_hash: termsHash, status: "PREPARING", expires_at: expiresAt.toISOString(), occurred_at: now.toISOString() },
        recordedAt: now,
        deduplicationKey: `mandate-biometric-consent-started:${consentId}`,
      });
      return inserted;
    });

    if (prepared.status !== "PREPARING") return this.#view(prepared);
    try {
      const referenceAssessmentId = await this.options.trust.getProviderAssessmentId(prepared.onboardingAttestationId);
      const providerSession = await this.options.provider.createBiometricAuthentication({
        referenceAssessmentId,
        vendorData: this.#cipher.decrypt(prepared.providerVendorDataCiphertext),
        callbackUrl: this.options.callbackUrl,
      });
      const pending = (await this.options.database.db.update(mandateBiometricConsents).set({
        providerAssessmentHash: sha256CanonicalJson(providerSession.assessmentId),
        providerAssessmentCiphertext: this.#cipher.encrypt(providerSession.assessmentId),
        hostedUrlCiphertext: this.#cipher.encrypt(providerSession.hostedUrl),
        status: "PENDING",
        evidenceHash: sha256CanonicalJson({ consent_id: prepared.consentId, mandate_id: mandateId, terms_hash: termsHash, provider_assessment_id: providerSession.assessmentId, status: "PENDING" }),
        updatedAt: this.options.clock.now(),
      }).where(and(eq(mandateBiometricConsents.consentId, prepared.consentId), eq(mandateBiometricConsents.status, "PREPARING"))).returning())[0];
      if (pending === undefined) throw new Error("Prepared biometric consent changed before provider attachment");
      return this.#view(pending);
    } catch {
      await this.options.database.db.update(mandateBiometricConsents).set({ status: "ERROR", failureCode: "provider_unavailable", hostedUrlCiphertext: null, updatedAt: this.options.clock.now() })
        .where(and(eq(mandateBiometricConsents.consentId, prepared.consentId), eq(mandateBiometricConsents.status, "PREPARING")));
      throw new PublicApiError(503, "agent_attestation_provider_unavailable", "Biometric verification provider is temporarily unavailable");
    }
  }

  async refresh(session: PrincipalSession, consentId: string, correlationId: string): Promise<MandateBiometricConsent> {
    const row = (await this.options.database.db.select().from(mandateBiometricConsents).where(and(
      eq(mandateBiometricConsents.consentId, consentId),
      eq(mandateBiometricConsents.principalId, session.principal.principal_id),
    )))[0];
    if (row === undefined) throw new PublicApiError(404, "not_found", "Biometric consent not found");
    if (row.status === "CONSUMED" || row.status === "VERIFIED") return this.#view(row);
    if (row.providerAssessmentCiphertext === null) throw new PublicApiError(409, "biometric_consent_pending", "Biometric consent is not ready for reconciliation");
    let result: ProviderAssessmentResult;
    try { result = await this.options.provider.getAssessment(this.#cipher.decrypt(row.providerAssessmentCiphertext)); }
    catch { throw new PublicApiError(503, "agent_attestation_provider_unavailable", "Biometric verification provider is temporarily unavailable"); }
    return this.#view(await this.#applyResult(row.consentId, result, correlationId));
  }

  async applyProviderEvent(event: NormalizedProviderEvent, correlationId: string): Promise<boolean> {
    const row = (await this.options.database.db.select({ consentId: mandateBiometricConsents.consentId }).from(mandateBiometricConsents).where(and(
      eq(mandateBiometricConsents.provider, event.provider),
      eq(mandateBiometricConsents.providerAssessmentHash, sha256CanonicalJson(event.assessmentId)),
    )))[0];
    if (row === undefined) return false;
    await this.#applyResult(row.consentId, event, correlationId, event.eventId);
    return true;
  }

  async #applyResult(consentId: string, result: ProviderAssessmentResult, correlationId: string, providerEventId?: string): Promise<ConsentRow> {
    return this.options.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(mandateBiometricConsents).where(eq(mandateBiometricConsents.consentId, consentId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Biometric consent not found");
      if (["CONSUMED", "VERIFIED", "REJECTED", "EXPIRED"].includes(row.status)) return row;
      const now = this.options.clock.now();
      const status = now >= row.expiresAt ? "EXPIRED" : publicStatus(result.status);
      const evidenceHash = sha256CanonicalJson({ consent_id: row.consentId, mandate_id: row.mandateId, terms_hash: row.termsHash, provider_evidence_hash: result.evidenceHash, status });
      const updated = (await transaction.update(mandateBiometricConsents).set({
        status,
        evidenceHash,
        failureCode: result.failureCode,
        verifiedAt: status === "VERIFIED" ? now : null,
        hostedUrlCiphertext: ["VERIFIED", "REJECTED", "EXPIRED", "ERROR"].includes(status) ? null : row.hostedUrlCiphertext,
        updatedAt: now,
      }).where(eq(mandateBiometricConsents.consentId, consentId)).returning())[0]!;
      if (status !== "PENDING") {
        const common = {
          correlationId,
          subjectId: row.mandateId,
          recordedAt: now,
          deduplicationKey: providerEventId === undefined ? `mandate-biometric-consent-result:${row.consentId}:${status}` : `mandate-biometric-consent-provider-event:${providerEventId}`,
        };
        if (status === "VERIFIED") {
          await this.options.ledger.append(transaction, {
            ...common,
            eventType: "mandate.biometric_consent_verified",
            payload: { consent_id: row.consentId, mandate_id: row.mandateId, terms_hash: row.termsHash, status, evidence_hash: evidenceHash, occurred_at: now.toISOString() },
          });
        } else {
          await this.options.ledger.append(transaction, {
            ...common,
            eventType: "mandate.biometric_consent_failed",
            payload: { consent_id: row.consentId, mandate_id: row.mandateId, terms_hash: row.termsHash, status, evidence_hash: evidenceHash, occurred_at: now.toISOString() },
          });
        }
      }
      return updated;
    });
  }

  async consumeInTransaction(transaction: TransactionClient, input: {
    mandateId: string;
    principalId: string;
    agentId: string;
    termsHash: string;
    correlationId: string;
    now: Date;
  }): Promise<{ consentId: string; evidenceHash: string }> {
    const matching = (await transaction.select().from(mandateBiometricConsents).where(and(
      eq(mandateBiometricConsents.mandateId, input.mandateId),
      eq(mandateBiometricConsents.principalId, input.principalId),
      eq(mandateBiometricConsents.agentId, input.agentId),
      eq(mandateBiometricConsents.termsHash, input.termsHash),
      eq(mandateBiometricConsents.status, "VERIFIED"),
      gt(mandateBiometricConsents.expiresAt, input.now),
      isNull(mandateBiometricConsents.consumedAt),
    )).orderBy(desc(mandateBiometricConsents.verifiedAt)).for("update"))[0];
    if (matching === undefined) {
      const latest = (await transaction.select().from(mandateBiometricConsents).where(eq(mandateBiometricConsents.mandateId, input.mandateId)).orderBy(desc(mandateBiometricConsents.createdAt)).for("update"))[0];
      if (latest === undefined) throw new PublicApiError(403, "biometric_consent_required", "Biometric consent is required before mandate activation");
      if (latest.termsHash !== input.termsHash || latest.principalId !== input.principalId || latest.agentId !== input.agentId) throw new PublicApiError(403, "biometric_consent_binding_mismatch", "Biometric consent does not match the current mandate terms");
      if (latest.status === "PENDING" || latest.status === "PREPARING") throw new PublicApiError(409, "biometric_consent_pending", "Biometric consent is still pending");
      if (latest.status === "EXPIRED" || input.now >= latest.expiresAt) throw new PublicApiError(409, "biometric_consent_expired", "Biometric consent expired");
      throw new PublicApiError(403, "biometric_consent_rejected", "Biometric consent was not approved");
    }
    const updated = (await transaction.update(mandateBiometricConsents).set({ status: "CONSUMED", consumedAt: input.now, hostedUrlCiphertext: null, updatedAt: input.now })
      .where(and(eq(mandateBiometricConsents.consentId, matching.consentId), eq(mandateBiometricConsents.status, "VERIFIED"), isNull(mandateBiometricConsents.consumedAt))).returning())[0];
    if (updated === undefined) throw new PublicApiError(409, "biometric_consent_required", "Biometric consent was already consumed");
    await this.options.ledger.append(transaction, {
      correlationId: input.correlationId,
      eventType: "mandate.biometric_consent_consumed",
      subjectId: input.mandateId,
      payload: { consent_id: updated.consentId, mandate_id: input.mandateId, terms_hash: input.termsHash, evidence_hash: updated.evidenceHash, occurred_at: input.now.toISOString() },
      recordedAt: input.now,
      deduplicationKey: `mandate-biometric-consent-consumed:${updated.consentId}`,
    });
    return { consentId: updated.consentId, evidenceHash: updated.evidenceHash };
  }
}
