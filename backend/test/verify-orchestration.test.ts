import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRequestProofFixture,
  mandateFixture,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  PublicApiError,
  sha256CanonicalJson,
  travelBotFixture,
  type AuthorizationDecision,
  type PolicyEvaluation,
  type VerifiedAgentRequest,
} from "../src/contracts/v1/index.js";
import {
  VerifyOrchestrator,
  type AuthorizationReservationPort,
  type VerifyOrchestratorOptions,
  type VerifyRequest,
} from "../src/modules/verify/index.js";

const now = "2026-08-29T12:04:01.000Z";
const verifiedRequest: VerifiedAgentRequest = {
  agent_id: agentRequestProofFixture.payload.agent_id,
  key_id: agentRequestProofFixture.payload.key_id,
  build_fingerprint: agentRequestProofFixture.payload.build_fingerprint,
  nonce: agentRequestProofFixture.payload.nonce,
  issued_at: agentRequestProofFixture.payload.issued_at,
  expires_at: agentRequestProofFixture.payload.expires_at,
};
const request: VerifyRequest = {
  request_body: {
    authorization: normalizedAuthorizationFixture,
    checkout: normalizedCheckoutFixture,
  },
  proof: agentRequestProofFixture,
};

class InMemoryReservationStore implements AuthorizationReservationPort {
  readonly reservations: AuthorizationDecision[] = [];

  async inspect() {
    return {
      usage: { aggregate_spend: { amount: 0, currency: "USD" as const }, uses: 0 },
      nonce_status: "UNUSED" as const,
    };
  }

  async reserve(command: { evaluation: PolicyEvaluation }) {
    const decision: AuthorizationDecision = {
      decision: "ALLOW",
      reasons: [],
      authorization_id: "authorization_atomic_001",
      policy_version: command.evaluation.policy_version,
      evidence_hash: sha256CanonicalJson(command.evaluation),
    };
    this.reservations.push(decision);
    return decision;
  }
}

function createOrchestrator(
  store: InMemoryReservationStore,
  overrides: Partial<VerifyOrchestratorOptions> = {},
): VerifyOrchestrator {
  return new VerifyOrchestrator({
    agentRegistry: { get: async () => travelBotFixture },
    agentVerifier: { verify: async () => verifiedRequest },
    mandateLoader: { getMandate: async () => mandateFixture },
    mandateSignatureVerifier: { verify: async () => true },
    checkoutVerifier: { verify: async () => true },
    reservationStore: store,
    clock: { now: () => new Date(now) },
    humanApprovalRequired: () => false,
    ...overrides,
  });
}

test("a valid Bound Verify request becomes one payable reservation", async () => {
  const store = new InMemoryReservationStore();
  const orchestrator = createOrchestrator(store);

  const result = await orchestrator.verify(
    request,
    "idem_verify_atomic_001",
    "corr_verify_atomic_001",
  );

  assert.equal(result.decision, "ALLOW");
  assert.equal(result.authorization_id, "authorization_atomic_001");
  assert.deepEqual(result.reasons, []);
  assert.equal(store.reservations.length, 1);
});

test("an invalid agent signature is a deterministic DENY and creates no reservation", async () => {
  const store = new InMemoryReservationStore();
  const orchestrator = createOrchestrator(store, {
    agentVerifier: {
      verify: async () => {
        throw new PublicApiError(401, "invalid_agent_signature", "invalid proof");
      },
    },
  });

  const result = await orchestrator.verify(
    request,
    "idem_verify_invalid_signature",
    "corr_verify_invalid_signature",
  );

  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["invalid_agent_signature"]);
  assert.equal(result.authorization_id, undefined);
  assert.equal(store.reservations.length, 0);
});

test("human approval produces stable ESCALATE evidence without a payable reservation", async () => {
  const store = new InMemoryReservationStore();
  const orchestrator = createOrchestrator(store, {
    humanApprovalRequired: () => true,
  });

  const first = await orchestrator.verify(
    request,
    "idem_verify_escalate_001",
    "corr_verify_escalate_001",
  );
  const repeated = await orchestrator.verify(
    request,
    "idem_verify_escalate_001",
    "corr_verify_escalate_001",
  );

  assert.deepEqual(first, repeated);
  assert.equal(first.decision, "ESCALATE");
  assert.deepEqual(first.reasons, ["human_approval_required"]);
  assert.equal(first.authorization_id, undefined);
  assert.match(first.evidence_hash, /^[a-f0-9]{64}$/);
  assert.equal(store.reservations.length, 0);
});

test("a missing mandate fails closed as DENY instead of leaking a repository error", async () => {
  const store = new InMemoryReservationStore();
  const orchestrator = createOrchestrator(store, {
    mandateLoader: {
      getMandate: async () => {
        throw new PublicApiError(404, "not_found", "Mandate not found");
      },
    },
  });

  const result = await orchestrator.verify(
    request,
    "idem_verify_missing_mandate",
    "corr_verify_missing_mandate",
  );

  assert.equal(result.decision, "DENY");
  assert.equal(result.reasons.includes("mandate_not_active"), true);
  assert.equal(store.reservations.length, 0);
});
