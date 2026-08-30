import { randomUUID } from "node:crypto";
import { decodeJwt } from "jose";

import { PublicApiError, sha256CanonicalJson, type AgentAttestationProviderPort, type AgentEligibilityContext, type AgentEligibilityPort, type AgentTrustRepositoryPort, type PrincipalSession } from "../../contracts/v1/index.js";
import { randomOpaqueToken } from "../auth/crypto.js";
import { agentBindingHash, evaluateAgentEligibility } from "./eligibility.js";
import type { BoundAgentPassportService } from "./passport.js";
import type { TransactionClient } from "../../db/database.js";

type ExtendedTrustRepository = AgentTrustRepositoryPort & {
  getAgentBinding(agentId: string, principalId?: string): Promise<{ agentId: string; principalId: string; keyId: string; buildFingerprint: string; operationalStatus: "ACTIVE" | "SUSPENDED" | "REVOKED" }>;
  getProviderAssessmentId(attestationId: string): Promise<string>;
  getCurrentForPrincipal?(agentId: string, principalId: string, now: Date): Promise<Awaited<ReturnType<AgentTrustRepositoryPort["getCurrent"]>>>;
  getCurrentForPrincipalInTransaction?(transaction: TransactionClient, agentId: string, principalId: string, now: Date): Promise<Awaited<ReturnType<AgentTrustRepositoryPort["getCurrent"]>>>;
  getCurrentByEvidenceReferenceHash?(agentId: string, evidenceReferenceHash: string, now: Date): Promise<Awaited<ReturnType<AgentTrustRepositoryPort["getCurrent"]>>>;
  recordPassportIssued?(input: { passportId: string; trust: Awaited<ReturnType<AgentTrustRepositoryPort["getCurrent"]>>; expiresAt: Date; correlationId: string; now: Date }): Promise<void>;
  recordPassportInvalidated?(input: { passportId: string; trust: Awaited<ReturnType<AgentTrustRepositoryPort["getCurrent"]>>; reason: "attestation_expired" | "attestation_revoked" | "binding_changed" | "agent_not_active"; correlationId: string; now: Date }): Promise<void>;
};
export interface AgentTrustServiceOptions {
  provider: AgentAttestationProviderPort;
  providerName: "fake" | "didit";
  repository: ExtendedTrustRepository;
  passports: BoundAgentPassportService;
  clock: { now(): Date };
  callbackUrl: string;
  secondaryProviderEventConsumer?: { applyProviderEvent(event: Awaited<ReturnType<AgentAttestationProviderPort["verifyWebhook"]>>, correlationId: string): Promise<boolean> };
}
export class AgentEligibilityService implements AgentEligibilityPort {
  constructor(private readonly repository: AgentTrustRepositoryPort) {}
  async evaluate(agentId: string, context: AgentEligibilityContext, now: Date) {
    const repository = this.repository as AgentTrustRepositoryPort & Pick<ExtendedTrustRepository, "getCurrentForPrincipal">;
    const trust = context.purpose === "OPERATOR" && repository.getCurrentForPrincipal !== undefined
      ? await repository.getCurrentForPrincipal(agentId, context.principal_id, now)
      : await repository.getCurrent(agentId, now);
    return evaluateAgentEligibility(trust, context, now);
  }
  async evaluateInTransaction(transaction: TransactionClient, agentId: string, context: AgentEligibilityContext, now: Date) {
    const repository = this.repository as AgentTrustRepositoryPort & Pick<ExtendedTrustRepository, "getCurrentForPrincipalInTransaction" | "getCurrentForPrincipal"> & { getCurrentInTransaction?(transaction: TransactionClient, agentId: string, now: Date): ReturnType<AgentTrustRepositoryPort["getCurrent"]> };
    const trust = context.purpose === "OPERATOR" && repository.getCurrentForPrincipalInTransaction !== undefined
      ? await repository.getCurrentForPrincipalInTransaction(transaction, agentId, context.principal_id, now)
      : repository.getCurrentInTransaction === undefined
        ? context.purpose === "OPERATOR" && repository.getCurrentForPrincipal !== undefined
          ? await repository.getCurrentForPrincipal(agentId, context.principal_id, now)
          : await repository.getCurrent(agentId, now)
        : await repository.getCurrentInTransaction(transaction, agentId, now);
    return evaluateAgentEligibility(trust, context, now);
  }
}
export class AgentTrustService {
  readonly eligibility: AgentEligibilityService;
  constructor(private readonly options: AgentTrustServiceOptions) { this.eligibility = new AgentEligibilityService(options.repository); }
  async start(session: PrincipalSession, agentId: string, input: { consent: boolean; idempotencyKey: string; correlationId: string }) {
    if (input.consent !== true) throw new PublicApiError(400, "invalid_request", "Explicit KYC consent is required");
    const agent = await this.options.repository.getAgentBinding(agentId, session.principal.principal_id);
    const replay = await this.options.repository.findAssessmentByIdempotencyKey(input.idempotencyKey);
    if (replay !== undefined) {
      if (replay.agent_id !== agentId || replay.principal_id !== session.principal.principal_id) {
        throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was reused for another attestation");
      }
      return { attestation_id: replay.attestation_id, status: replay.attestation_status, expires_at: replay.expires_at, hosted_verification_url: null };
    }
    const attestationId = `attestation_${randomUUID()}`;
    const bindingHash = agentBindingHash(agent);
    let providerSession;
    try {
      providerSession = await this.options.provider.createAssessment({ attestationId, agentId, principalId: agent.principalId, vendorData: randomOpaqueToken(), callbackUrl: this.options.callbackUrl });
    } catch {
      const failureAt = this.options.clock.now();
      const unavailableReference = `unavailable_${attestationId}`;
      await this.options.repository.createAssessment({ attestationId, agentId, principalId: agent.principalId, keyId: agent.keyId, buildFingerprint: agent.buildFingerprint,
        provider: this.options.providerName, providerAssessmentId: unavailableReference, bindingHash,
        evidenceHash: sha256CanonicalJson({ provider: this.options.providerName, status: "ERROR", binding_hash: bindingHash, failure_code: "provider_unavailable" }),
        correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, now: failureAt });
      const failed = await this.options.repository.applyProviderEvent({ event: { provider: this.options.providerName, assessmentId: unavailableReference,
        eventId: `provider-unavailable-${attestationId}`, subjectReference: null, status: "ERROR", claims: [],
        evidenceHash: sha256CanonicalJson({ provider: this.options.providerName, status: "ERROR", failure_code: "provider_unavailable" }),
        providerCreatedAt: failureAt, failureCode: "provider_unavailable" }, now: failureAt, correlationId: input.correlationId });
      return { attestation_id: failed.trust.attestation_id, status: failed.trust.attestation_status, expires_at: failed.trust.expires_at, hosted_verification_url: null };
    }
    let trust = await this.options.repository.createAssessment({ attestationId, agentId, principalId: agent.principalId, keyId: agent.keyId, buildFingerprint: agent.buildFingerprint,
      provider: this.options.providerName, providerAssessmentId: providerSession.assessmentId, bindingHash,
      evidenceHash: sha256CanonicalJson({ provider: this.options.providerName, assessment_id: providerSession.assessmentId, status: "PENDING", binding_hash: bindingHash }),
      correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, now: this.options.clock.now() });
    if (this.options.providerName === "fake") {
      const result = await this.options.provider.getAssessment(providerSession.assessmentId);
      trust = (await this.options.repository.applyProviderEvent({ event: { ...result, eventId: `fake-event-${providerSession.assessmentId}` }, now: this.options.clock.now(), correlationId: input.correlationId })).trust;
    }
    return { attestation_id: trust.attestation_id, status: trust.attestation_status, expires_at: trust.expires_at, hosted_verification_url: providerSession.hostedUrl };
  }
  async assurance(session: PrincipalSession, agentId: string) {
    await this.options.repository.getAgentBinding(agentId, session.principal.principal_id);
    const decision = await this.eligibility.evaluate(agentId, { purpose: "OPERATOR", principal_id: session.principal.principal_id }, this.options.clock.now());
    const trust = decision.trust;
    return { agent_id: trust.agent_id, operational_status: trust.operational_status, attestation_id: trust.attestation_id, attestation_status: trust.attestation_status,
      provider: trust.provider, assurance_claims: trust.assurance_claims, assurance_level: trust.assurance_level, issued_at: trust.issued_at, expires_at: trust.expires_at,
      eligibility: { eligible: decision.eligible, ...(decision.reason === undefined ? {} : { reason: decision.reason }) } };
  }
  async refresh(session: PrincipalSession, agentId: string, correlationId: string) {
    await this.options.repository.getAgentBinding(agentId, session.principal.principal_id);
    const current = this.options.repository.getCurrentForPrincipal === undefined
      ? await this.options.repository.getCurrent(agentId, this.options.clock.now())
      : await this.options.repository.getCurrentForPrincipal(agentId, session.principal.principal_id, this.options.clock.now());
    if (current.attestation_id === null) throw new PublicApiError(404, "not_found", "Attestation not found");
    const assessmentId = await this.options.repository.getProviderAssessmentId(current.attestation_id);
    let result;
    try { result = await this.options.provider.getAssessment(assessmentId); }
    catch { throw new PublicApiError(503, "internal_error", "Attestation provider is temporarily unavailable"); }
    await this.options.repository.applyProviderEvent({ event: { ...result, eventId: `reconcile-${sha256CanonicalJson({ assessmentId, status: result.status, at: result.providerCreatedAt.toISOString() })}` }, now: this.options.clock.now(), correlationId });
    return this.assurance(session, agentId);
  }
  async webhook(provider: string, rawBody: string, headers: Record<string, string | undefined>, correlationId: string) {
    if (provider !== this.options.providerName || provider !== "didit") throw new PublicApiError(404, "not_found", "Webhook provider is unavailable");
    const event = await this.options.provider.verifyWebhook({ rawBody, headers, now: this.options.clock.now() });
    try {
      const result = await this.options.repository.applyProviderEvent({ event, now: this.options.clock.now(), correlationId });
      return { received: true, applied: result.applied };
    } catch (error) {
      if (!(error instanceof PublicApiError) || error.code !== "not_found" || this.options.secondaryProviderEventConsumer === undefined) throw error;
      const applied = await this.options.secondaryProviderEventConsumer.applyProviderEvent(event, correlationId);
      if (!applied) throw error;
      return { received: true, applied: true };
    }
  }
  async passport(session: PrincipalSession, agentId: string, correlationId: string) {
    await this.options.repository.getAgentBinding(agentId, session.principal.principal_id);
    const trust = this.options.repository.getCurrentForPrincipal === undefined
      ? await this.options.repository.getCurrent(agentId, this.options.clock.now())
      : await this.options.repository.getCurrentForPrincipal(agentId, session.principal.principal_id, this.options.clock.now());
    const decision = evaluateAgentEligibility(trust, { purpose: "OPERATOR", principal_id: session.principal.principal_id }, this.options.clock.now());
    if (!decision.eligible || trust.attestation_status !== "VERIFIED") throw new PublicApiError(403, decision.reason ?? "agent_attestation_required", "Agent is not eligible for a passport");
    const issued = await this.options.passports.issue(trust);
    await this.options.repository.recordPassportIssued?.({ passportId: issued.claims.jti, trust, expiresAt: new Date(issued.claims.exp * 1000), correlationId, now: this.options.clock.now() });
    return { passport: issued.token, claims: issued.claims };
  }
  jwks() { return this.options.passports.jwks(); }
  async verifyPassport(token: string, audience: string, correlationId = "passport-verification") {
    let agentId: string; let passportId: string; let evidenceReferenceHash: string;
    try {
      const decoded = decodeJwt(token);
      if (typeof decoded.sub !== "string" || typeof decoded.jti !== "string" || typeof decoded.evidence_reference_hash !== "string" || !/^[0-9a-f]{64}$/.test(decoded.evidence_reference_hash)) throw new Error();
      agentId = decoded.sub; passportId = decoded.jti; evidenceReferenceHash = decoded.evidence_reference_hash;
    } catch { throw new PublicApiError(400, "invalid_request", "Passport is malformed"); }
    const trust = this.options.repository.getCurrentByEvidenceReferenceHash === undefined
      ? await this.options.repository.getCurrent(agentId, this.options.clock.now())
      : await this.options.repository.getCurrentByEvidenceReferenceHash(agentId, evidenceReferenceHash, this.options.clock.now());
    try { return await this.options.passports.verify(token, audience, trust); }
    catch {
      const reason = trust.operational_status !== "ACTIVE" ? "agent_not_active"
        : trust.attestation_status === "REVOKED" ? "attestation_revoked"
          : trust.attestation_status === "EXPIRED" || trust.expires_at === null || this.options.clock.now().getTime() >= Date.parse(trust.expires_at) ? "attestation_expired"
            : "binding_changed";
      await this.options.repository.recordPassportInvalidated?.({ passportId, trust, reason, correlationId, now: this.options.clock.now() });
      throw new PublicApiError(400, "invalid_request", "Passport verification failed");
    }
  }
}
