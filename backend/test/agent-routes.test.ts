import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { buildApp } from "../src/app.js";
import {
  canonicalizeJson,
  PublicApiError,
  type AgentIdentity,
  type AgentIdentityRegistryPort,
  type AgentRegistration,
  type AgentRegistrationContext,
} from "../src/contracts/v1/index.js";

import { createTestAgentSigner } from "./support/agent-signing.js";

class TestAgentRegistry implements AgentIdentityRegistryPort {
  readonly #agents = new Map<string, AgentIdentity>();
  readonly #idempotency = new Map<string, string>();

  async register(registration: AgentRegistration, context: AgentRegistrationContext) {
    const priorAgentId = this.#idempotency.get(context.idempotencyKey);
    if (priorAgentId !== undefined) {
      const prior = this.#agents.get(priorAgentId);
      if (prior === undefined) throw new Error("invalid test registry state");
      return { agent: prior, created: false };
    }
    if (this.#agents.has(registration.agent_id)) {
      throw new PublicApiError(409, "invalid_request", "Agent ID is already registered");
    }
    const agent: AgentIdentity = {
      ...registration,
      created_at: "2026-08-29T12:04:00.000Z",
    };
    this.#agents.set(agent.agent_id, agent);
    this.#idempotency.set(context.idempotencyKey, agent.agent_id);
    return { agent, created: true };
  }

  async get(agentId: string) {
    return this.#agents.get(agentId);
  }
}

function registrationOf(agent: AgentIdentity): AgentRegistration {
  const { created_at: createdAt, ...registration } = agent;
  void createdAt;
  return registration;
}

test("agent registration and read endpoints preserve idempotency and correlation", async (t) => {
  const signer = await createTestAgentSigner();
  const app = await buildApp({
    agentRegistry: new TestAgentRegistry(),
    clock: { now: () => new Date("2026-08-29T12:04:00.000Z") },
    logger: false,
  });
  t.after(async () => app.close());
  const headers = {
    "idempotency-key": "idem_agent_route_001",
    "x-correlation-id": "corr_agent_route_001",
  };

  const first = await app.inject({
    method: "POST",
    url: "/trust/v1/agents",
    headers,
    payload: registrationOf(signer.agent),
  });
  const repeated = await app.inject({
    method: "POST",
    url: "/trust/v1/agents",
    headers,
    payload: registrationOf(signer.agent),
  });
  const read = await app.inject({
    method: "GET",
    url: `/trust/v1/agents/${signer.agent.agent_id}`,
    headers: { "x-correlation-id": "corr_agent_read_001" },
  });

  assert.equal(first.statusCode, 201);
  assert.equal(repeated.statusCode, 200);
  assert.equal(read.statusCode, 200);
  assert.equal(first.headers["x-correlation-id"], "corr_agent_route_001");
  assert.deepEqual(first.json(), repeated.json());
  assert.deepEqual(read.json(), first.json());
});

test("the verification endpoint returns normalized identity and nonce information", async (t) => {
  const signer = await createTestAgentSigner();
  const registry = new TestAgentRegistry();
  await registry.register(registrationOf(signer.agent), {
    correlationId: "corr_seed_route_001",
    idempotencyKey: "idem_seed_route_001",
  });
  const app = await buildApp({
    agentRegistry: registry,
    clock: { now: () => new Date("2026-08-29T12:04:00.000Z") },
    logger: false,
  });
  t.after(async () => app.close());
  const requestBody = { checkout_id: "checkout_route_001" };
  const proof = await signer.sign(requestBody);

  const response = await app.inject({
    method: "POST",
    url: "/trust/v1/agent-requests/verify",
    headers: {
      "idempotency-key": "idem_verify_route_001",
      "x-correlation-id": "corr_verify_route_001",
    },
    payload: { request_body: requestBody, proof },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    agent_id: signer.agent.agent_id,
    key_id: signer.agent.verification_key.key_id,
    build_fingerprint: signer.agent.build_fingerprint,
    nonce: proof.payload.nonce,
    issued_at: proof.payload.issued_at,
    expires_at: proof.payload.expires_at,
  });
});

test("registration rejects private JWK material and unknown fields without echoing them", async (t) => {
  const signer = await createTestAgentSigner();
  const app = await buildApp({
    agentRegistry: new TestAgentRegistry(),
    logger: false,
  });
  t.after(async () => app.close());
  const registration = registrationOf(signer.agent);
  const response = await app.inject({
    method: "POST",
    url: "/trust/v1/agents",
    headers: { "idempotency-key": "idem_private_jwk_001" },
    payload: {
      ...registration,
      verification_key: {
        ...registration.verification_key,
        public_jwk: {
          ...registration.verification_key.public_jwk,
          d: "must-never-be-accepted",
        },
      },
      unexpected: true,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
  assert.equal(response.body.includes("must-never-be-accepted"), false);
});

test("identity logs contain only identifiers and correlation, never proofs or keys", async (t) => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  const signer = await createTestAgentSigner();
  const registry = new TestAgentRegistry();
  const app = await buildApp({
    agentRegistry: registry,
    clock: { now: () => new Date("2026-08-29T12:04:00.000Z") },
    logger: { level: "info", stream },
  });
  t.after(async () => app.close());
  const requestBody = { checkout_id: "checkout_logs_001" };
  const proof = await signer.sign(requestBody);

  await app.inject({
    method: "POST",
    url: "/trust/v1/agents",
    headers: {
      "idempotency-key": "idem_register_logs_001",
      "x-correlation-id": "corr_register_logs_001",
    },
    payload: registrationOf(signer.agent),
  });
  await app.inject({
    method: "POST",
    url: "/trust/v1/agent-requests/verify",
    headers: {
      "idempotency-key": "idem_verify_logs_001",
      "x-correlation-id": "corr_verify_logs_001",
    },
    payload: { request_body: requestBody, proof },
  });
  const logs = chunks.join("");

  assert.match(logs, new RegExp(signer.agent.agent_id));
  assert.match(logs, new RegExp(signer.agent.verification_key.key_id));
  assert.match(logs, /corr_verify_logs_001/);
  assert.equal(logs.includes(proof.signature), false);
  assert.equal(logs.includes(canonicalizeJson(proof)), false);
  assert.equal(logs.includes(signer.agent.verification_key.public_jwk.x), false);
  assert.equal(logs.includes(signer.agent.verification_key.public_jwk.y), false);
});
