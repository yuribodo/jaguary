import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  PublicApiError,
  agentAssuranceClaimSchema,
  agentTrustSnapshotSchema,
  sha256CanonicalJson,
  type AgentTrustRepositoryPort,
  type AgentTrustSnapshot,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection, TransactionClient } from "../../db/database.js";
import { agentAttestationEvents, agentAttestations, agents } from "../../db/schema.js";
import type { AuditLedgerPort } from "../ledger/ports.js";
import { agentBindingHash } from "./eligibility.js";

class ReferenceCipher {
  readonly #key: Buffer;
  constructor(secret: string) { this.#key = createHash("sha256").update(`bound-kya:${secret}`).digest(); }
  encrypt(value: string): string { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.#key, iv); const data = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url"); }
  decrypt(value: string): string { const data = Buffer.from(value, "base64url"); const decipher = createDecipheriv("aes-256-gcm", this.#key, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(); }
}

type AgentRow = typeof agents.$inferSelect;
type AttestationRow = typeof agentAttestations.$inferSelect;
async function loadAgent(database: DatabaseClient | TransactionClient, agentId: string): Promise<AgentRow | undefined> {
  return (await database.select().from(agents).where(eq(agents.agentId, agentId)))[0];
}

export interface PostgresAgentTrustRepositoryOptions {
  mode: "LOCAL" | "EXTERNAL_OPTIONAL" | "EXTERNAL_REQUIRED";
  provider: "fake" | "didit";
  attestationTtlSeconds: number;
  encryptionSecret: string;
}
export class PostgresAgentTrustRepository implements AgentTrustRepositoryPort {
  readonly #cipher: ReferenceCipher;
  constructor(private readonly database: DatabaseConnection, private readonly ledger: AuditLedgerPort, private readonly options: PostgresAgentTrustRepositoryOptions) { this.#cipher = new ReferenceCipher(options.encryptionSecret); }

  async getAgentBinding(agentId: string, principalId?: string) {
    const agent = await loadAgent(this.database.db, agentId);
    if (agent === undefined || (principalId !== undefined && agent.principalId !== principalId)) throw new PublicApiError(404, "not_found", "Agent not found for this principal");
    return { agentId: agent.agentId, principalId: agent.principalId, keyId: agent.verificationKeyId, buildFingerprint: agent.buildFingerprint, operationalStatus: agent.status as "ACTIVE" | "SUSPENDED" | "REVOKED" };
  }
  async getProviderAssessmentId(attestationId: string): Promise<string> {
    const row = (await this.database.db.select({ value: agentAttestations.providerAssessmentCiphertext }).from(agentAttestations).where(eq(agentAttestations.attestationId, attestationId)))[0];
    if (row === undefined) throw new PublicApiError(404, "not_found", "Attestation not found");
    return this.#cipher.decrypt(row.value);
  }
  async findAssessmentByIdempotencyKey(idempotencyKey: string): Promise<AgentTrustSnapshot | undefined> {
    const row = (await this.database.db.select({ agentId: agentAttestations.agentId }).from(agentAttestations)
      .where(eq(agentAttestations.creationIdempotencyKey, idempotencyKey)))[0];
    return row === undefined ? undefined : this.#current(this.database.db, row.agentId);
  }

  #snapshot(agent: AgentRow, attestation: AttestationRow | undefined): AgentTrustSnapshot {
    const expectedBinding = agentBindingHash({ agentId: agent.agentId, principalId: agent.principalId, keyId: agent.verificationKeyId, buildFingerprint: agent.buildFingerprint });
    return agentTrustSnapshotSchema.parse({
      mode: this.options.mode, agent_id: agent.agentId, principal_id: agent.principalId, operational_status: agent.status,
      attestation_status: attestation?.status ?? null, attestation_id: attestation?.attestationId ?? null,
      key_id: agent.verificationKeyId, build_fingerprint: agent.buildFingerprint, provider: attestation?.provider ?? this.options.provider,
      assurance_claims: attestation === undefined ? [] : agentAssuranceClaimSchema.array().parse(attestation.normalizedClaims),
      assurance_level: attestation?.status === "VERIFIED" ? "EXTERNAL_OPERATOR_IDENTITY" : "LOCAL_CRYPTOGRAPHIC",
      binding_hash: attestation?.bindingHash ?? expectedBinding, evidence_reference_hash: attestation?.evidenceHash ?? null,
      issued_at: attestation?.issuedAt?.toISOString() ?? null, expires_at: attestation?.expiresAt?.toISOString() ?? null,
    });
  }
  async #current(database: DatabaseClient | TransactionClient, agentId: string): Promise<AgentTrustSnapshot> {
    const agent = await loadAgent(database, agentId);
    if (agent === undefined) throw new PublicApiError(404, "not_found", "Agent not found");
    const attestation = (await database.select().from(agentAttestations).where(eq(agentAttestations.agentId, agentId)).orderBy(desc(agentAttestations.createdAt)).limit(1))[0];
    return this.#snapshot(agent, attestation);
  }

  async createAssessment(command: Parameters<AgentTrustRepositoryPort["createAssessment"]>[0]): Promise<AgentTrustSnapshot> {
    return this.database.transaction(async (transaction) => {
      const replay = (await transaction.select().from(agentAttestations).where(eq(agentAttestations.creationIdempotencyKey, command.idempotencyKey)))[0];
      if (replay !== undefined) {
        if (replay.agentId !== command.agentId || replay.principalId !== command.principalId || replay.providerAssessmentHash !== sha256CanonicalJson(command.providerAssessmentId)) throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was reused with another attestation");
        return this.#current(transaction, command.agentId);
      }
      await transaction.insert(agentAttestations).values({
        attestationId: command.attestationId, agentId: command.agentId, principalId: command.principalId, keyId: command.keyId,
        buildFingerprint: command.buildFingerprint, provider: command.provider, providerAssessmentHash: sha256CanonicalJson(command.providerAssessmentId),
        providerAssessmentCiphertext: this.#cipher.encrypt(command.providerAssessmentId), status: "PENDING", normalizedClaims: [], assuranceLevel: "LOCAL_CRYPTOGRAPHIC",
        bindingHash: command.bindingHash, evidenceHash: command.evidenceHash, correlationId: command.correlationId, creationIdempotencyKey: command.idempotencyKey,
        createdAt: command.now, updatedAt: command.now,
      });
      await this.ledger.append(transaction, { correlationId: command.correlationId, eventType: "agent.attestation_started", subjectId: command.attestationId,
        payload: { attestation_id: command.attestationId, agent_id: command.agentId, principal_id: command.principalId, provider: command.provider, status: "PENDING", binding_hash: command.bindingHash, evidence_hash: command.evidenceHash, occurred_at: command.now.toISOString() },
        recordedAt: command.now, deduplicationKey: `attestation-started:${command.attestationId}` });
      return this.#current(transaction, command.agentId);
    });
  }

  async applyProviderEvent(command: Parameters<AgentTrustRepositoryPort["applyProviderEvent"]>[0]): Promise<{ trust: AgentTrustSnapshot; applied: boolean }> {
    return this.database.transaction(async (transaction) => {
      const eventHash = sha256CanonicalJson(command.event.eventId);
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${command.event.provider}:${eventHash}`}))`);
      const duplicate = (await transaction.select({ attestationId: agentAttestationEvents.attestationId }).from(agentAttestationEvents)
        .where(and(eq(agentAttestationEvents.provider, command.event.provider), eq(agentAttestationEvents.providerEventIdHash, eventHash))))[0];
      if (duplicate !== undefined) {
        const row = (await transaction.select({ agentId: agentAttestations.agentId }).from(agentAttestations).where(eq(agentAttestations.attestationId, duplicate.attestationId)))[0]!;
        return { trust: await this.#current(transaction, row.agentId), applied: false };
      }
      const attestation = (await transaction.select().from(agentAttestations).where(and(
        eq(agentAttestations.provider, command.event.provider), eq(agentAttestations.providerAssessmentHash, sha256CanonicalJson(command.event.assessmentId)),
      )).for("update"))[0];
      if (attestation === undefined) throw new PublicApiError(404, "not_found", "Attestation provider reference is unknown");
      const newest = (await transaction.select({ createdAt: agentAttestationEvents.providerCreatedAt }).from(agentAttestationEvents)
        .where(eq(agentAttestationEvents.attestationId, attestation.attestationId)).orderBy(desc(agentAttestationEvents.providerCreatedAt)).limit(1))[0];
      const terminalRegression = (attestation.status !== "PENDING" && command.event.status === "PENDING") || attestation.status === "REVOKED";
      const outOfOrder = newest !== undefined && command.event.providerCreatedAt <= newest.createdAt;
      const applied = !terminalRegression && !outOfOrder;
      await transaction.insert(agentAttestationEvents).values({
        eventId: randomUUID(), provider: command.event.provider, providerEventIdHash: eventHash, attestationId: attestation.attestationId,
        normalizedEventType: command.event.status, payloadHash: command.event.evidenceHash, signatureVerified: true,
        processingStatus: applied ? "APPLIED" : "IGNORED_OUT_OF_ORDER", providerCreatedAt: command.event.providerCreatedAt,
        receivedAt: command.now, processedAt: command.now,
      });
      if (applied) {
        const expiresAt = command.event.status === "VERIFIED" ? new Date(command.event.providerCreatedAt.getTime() + this.options.attestationTtlSeconds * 1000) : undefined;
        await transaction.update(agentAttestations).set({
          status: command.event.status, normalizedClaims: command.event.claims, assuranceLevel: command.event.status === "VERIFIED" ? "EXTERNAL_OPERATOR_IDENTITY" : "LOCAL_CRYPTOGRAPHIC",
          providerSubjectHash: command.event.subjectReference === null ? null : sha256CanonicalJson(command.event.subjectReference),
          evidenceHash: command.event.evidenceHash, issuedAt: command.event.status === "VERIFIED" ? command.event.providerCreatedAt : null,
          expiresAt: expiresAt ?? null, lastCheckedAt: command.now, failureCode: command.event.failureCode, updatedAt: command.now,
        }).where(eq(agentAttestations.attestationId, attestation.attestationId));
        await this.#auditTransition(transaction, attestation, command, expiresAt);
      }
      return { trust: await this.#current(transaction, attestation.agentId), applied };
    });
  }

  async #auditTransition(transaction: TransactionClient, attestation: AttestationRow, command: Parameters<AgentTrustRepositoryPort["applyProviderEvent"]>[0], expiresAt?: Date): Promise<void> {
    const base = { attestation_id: attestation.attestationId, agent_id: attestation.agentId, principal_id: attestation.principalId, provider: command.event.provider,
      binding_hash: attestation.bindingHash, evidence_hash: command.event.evidenceHash, occurred_at: command.now.toISOString() };
    if (command.event.status === "VERIFIED") await this.ledger.append(transaction, { correlationId: command.correlationId, eventType: "agent.attestation_verified", subjectId: attestation.attestationId,
      payload: { ...base, status: "VERIFIED", assurance_claims: command.event.claims, expires_at: expiresAt!.toISOString() }, recordedAt: command.now, deduplicationKey: `attestation:${command.event.eventId}` });
    if (command.event.status === "REJECTED") await this.ledger.append(transaction, { correlationId: command.correlationId, eventType: "agent.attestation_rejected", subjectId: attestation.attestationId,
      payload: { ...base, status: "REJECTED", failure_code: command.event.failureCode ?? "provider_rejected" }, recordedAt: command.now, deduplicationKey: `attestation:${command.event.eventId}` });
    if (command.event.status === "EXPIRED") await this.ledger.append(transaction, { correlationId: command.correlationId, eventType: "agent.attestation_expired", subjectId: attestation.attestationId,
      payload: { ...base, status: "EXPIRED" }, recordedAt: command.now, deduplicationKey: `attestation:${command.event.eventId}` });
  }

  async getCurrent(agentId: string, now: Date): Promise<AgentTrustSnapshot> {
    return this.database.transaction(async (transaction) => {
      const current = await this.#current(transaction, agentId);
      if (current.attestation_status === "VERIFIED" && current.expires_at !== null && now.getTime() >= Date.parse(current.expires_at)) {
        await transaction.update(agentAttestations).set({ status: "EXPIRED", failureCode: "attestation_ttl_expired", updatedAt: now }).where(eq(agentAttestations.attestationId, current.attestation_id!));
        await this.ledger.append(transaction, { correlationId: `attestation-expiry-${current.attestation_id}`, eventType: "agent.attestation_expired", subjectId: current.attestation_id!,
          payload: { attestation_id: current.attestation_id!, agent_id: current.agent_id, principal_id: current.principal_id, provider: current.provider, status: "EXPIRED", binding_hash: current.binding_hash, evidence_hash: current.evidence_reference_hash!, occurred_at: now.toISOString() },
          recordedAt: now, deduplicationKey: `attestation-expired:${current.attestation_id}` });
        return this.#current(transaction, agentId);
      }
      return current;
    });
  }
  async getCurrentInTransaction(transaction: TransactionClient, agentId: string, now: Date): Promise<AgentTrustSnapshot> {
    void now;
    const agent = (await transaction.select().from(agents).where(eq(agents.agentId, agentId)).for("update"))[0];
    if (agent === undefined) throw new PublicApiError(404, "not_found", "Agent not found");
    const attestation = (await transaction.select().from(agentAttestations).where(eq(agentAttestations.agentId, agentId))
      .orderBy(desc(agentAttestations.createdAt)).limit(1).for("update"))[0];
    return this.#snapshot(agent, attestation);
  }

  async revokeCurrent(agentId: string, now: Date, correlationId: string): Promise<AgentTrustSnapshot> {
    return this.database.transaction(async (transaction) => {
      const current = await this.getCurrentInTransaction(transaction, agentId, now);
      if (current.attestation_id === null || current.evidence_reference_hash === null) throw new PublicApiError(404, "not_found", "Attestation not found");
      await transaction.update(agentAttestations).set({ status: "REVOKED", failureCode: "bound_revoked", updatedAt: now })
        .where(eq(agentAttestations.attestationId, current.attestation_id));
      await this.ledger.append(transaction, { correlationId, eventType: "agent.attestation_revoked", subjectId: current.attestation_id,
        payload: { attestation_id: current.attestation_id, agent_id: current.agent_id, principal_id: current.principal_id, provider: current.provider,
          status: "REVOKED", binding_hash: current.binding_hash, evidence_hash: current.evidence_reference_hash, occurred_at: now.toISOString() },
        recordedAt: now, deduplicationKey: `attestation-revoked:${current.attestation_id}` });
      return this.#current(transaction, agentId);
    });
  }

  async recordPassportIssued(input: { passportId: string; trust: AgentTrustSnapshot; expiresAt: Date; correlationId: string; now: Date }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await this.ledger.append(transaction, { correlationId: input.correlationId, eventType: "agent.passport_issued", subjectId: input.trust.agent_id,
        payload: { passport_id: input.passportId, attestation_id: input.trust.attestation_id!, agent_id: input.trust.agent_id, binding_hash: input.trust.binding_hash,
          evidence_hash: input.trust.evidence_reference_hash!, expires_at: input.expiresAt.toISOString(), occurred_at: input.now.toISOString() },
        recordedAt: input.now, deduplicationKey: `passport-issued:${input.passportId}` });
    });
  }

  async recordPassportInvalidated(input: { passportId: string; trust: AgentTrustSnapshot; reason: "attestation_expired" | "attestation_revoked" | "binding_changed" | "agent_not_active"; correlationId: string; now: Date }): Promise<void> {
    if (input.trust.attestation_id === null) return;
    await this.database.transaction(async (transaction) => {
      await this.ledger.append(transaction, { correlationId: input.correlationId, eventType: "agent.passport_invalidated", subjectId: input.trust.agent_id,
        payload: { passport_id: input.passportId, attestation_id: input.trust.attestation_id!, agent_id: input.trust.agent_id, reason: input.reason, occurred_at: input.now.toISOString() },
        recordedAt: input.now, deduplicationKey: `passport-invalidated:${input.passportId}:${input.reason}` });
    });
  }
}
