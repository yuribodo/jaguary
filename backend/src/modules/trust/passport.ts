import { randomUUID } from "node:crypto";

import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT, type JSONWebKeySet } from "jose";

import { agentPassportClaimsSchema, sha256CanonicalJson, type AgentPassportClaims, type AgentTrustSnapshot } from "../../contracts/v1/index.js";
import { agentBindingHash } from "./eligibility.js";

export interface BoundAgentPassportOptions { issuer: string; audience: string; ttlSeconds: number; now?: () => Date }
type PassportKey = Parameters<SignJWT["sign"]>[0];
export class BoundAgentPassportService {
  static async create(options: BoundAgentPassportOptions): Promise<BoundAgentPassportService> {
    const pair = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(pair.publicKey);
    const kid = `bound-passport-${randomUUID()}`;
    return new BoundAgentPassportService(options, pair.privateKey, pair.publicKey, { ...publicJwk, kid, alg: "ES256", use: "sig" }, kid);
  }
  private constructor(private readonly options: BoundAgentPassportOptions, private readonly privateKey: PassportKey, private readonly publicKey: PassportKey, private readonly publicJwk: Record<string, unknown>, private readonly kid: string) {}
  jwks(): JSONWebKeySet { return { keys: [this.publicJwk] as JSONWebKeySet["keys"] }; }

  async issue(trust: AgentTrustSnapshot): Promise<{ token: string; claims: AgentPassportClaims }> {
    if (trust.operational_status !== "ACTIVE" || trust.attestation_status !== "VERIFIED" || trust.expires_at === null || trust.evidence_reference_hash === null || trust.assurance_claims.length === 0) throw new Error("Agent is not eligible for a passport");
    const nowSeconds = Math.floor((this.options.now?.() ?? new Date()).getTime() / 1000);
    const exp = Math.min(nowSeconds + this.options.ttlSeconds, Math.floor(Date.parse(trust.expires_at) / 1000));
    if (exp <= nowSeconds) throw new Error("Agent attestation is expired");
    const claims = agentPassportClaimsSchema.parse({
      iss: this.options.issuer, jti: `passport_${randomUUID()}`, sub: trust.agent_id, principal_ref: sha256CanonicalJson(trust.principal_id),
      key_id: trust.key_id, build_fingerprint: trust.build_fingerprint, assurance_claims: trust.assurance_claims,
      assurance_level: trust.assurance_level, provider: trust.provider, evidence_reference_hash: trust.evidence_reference_hash,
      purpose: "agent-commerce-authorization", aud: this.options.audience, iat: nowSeconds, exp,
    });
    const token = await new SignJWT({
      principal_ref: claims.principal_ref, key_id: claims.key_id, build_fingerprint: claims.build_fingerprint,
      assurance_claims: claims.assurance_claims, assurance_level: claims.assurance_level, provider: claims.provider,
      evidence_reference_hash: claims.evidence_reference_hash, purpose: claims.purpose,
    }).setProtectedHeader({ alg: "ES256", kid: this.kid, typ: "bound-agent-passport+jwt" })
      .setIssuer(claims.iss).setJti(claims.jti).setSubject(claims.sub).setAudience(claims.aud).setIssuedAt(claims.iat).setExpirationTime(claims.exp).sign(this.privateKey);
    return { token, claims };
  }

  async verify(token: string, audience: string, currentTrust: AgentTrustSnapshot): Promise<AgentPassportClaims> {
    let claims: AgentPassportClaims;
    try {
      const result = await jwtVerify(token, this.publicKey, { algorithms: ["ES256"], issuer: this.options.issuer, audience, currentDate: this.options.now?.() ?? new Date(), typ: "bound-agent-passport+jwt" });
      claims = agentPassportClaimsSchema.parse(result.payload);
    } catch { throw new Error("Bound passport verification failed"); }
    const currentBinding = agentBindingHash({ agentId: currentTrust.agent_id, principalId: currentTrust.principal_id, keyId: currentTrust.key_id, buildFingerprint: currentTrust.build_fingerprint });
    if (currentTrust.operational_status !== "ACTIVE" || currentTrust.attestation_status !== "VERIFIED" || currentTrust.binding_hash !== currentBinding
      || claims.sub !== currentTrust.agent_id || claims.key_id !== currentTrust.key_id || claims.build_fingerprint !== currentTrust.build_fingerprint
      || claims.principal_ref !== sha256CanonicalJson(currentTrust.principal_id) || claims.evidence_reference_hash !== currentTrust.evidence_reference_hash) {
      throw new Error("Bound passport invalidated");
    }
    return claims;
  }
  async verifyWithJwks(token: string, audience: string, jwks: JSONWebKeySet): Promise<AgentPassportClaims> {
    try {
      const result = await jwtVerify(token, createLocalJWKSet(jwks), { algorithms: ["ES256"], issuer: this.options.issuer, audience, currentDate: this.options.now?.() ?? new Date(), typ: "bound-agent-passport+jwt" });
      return agentPassportClaimsSchema.parse(result.payload);
    } catch { throw new Error("Bound passport verification failed"); }
  }
}
