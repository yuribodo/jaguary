import { PublicApiError, type AgentTrustRepositoryPort, type AgentTrustSnapshot } from "../../contracts/v1/index.js";
import { agentBindingHash } from "./eligibility.js";

export interface TrustAgentBinding { agentId: string; principalId: string; keyId: string; buildFingerprint: string; operationalStatus: "ACTIVE" | "SUSPENDED" | "REVOKED" }
interface Stored { trust: AgentTrustSnapshot; assessmentId: string; lastEventAt?: Date }
export class InMemoryAgentTrustRepository implements AgentTrustRepositoryPort {
  readonly #agents = new Map<string, TrustAgentBinding>();
  readonly #stored = new Map<string, Stored>();
  readonly #idempotency = new Map<string, string>();
  readonly #events = new Set<string>();
  constructor(private readonly options: { mode: AgentTrustSnapshot["mode"]; provider: "fake" | "didit"; attestationTtlSeconds: number }, agents: TrustAgentBinding[]) { for (const agent of agents) this.#agents.set(agent.agentId, agent); }
  async getAgentBinding(agentId: string, principalId?: string): Promise<TrustAgentBinding> { const value = this.#agents.get(agentId); if (value === undefined || (principalId !== undefined && value.principalId !== principalId)) throw new PublicApiError(404, "not_found", "Agent not found for this principal"); return value; }
  async getProviderAssessmentId(attestationId: string): Promise<string> { const value = [...this.#stored.values()].find((item) => item.trust.attestation_id === attestationId); if (value === undefined) throw new Error("Attestation not found"); return value.assessmentId; }
  async findAssessmentByIdempotencyKey(idempotencyKey: string): Promise<AgentTrustSnapshot | undefined> {
    const agentId = this.#idempotency.get(idempotencyKey);
    return agentId === undefined ? undefined : this.#stored.get(agentId)?.trust;
  }
  async createAssessment(command: Parameters<AgentTrustRepositoryPort["createAssessment"]>[0]): Promise<AgentTrustSnapshot> {
    const existing = this.#idempotency.get(command.idempotencyKey); if (existing !== undefined) return this.#stored.get(existing)!.trust;
    const agent = await this.getAgentBinding(command.agentId, command.principalId);
    const trust: AgentTrustSnapshot = { mode: this.options.mode, agent_id: agent.agentId, principal_id: agent.principalId, operational_status: agent.operationalStatus,
      attestation_status: "PENDING", attestation_id: command.attestationId, key_id: agent.keyId, build_fingerprint: agent.buildFingerprint,
      provider: command.provider, assurance_claims: [], assurance_level: "LOCAL_CRYPTOGRAPHIC", binding_hash: command.bindingHash,
      evidence_reference_hash: command.evidenceHash, issued_at: null, expires_at: null };
    this.#stored.set(agent.agentId, { trust, assessmentId: command.providerAssessmentId }); this.#idempotency.set(command.idempotencyKey, agent.agentId); return trust;
  }
  async applyProviderEvent(command: Parameters<AgentTrustRepositoryPort["applyProviderEvent"]>[0]): Promise<{ trust: AgentTrustSnapshot; applied: boolean }> {
    if (this.#events.has(command.event.eventId)) { const existing = [...this.#stored.values()].find((item) => item.assessmentId === command.event.assessmentId)!; return { trust: existing.trust, applied: false }; }
    this.#events.add(command.event.eventId); const entry = [...this.#stored.values()].find((item) => item.assessmentId === command.event.assessmentId); if (entry === undefined) throw new Error("Unknown assessment");
    if (entry.trust.attestation_status === "REVOKED") return { trust: entry.trust, applied: false };
    if (entry.lastEventAt !== undefined && command.event.providerCreatedAt <= entry.lastEventAt) return { trust: entry.trust, applied: false };
    entry.lastEventAt = command.event.providerCreatedAt;
    entry.trust = { ...entry.trust, attestation_status: command.event.status, assurance_claims: command.event.claims,
      assurance_level: command.event.status === "VERIFIED" ? "EXTERNAL_OPERATOR_IDENTITY" : "LOCAL_CRYPTOGRAPHIC", evidence_reference_hash: command.event.evidenceHash,
      issued_at: command.event.status === "VERIFIED" ? command.event.providerCreatedAt.toISOString() : null,
      expires_at: command.event.status === "VERIFIED" ? new Date(command.event.providerCreatedAt.getTime() + this.options.attestationTtlSeconds * 1000).toISOString() : null };
    return { trust: entry.trust, applied: true };
  }
  async getCurrent(agentId: string): Promise<AgentTrustSnapshot> { const stored = this.#stored.get(agentId); if (stored !== undefined) return stored.trust; const agent = await this.getAgentBinding(agentId); return { mode: this.options.mode, agent_id: agent.agentId, principal_id: agent.principalId, operational_status: agent.operationalStatus, attestation_status: null, attestation_id: null, key_id: agent.keyId, build_fingerprint: agent.buildFingerprint, provider: this.options.provider, assurance_claims: [], assurance_level: "LOCAL_CRYPTOGRAPHIC", binding_hash: agentBindingHash(agent), evidence_reference_hash: null, issued_at: null, expires_at: null }; }
  async revokeCurrent(agentId: string): Promise<AgentTrustSnapshot> {
    const stored = this.#stored.get(agentId);
    if (stored === undefined || stored.trust.attestation_id === null) throw new PublicApiError(404, "not_found", "Attestation not found");
    stored.trust = { ...stored.trust, attestation_status: "REVOKED", assurance_level: "LOCAL_CRYPTOGRAPHIC" };
    return stored.trust;
  }
  async recordPassportIssued(): Promise<void> {}
  async recordPassportInvalidated(): Promise<void> {}
}
