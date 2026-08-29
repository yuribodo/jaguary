import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRequestProofFixture,
  canonicalCheckoutFixture,
  PublicApiError,
  travelBotFixture,
  type AgentIdentity,
  type AgentIdentityRegistryPort,
} from "../src/contracts/v1/index.js";
import { AgentRequestVerifier } from "../src/modules/identity/verifier.js";

import { createTestAgentSigner } from "./support/agent-signing.js";

const fixedClock = { now: () => new Date("2026-08-29T12:04:00.000Z") };
const requestBody = {
  checkout_id: "checkout_test_001",
  total: { amount: 13_700, currency: "USD" },
};

function registryWith(agent: AgentIdentity | undefined): AgentIdentityRegistryPort {
  return {
    async register() {
      throw new Error("not used by verifier tests");
    },
    async get(agentId) {
      return agent?.agent_id === agentId ? agent : undefined;
    },
  };
}

async function assertPublicCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => (
    error instanceof PublicApiError && error.code === code
  ));
}

test("a valid TravelBot request verifies to the normalized future authorization input", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const proof = await signer.sign(requestBody);

  assert.deepEqual(await verifier.verify(proof, {
    method: "POST",
    route: "/trust/v1/agent-requests/verify",
    body: requestBody,
  }), {
    agent_id: signer.agent.agent_id,
    key_id: signer.agent.verification_key.key_id,
    build_fingerprint: signer.agent.build_fingerprint,
    nonce: "nonce_travelbot_test_001",
    issued_at: "2026-08-29T12:03:00.000Z",
    expires_at: "2026-08-29T12:08:00.000Z",
  });
});

test("the committed public-only TravelBot fixture verifies deterministically", async () => {
  const verifier = new AgentRequestVerifier(registryWith(travelBotFixture), fixedClock);

  assert.deepEqual(await verifier.verify(agentRequestProofFixture, {
    method: agentRequestProofFixture.payload.method,
    route: agentRequestProofFixture.payload.route,
    body: canonicalCheckoutFixture.input,
  }), {
    agent_id: travelBotFixture.agent_id,
    key_id: travelBotFixture.verification_key.key_id,
    build_fingerprint: travelBotFixture.build_fingerprint,
    nonce: agentRequestProofFixture.payload.nonce,
    issued_at: agentRequestProofFixture.payload.issued_at,
    expires_at: agentRequestProofFixture.payload.expires_at,
  });
});

test("a request signed by the wrong key is rejected", async () => {
  const registered = await createTestAgentSigner();
  const impostor = await createTestAgentSigner({
    agent_id: registered.agent.agent_id,
    verification_key: registered.agent.verification_key,
  });
  const verifier = new AgentRequestVerifier(registryWith(registered.agent), fixedClock);
  const proof = await impostor.sign(requestBody);

  await assertPublicCode(
    () => verifier.verify(proof, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "invalid_agent_signature",
  );
});

test("an invalid signature is rejected", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const proof = await signer.sign(requestBody);
  const segments = proof.signature.split(".");
  assert.equal(segments.length, 3);
  const signatureSegment = segments[2] ?? "";
  segments[2] = `${signatureSegment[0] === "A" ? "B" : "A"}${signatureSegment.slice(1)}`;

  await assertPublicCode(
    () => verifier.verify({ ...proof, signature: segments.join(".") }, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "invalid_agent_signature",
  );
});

test("an unknown agent is rejected", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(undefined), fixedClock);
  const proof = await signer.sign(requestBody);

  await assertPublicCode(
    () => verifier.verify(proof, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "agent_not_found",
  );
});

for (const status of ["SUSPENDED", "REVOKED"] as const) {
  test(`a ${status.toLowerCase()} agent is rejected`, async () => {
    const signer = await createTestAgentSigner({ status });
    const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
    const proof = await signer.sign(requestBody);

    await assertPublicCode(
      () => verifier.verify(proof, {
        method: "POST",
        route: "/trust/v1/agent-requests/verify",
        body: requestBody,
      }),
      "agent_not_active",
    );
  });
}

test("key ID and algorithm mismatches are rejected", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const wrongKeyId = await signer.sign(requestBody, { key_id: "key_other" });
  const wrongAlgorithm = await signer.sign(requestBody);
  wrongAlgorithm.algorithm = "EdDSA";

  for (const proof of [wrongKeyId, wrongAlgorithm]) {
    await assertPublicCode(
      () => verifier.verify(proof, {
        method: "POST",
        route: "/trust/v1/agent-requests/verify",
        body: requestBody,
      }),
      "invalid_agent_signature",
    );
  }
});

for (const [name, request] of [
  ["body", { method: "POST", route: "/trust/v1/agent-requests/verify", body: { ...requestBody, injected: true } }],
  ["route", { method: "POST", route: "/trust/v1/other", body: requestBody }],
  ["method", { method: "PUT", route: "/trust/v1/agent-requests/verify", body: requestBody }],
] as const) {
  test(`an altered ${name} is rejected`, async () => {
    const signer = await createTestAgentSigner();
    const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
    const proof = await signer.sign(requestBody);

    await assertPublicCode(
      () => verifier.verify(proof, request),
      "invalid_agent_signature",
    );
  });
}

test("an altered build fingerprint is rejected", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const proof = await signer.sign(requestBody, { build_fingerprint: "b".repeat(64) });

  await assertPublicCode(
    () => verifier.verify(proof, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "invalid_agent_signature",
  );
});

test("expired and not-yet-valid envelopes use stable reason codes", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const expired = await signer.sign(requestBody, {
    issued_at: "2026-08-29T11:58:00.000Z",
    expires_at: "2026-08-29T12:04:00.000Z",
  });
  const future = await signer.sign(requestBody, {
    issued_at: "2026-08-29T12:05:00.000Z",
    expires_at: "2026-08-29T12:10:00.000Z",
  });

  await assertPublicCode(
    () => verifier.verify(expired, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "agent_request_expired",
  );
  await assertPublicCode(
    () => verifier.verify(future, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "agent_request_not_yet_valid",
  );
});

test("unknown proof and envelope fields fail closed", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const proof = await signer.sign(requestBody);

  await assertPublicCode(
    () => verifier.verify({ ...proof, unexpected: true }, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "validation_error",
  );
  await assertPublicCode(
    () => verifier.verify({ ...proof, payload: { ...proof.payload, unexpected: true } }, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "validation_error",
  );
});

test("unknown signed protected-header fields fail closed", async () => {
  const signer = await createTestAgentSigner();
  const verifier = new AgentRequestVerifier(registryWith(signer.agent), fixedClock);
  const proof = await signer.sign(requestBody, {}, {
    alg: "ES256",
    kid: signer.agent.verification_key.key_id,
    typ: "unexpected",
  });

  await assertPublicCode(
    () => verifier.verify(proof, {
      method: "POST",
      route: "/trust/v1/agent-requests/verify",
      body: requestBody,
    }),
    "invalid_agent_signature",
  );
});
