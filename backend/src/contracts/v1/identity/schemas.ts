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

export const agentIdentitySchema = z
  .object({
    agent_id: identifierSchema,
    principal_id: identifierSchema,
    display_name: z.string().min(1).max(256),
    status: agentIdentityStatusSchema,
    verification_key: z
      .object({
        key_id: identifierSchema,
        algorithm: signatureAlgorithmSchema,
        public_key: z.string().min(16).max(8192),
      })
      .strict(),
    created_at: utcRfc3339Schema,
  })
  .strict();

export type AgentIdentity = z.infer<typeof agentIdentitySchema>;

/** Strict content signed by an agent for a single checkout attempt. */
export const agentRequestPayloadSchema = z
  .object({
    agent_id: identifierSchema,
    mandate_id: identifierSchema,
    checkout_id: identifierSchema,
    checkout_hash: sha256Schema,
    nonce: identifierSchema,
    issued_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
  })
  .strict();

export type AgentRequestPayload = z.infer<typeof agentRequestPayloadSchema>;

export const agentRequestProofSchema = z
  .object({
    payload: agentRequestPayloadSchema,
    payload_hash: sha256Schema,
    algorithm: signatureAlgorithmSchema,
    key_id: identifierSchema,
    signature: z.string().min(16).max(4096).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export type AgentRequestProof = z.infer<typeof agentRequestProofSchema>;
