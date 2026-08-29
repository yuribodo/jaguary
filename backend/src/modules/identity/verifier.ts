import { timingSafeEqual } from "node:crypto";

import { compactVerify, importJWK } from "jose";

import {
  agentRequestProofSchema,
  canonicalizeJson,
  PublicApiError,
  sha256CanonicalJson,
  verifiedAgentRequestSchema,
  type AgentHttpRequest,
  type AgentIdentityRegistryPort,
  type AgentRequestProof,
  type AgentRequestVerifierPort,
  type ClockPort,
} from "../../contracts/v1/index.js";

const encoder = new TextEncoder();

function invalidSignature(): PublicApiError {
  return new PublicApiError(401, "invalid_agent_signature", "Agent request signature is invalid");
}

function parseProof(input: unknown): AgentRequestProof {
  const result = agentRequestProofSchema.safeParse(input);
  if (!result.success) {
    throw new PublicApiError(400, "validation_error", "Agent request proof is invalid");
  }
  return result.data;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

export class AgentRequestVerifier implements AgentRequestVerifierPort {
  constructor(
    private readonly registry: Pick<AgentIdentityRegistryPort, "get">,
    private readonly clock: ClockPort,
  ) {}

  async verify(input: unknown, request: AgentHttpRequest) {
    const proof = parseProof(input);
    const { payload } = proof;
    const agent = await this.registry.get(payload.agent_id);

    if (agent === undefined) {
      throw new PublicApiError(401, "agent_not_found", "Agent identity is not registered");
    }
    if (agent.status !== "ACTIVE") {
      throw new PublicApiError(403, "agent_not_active", "Agent identity is not active");
    }

    if (
      proof.algorithm !== "ES256"
      || proof.key_id !== payload.key_id
      || proof.key_id !== agent.verification_key.key_id
      || agent.verification_key.algorithm !== "ES256"
      || payload.build_fingerprint !== agent.build_fingerprint
      || payload.method !== request.method
      || payload.route !== request.route
      || payload.body_hash !== sha256CanonicalJson(request.body)
    ) {
      throw invalidSignature();
    }

    const canonicalPayload = encoder.encode(canonicalizeJson(payload));
    if (proof.payload_hash !== sha256CanonicalJson(payload)) {
      throw invalidSignature();
    }

    try {
      const key = await importJWK(agent.verification_key.public_jwk, "ES256");
      const verification = await compactVerify(proof.signature, key, {
        algorithms: ["ES256"],
      });
      const headerKeys = Object.keys(verification.protectedHeader).sort();
      if (
        headerKeys.length !== 2
        || headerKeys[0] !== "alg"
        || headerKeys[1] !== "kid"
        || verification.protectedHeader.alg !== "ES256"
        || verification.protectedHeader.kid !== proof.key_id
        || !equalBytes(verification.payload, canonicalPayload)
      ) {
        throw invalidSignature();
      }
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      throw invalidSignature();
    }

    const now = this.clock.now().getTime();
    if (now >= Date.parse(payload.expires_at)) {
      throw new PublicApiError(401, "agent_request_expired", "Agent request has expired");
    }
    if (now < Date.parse(payload.issued_at)) {
      throw new PublicApiError(401, "agent_request_not_yet_valid", "Agent request is not yet valid");
    }

    return verifiedAgentRequestSchema.parse({
      agent_id: payload.agent_id,
      key_id: payload.key_id,
      build_fingerprint: payload.build_fingerprint,
      nonce: payload.nonce,
      issued_at: payload.issued_at,
      expires_at: payload.expires_at,
    });
  }
}
