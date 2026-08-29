import { z } from "zod";

import {
  identifierSchema,
  moneySchema,
  sha256Schema,
  signatureSchema,
  utcRfc3339Schema,
} from "../common/primitives.js";

export const mandateStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "REVOKED",
  "EXPIRED",
  "CONSUMED",
]);

export type MandateStatus = z.infer<typeof mandateStatusSchema>;

export const mandateStatusTransitions: Readonly<Record<MandateStatus, readonly MandateStatus[]>> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["REVOKED", "EXPIRED", "CONSUMED"],
  REVOKED: [],
  EXPIRED: [],
  CONSUMED: [],
};

export function canTransitionMandate(from: MandateStatus, to: MandateStatus): boolean {
  return mandateStatusTransitions[from].includes(to);
}

export const mandateTermsSchema = z
  .object({
    mandate_id: identifierSchema,
    principal_id: identifierSchema,
    agent_id: identifierSchema,
    allowed_merchant_ids: z.array(identifierSchema).min(1),
    max_per_purchase: moneySchema,
    max_aggregate: moneySchema,
    max_uses: z.number().int().positive(),
    valid_from: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
    credential_id: identifierSchema,
  })
  .strict();

export type MandateTerms = z.infer<typeof mandateTermsSchema>;

export const mandateSchema = z
  .object({
    terms: mandateTermsSchema,
    status: mandateStatusSchema,
    terms_hash: sha256Schema,
    principal_signature: signatureSchema,
    created_at: utcRfc3339Schema,
    activated_at: utcRfc3339Schema.optional(),
    revoked_at: utcRfc3339Schema.optional(),
  })
  .strict();

export type Mandate = z.infer<typeof mandateSchema>;
