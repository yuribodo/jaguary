import assert from "node:assert/strict";
import test from "node:test";

import type { AgentAttestationProviderPort, AgentTrustRepositoryPort, AgentTrustSnapshot } from "../src/contracts/v1/index.js";
import type { TransactionClient } from "../src/db/database.js";
import { BoundAgentPassportService } from "../src/modules/trust/passport.js";
import { agentBindingHash, evaluateAgentEligibility } from "../src/modules/trust/eligibility.js";
import { DeterministicFakeAttestationProvider } from "../src/modules/trust/fake-provider.js";
import { InMemoryAgentTrustRepository } from "../src/modules/trust/memory-repository.js";
import { AgentEligibilityService, AgentTrustService } from "../src/modules/trust/service.js";

const now = new Date("2026-08-29T12:00:00.000Z");
function trust(overrides: Partial<AgentTrustSnapshot> = {}): AgentTrustSnapshot {
  const base = {
    mode: "EXTERNAL_REQUIRED", agent_id: "agent_travelbot", principal_id: "principal_marta", operational_status: "ACTIVE",
    attestation_status: "VERIFIED", attestation_id: "attestation_1", key_id: "key_travelbot", build_fingerprint: "a".repeat(64),
    provider: "didit", assurance_claims: ["OPERATOR_IDENTITY"], assurance_level: "EXTERNAL_OPERATOR_IDENTITY",
    binding_hash: agentBindingHash({ agentId: "agent_travelbot", principalId: "principal_marta", keyId: "key_travelbot", buildFingerprint: "a".repeat(64) }),
    evidence_reference_hash: "c".repeat(64), issued_at: "2026-08-29T11:00:00.000Z", expires_at: "2026-08-29T13:00:00.000Z",
  } satisfies AgentTrustSnapshot;
  return { ...base, ...overrides } as AgentTrustSnapshot;
}

test("one eligibility policy covers local, optional and every required attestation state", () => {
  assert.equal(evaluateAgentEligibility(trust({ mode: "LOCAL", attestation_status: null }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).eligible, true);
  assert.equal(evaluateAgentEligibility(trust({ mode: "EXTERNAL_OPTIONAL", attestation_status: "ERROR" }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).eligible, true);
  const cases = new Map<AgentTrustSnapshot["attestation_status"], string>([
    [null, "agent_attestation_required"], ["PENDING", "agent_attestation_pending"], ["REJECTED", "agent_attestation_rejected"],
    ["EXPIRED", "agent_attestation_expired"], ["REVOKED", "agent_attestation_revoked"], ["ERROR", "agent_attestation_provider_unavailable"],
  ]);
  for (const [status, reason] of cases) assert.equal(evaluateAgentEligibility(trust({ attestation_status: status }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).reason, reason);
  assert.equal(evaluateAgentEligibility(trust({ expires_at: now.toISOString() }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).reason, "agent_attestation_expired");
  assert.equal(evaluateAgentEligibility(trust({ binding_hash: "d".repeat(64) }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).reason, "agent_attestation_binding_mismatch");
  assert.equal(evaluateAgentEligibility(trust({ operational_status: "SUSPENDED" }), { purpose: "OPERATOR", principal_id: "principal_marta" }, now).reason, "agent_not_active");
});

test("execution eligibility separates the platform operator from the customer", () => {
  const snapshot = trust({ mode: "EXTERNAL_REQUIRED", attestation_status: "VERIFIED" });
  assert.equal(evaluateAgentEligibility(snapshot, { purpose: "EXECUTION" }, now).eligible, true);
  assert.equal(evaluateAgentEligibility(snapshot, { purpose: "OPERATOR", principal_id: "principal_marta" }, now).eligible, true);
  assert.equal(
    evaluateAgentEligibility(snapshot, { purpose: "OPERATOR", principal_id: "principal_alice" }, now).reason,
    "agent_attestation_binding_mismatch",
  );
});

test("deterministic fake supplies evidence, not an authorization decision", async () => {
  const fake = new DeterministicFakeAttestationProvider(now);
  const session = await fake.createAssessment({ attestationId: "attestation_1", agentId: "agent_travelbot", principalId: "principal_marta", vendorData: "opaque", callbackUrl: "http://localhost:3000/trust/callback" });
  const result = await fake.getAssessment(session.assessmentId);
  assert.equal(result.status, "VERIFIED");
  assert.deepEqual(result.claims, ["OPERATOR_IDENTITY"]);
  assert.equal("decision" in result, false);
});

test("attestation session idempotency prevents a second provider call", async () => {
  const delegate = new DeterministicFakeAttestationProvider(now);
  let creates = 0;
  const provider: AgentAttestationProviderPort = {
    createAssessment: async (input) => { creates += 1; return delegate.createAssessment(input); },
    getAssessment: (id) => delegate.getAssessment(id),
    verifyWebhook: (input) => delegate.verifyWebhook(input),
  };
  const repository = new InMemoryAgentTrustRepository(
    { mode: "EXTERNAL_REQUIRED", provider: "fake", attestationTtlSeconds: 3600 },
    [{ agentId: "agent_travelbot", principalId: "principal_marta", keyId: "key_travelbot", buildFingerprint: "a".repeat(64), operationalStatus: "ACTIVE" }],
  );
  const passports = await BoundAgentPassportService.create({ issuer: "https://bound.example", audience: "bound-verify", ttlSeconds: 300, now: () => now });
  const service = new AgentTrustService({ provider, providerName: "fake", repository, passports, clock: { now: () => now }, callbackUrl: "https://bound.example/trust/callback" });
  const session = { sessionId: "session_1", principal: { principal_id: "principal_marta", display_name: "Marta" }, tokenHash: "a".repeat(64), csrfTokenHash: "b".repeat(64), assurance: "OIDC" as const, issuedAt: now, expiresAt: new Date(now.getTime() + 3600_000) };
  const input = { consent: true, idempotencyKey: "idem_attestation_once", correlationId: "corr_once" };

  const first = await service.start(session, "agent_travelbot", input);
  const replay = await service.start(session, "agent_travelbot", input);

  assert.equal(creates, 1);
  assert.equal(replay.attestation_id, first.attestation_id);
  assert.equal(replay.hosted_verification_url, null);
});

test("provider unavailability is persisted as ERROR and never becomes eligible in required mode", async () => {
  const provider: AgentAttestationProviderPort = {
    createAssessment: async () => { throw new Error("synthetic provider secret must stay internal"); },
    getAssessment: async () => { throw new Error("unavailable"); },
    verifyWebhook: async () => { throw new Error("unavailable"); },
  };
  const repository = new InMemoryAgentTrustRepository(
    { mode: "EXTERNAL_REQUIRED", provider: "didit", attestationTtlSeconds: 3600 },
    [{ agentId: "agent_travelbot", principalId: "principal_marta", keyId: "key_travelbot", buildFingerprint: "a".repeat(64), operationalStatus: "ACTIVE" }],
  );
  const passports = await BoundAgentPassportService.create({ issuer: "https://bound.example", audience: "bound-verify", ttlSeconds: 300, now: () => now });
  const service = new AgentTrustService({ provider, providerName: "didit", repository, passports, clock: { now: () => now }, callbackUrl: "https://bound.example/trust/callback" });
  const session = { sessionId: "session_1", principal: { principal_id: "principal_marta", display_name: "Marta" }, tokenHash: "a".repeat(64), csrfTokenHash: "b".repeat(64), assurance: "OIDC" as const, issuedAt: now, expiresAt: new Date(now.getTime() + 3600_000) };

  const started = await service.start(session, "agent_travelbot", { consent: true, idempotencyKey: "idem_provider_down", correlationId: "corr_provider_down" });
  assert.equal(started.status, "ERROR");
  assert.equal((await service.assurance(session, "agent_travelbot")).eligibility.reason, "agent_attestation_provider_unavailable");
});

test("a revocation committed after precheck is reloaded and denied at the reservation seam", async () => {
  const repository = {
    getCurrent: async () => trust(),
    getCurrentInTransaction: async () => trust({ attestation_status: "REVOKED" }),
  } as unknown as AgentTrustRepositoryPort & { getCurrentInTransaction(transaction: TransactionClient, agentId: string, at: Date): Promise<AgentTrustSnapshot> };
  const eligibility = new AgentEligibilityService(repository);
  assert.equal((await eligibility.evaluate("agent_travelbot", { purpose: "OPERATOR", principal_id: "principal_marta" }, now)).eligible, true);
  const reserved = await eligibility.evaluateInTransaction({} as TransactionClient, "agent_travelbot", { purpose: "EXECUTION" }, now);
  assert.equal(reserved.eligible, false);
  assert.equal(reserved.reason, "agent_attestation_revoked");
});

test("Bound passport signs privacy-safe claims and verifies JWKS, audience, expiry and binding", async () => {
  const passports = await BoundAgentPassportService.create({ issuer: "https://bound.example", audience: "bound-verify", ttlSeconds: 900, now: () => now });
  const issued = await passports.issue(trust());
  assert.equal(issued.claims.sub, "agent_travelbot");
  assert.equal(JSON.stringify(issued).includes("marta@example.com"), false);
  assert.equal((await passports.verify(issued.token, "bound-verify", trust())).sub, "agent_travelbot");
  assert.equal(passports.jwks().keys.length, 1);
  await assert.rejects(() => passports.verify(issued.token, "wrong-audience", trust()), /passport verification failed/);
  await assert.rejects(() => passports.verify(issued.token, "bound-verify", trust({ binding_hash: "e".repeat(64) })), /passport invalidated/);
  await assert.rejects(() => passports.verify(issued.token, "bound-verify", trust({ attestation_status: "REVOKED" })), /passport invalidated/);
  await assert.rejects(() => passports.verify(issued.token, "bound-verify", trust({ operational_status: "SUSPENDED" })), /passport invalidated/);
  const expiredVerifier = await BoundAgentPassportService.create({ issuer: "https://bound.example", audience: "bound-verify", ttlSeconds: 900, now: () => new Date(now.getTime() + 901_000) });
  await assert.rejects(() => expiredVerifier.verifyWithJwks(issued.token, "bound-verify", passports.jwks()), /passport verification failed/);
});
