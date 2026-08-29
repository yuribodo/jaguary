import { CompactSign, importJWK, type JWK } from "jose";

import {
  agentRequestProofSchema,
  canonicalizeJson,
  sha256CanonicalJson,
  type AgentRequestPayload,
} from "../../contracts/v1/index.js";
import type { AgentProofFactoryPort } from "./application-tools.js";

const encoder = new TextEncoder();

export interface Es256AgentProofFactoryOptions {
  privateJwk: JWK;
  keyId: string;
  buildFingerprint: string;
}

export class Es256AgentProofFactory implements AgentProofFactoryPort {
  constructor(private readonly options: Es256AgentProofFactoryOptions) {}

  async sign(input: Parameters<AgentProofFactoryPort["sign"]>[0]) {
    const payload: AgentRequestPayload = {
      method: "POST",
      route: "/verify",
      body_hash: sha256CanonicalJson(input.body),
      agent_id: input.agent_id,
      key_id: this.options.keyId,
      build_fingerprint: this.options.buildFingerprint,
      nonce: input.nonce,
      issued_at: input.issued_at,
      expires_at: input.expires_at,
    };
    const key = await importJWK(this.options.privateJwk, "ES256");
    const signature = await new CompactSign(encoder.encode(canonicalizeJson(payload)))
      .setProtectedHeader({ alg: "ES256", kid: this.options.keyId })
      .sign(key);
    return agentRequestProofSchema.parse({
      payload,
      payload_hash: sha256CanonicalJson(payload),
      algorithm: "ES256",
      key_id: this.options.keyId,
      signature,
    });
  }
}
