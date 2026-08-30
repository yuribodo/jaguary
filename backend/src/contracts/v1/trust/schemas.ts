import { z } from "zod";

import { agentIdentityStatusSchema } from "../identity/schemas.js";
import { identifierSchema, sha256Schema, utcRfc3339Schema } from "../common/primitives.js";

export const kyaModeSchema = z.enum(["LOCAL", "EXTERNAL_OPTIONAL", "EXTERNAL_REQUIRED"]);
export type KyaMode = z.infer<typeof kyaModeSchema>;
export const agentAttestationStatusSchema = z.enum([
  "PENDING", "VERIFIED", "REJECTED", "EXPIRED", "REVOKED", "ERROR",
]);
export type AgentAttestationStatus = z.infer<typeof agentAttestationStatusSchema>;
export const agentAssuranceClaimSchema = z.enum([
  "OPERATOR_IDENTITY", "ORGANIZATION_OWNERSHIP", "AGENT_OPERATOR_BINDING", "BUILD_PROVENANCE",
]);
export type AgentAssuranceClaim = z.infer<typeof agentAssuranceClaimSchema>;
export const assuranceLevelSchema = z.enum(["LOCAL_CRYPTOGRAPHIC", "EXTERNAL_OPERATOR_IDENTITY"]);

export const agentTrustSnapshotSchema = z.object({
  mode: kyaModeSchema,
  agent_id: identifierSchema,
  principal_id: identifierSchema,
  operational_status: agentIdentityStatusSchema,
  attestation_status: agentAttestationStatusSchema.nullable(),
  attestation_id: identifierSchema.nullable(),
  key_id: identifierSchema,
  build_fingerprint: sha256Schema,
  provider: z.enum(["fake", "didit"]),
  assurance_claims: z.array(agentAssuranceClaimSchema),
  assurance_level: assuranceLevelSchema,
  binding_hash: sha256Schema,
  evidence_reference_hash: sha256Schema.nullable(),
  issued_at: utcRfc3339Schema.nullable(),
  expires_at: utcRfc3339Schema.nullable(),
}).strict();
export type AgentTrustSnapshot = z.infer<typeof agentTrustSnapshotSchema>;

export const agentPassportClaimsSchema = z.object({
  iss: z.url(),
  jti: identifierSchema,
  sub: identifierSchema,
  principal_ref: sha256Schema,
  key_id: identifierSchema,
  build_fingerprint: sha256Schema,
  assurance_claims: z.array(agentAssuranceClaimSchema).min(1),
  assurance_level: assuranceLevelSchema,
  provider: z.enum(["fake", "didit"]),
  evidence_reference_hash: sha256Schema,
  purpose: z.literal("agent-commerce-authorization"),
  aud: z.string().min(1).max(128),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
}).strict();
export type AgentPassportClaims = z.infer<typeof agentPassportClaimsSchema>;
