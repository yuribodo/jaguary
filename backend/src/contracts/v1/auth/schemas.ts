import { z } from "zod";

import { identifierSchema, utcRfc3339Schema } from "../common/primitives.js";

export const authAssuranceSchema = z.enum(["DEMO", "OIDC"]);
export type AuthAssurance = z.infer<typeof authAssuranceSchema>;

export const sanitizedPrincipalSchema = z.object({
  principal_id: identifierSchema,
  display_name: z.string().trim().min(1).max(128),
}).strict();
export type SanitizedPrincipal = z.infer<typeof sanitizedPrincipalSchema>;

export const principalSessionViewSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false) }).strict(),
  z.object({
    authenticated: z.literal(true),
    principal: sanitizedPrincipalSchema,
    assurance: authAssuranceSchema,
    demo: z.boolean(),
    csrf_token: z.string().min(16).max(256),
    expires_at: utcRfc3339Schema,
  }).strict(),
]);
export type PrincipalSessionView = z.infer<typeof principalSessionViewSchema>;
