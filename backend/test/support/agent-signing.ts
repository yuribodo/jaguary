import { CompactSign, exportJWK, generateKeyPair } from "jose";

import {
  canonicalizeJson,
  sha256CanonicalJson,
  type AgentIdentity,
  type AgentRequestPayload,
  type AgentRequestProof,
} from "../../src/contracts/v1/index.js";

const encoder = new TextEncoder();

export interface TestAgentSigner {
  agent: AgentIdentity;
  sign(
    body: unknown,
    overrides?: Partial<AgentRequestPayload>,
    protectedHeader?: { alg: string; kid: string; typ?: string },
  ): Promise<AgentRequestProof>;
}

export async function createTestAgentSigner(
  overrides: Partial<AgentIdentity> = {},
): Promise<TestAgentSigner> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const agent: AgentIdentity = {
    agent_id: "agent_travelbot_test",
    principal_id: "principal_marta_test",
    display_name: "TravelBot Test",
    status: "ACTIVE",
    build_fingerprint: "a".repeat(64),
    verification_key: {
      key_id: "key_travelbot_test_2026",
      algorithm: "ES256",
      public_jwk: {
        kty: "EC",
        crv: "P-256",
        x: String(publicJwk.x),
        y: String(publicJwk.y),
      },
    },
    created_at: "2026-08-29T12:00:00.000Z",
    ...overrides,
  };

  return {
    agent,
    async sign(body, payloadOverrides = {}, protectedHeader) {
      const payload: AgentRequestPayload = {
        method: "POST",
        route: "/trust/v1/agent-requests/verify",
        body_hash: sha256CanonicalJson(body),
        agent_id: agent.agent_id,
        key_id: agent.verification_key.key_id,
        build_fingerprint: agent.build_fingerprint,
        nonce: "nonce_travelbot_test_001",
        issued_at: "2026-08-29T12:03:00.000Z",
        expires_at: "2026-08-29T12:08:00.000Z",
        ...payloadOverrides,
      };
      const canonicalPayload = encoder.encode(canonicalizeJson(payload));
      const header = protectedHeader ?? {
        alg: "ES256",
        kid: agent.verification_key.key_id,
      };
      const signature = await new CompactSign(canonicalPayload)
        .setProtectedHeader(header)
        .sign(privateKey);

      return {
        payload,
        payload_hash: sha256CanonicalJson(payload),
        algorithm: header.alg === "EdDSA" ? "EdDSA" : "ES256",
        key_id: header.kid,
        signature,
      };
    },
  };
}
