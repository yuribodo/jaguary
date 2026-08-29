import { z } from "zod";

import {
  identifierSchema,
  sha256Schema,
  signatureAlgorithmSchema,
  utcRfc3339Schema,
} from "../common/primitives.js";

export const principalIdentitySchema = z
  .object({
    principal_id: identifierSchema,
    display_name: z.string().min(1).max(256),
  })
  .strict();

export type PrincipalIdentity = z.infer<typeof principalIdentitySchema>;

export const agentIdentityStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]);

const base64UrlCoordinateSchema = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);

/** Public-only P-256 JWK. Strictness deliberately rejects private `d` material. */
export const es256PublicJwkSchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: base64UrlCoordinateSchema,
    y: base64UrlCoordinateSchema,
  })
  .strict();

export type Es256PublicJwk = z.infer<typeof es256PublicJwkSchema>;

export const agentIdentitySchema = z
  .object({
    agent_id: identifierSchema,
    principal_id: identifierSchema,
    display_name: z.string().min(1).max(256),
    status: agentIdentityStatusSchema,
    build_fingerprint: sha256Schema,
    verification_key: z
      .object({
        key_id: identifierSchema,
        algorithm: z.literal("ES256"),
        public_jwk: es256PublicJwkSchema,
      })
      .strict(),
    created_at: utcRfc3339Schema,
  })
  .strict();

export type AgentIdentity = z.infer<typeof agentIdentitySchema>;

export const agentRegistrationSchema = agentIdentitySchema.omit({ created_at: true });

export type AgentRegistration = z.infer<typeof agentRegistrationSchema>;

export const signedHttpMethodSchema = z.enum([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

/** Strict request envelope signed by an agent. */
export const agentRequestPayloadSchema = z
  .object({
    method: signedHttpMethodSchema,
    route: z.string().min(1).max(2048).startsWith("/"),
    body_hash: sha256Schema,
    agent_id: identifierSchema,
    key_id: identifierSchema,
    build_fingerprint: sha256Schema,
    nonce: identifierSchema,
    issued_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.issued_at) >= Date.parse(value.expires_at)) {
      context.addIssue({
        code: "custom",
        message: "issued_at must be before expires_at",
        path: ["expires_at"],
      });
    }
  });

export type AgentRequestPayload = z.infer<typeof agentRequestPayloadSchema>;

export const agentRequestProofSchema = z
  .object({
    payload: agentRequestPayloadSchema,
    payload_hash: sha256Schema,
    algorithm: signatureAlgorithmSchema,
    key_id: identifierSchema,
    signature: z.string().min(16).max(4096).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  })
  .strict();

export type AgentRequestProof = z.infer<typeof agentRequestProofSchema>;

export const agentRequestVerificationSchema = z
  .object({
    request_body: z.json(),
    proof: agentRequestProofSchema,
  })
  .strict();

export type AgentRequestVerification = z.infer<typeof agentRequestVerificationSchema>;

export const verifiedAgentRequestSchema = z
  .object({
    agent_id: identifierSchema,
    key_id: identifierSchema,
    build_fingerprint: sha256Schema,
    nonce: identifierSchema,
    issued_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
  })
  .strict();

export type VerifiedAgentRequest = z.infer<typeof verifiedAgentRequestSchema>;

export interface AgentHttpRequest {
  method: string;
  route: string;
  body: unknown;
}
