import { z } from "zod";

import {
  cabinClassSchema,
  identifierSchema,
  moneySchema,
  sha256Schema,
  signatureSchema,
  utcRfc3339Schema,
} from "../common/primitives.js";
import { paymentCredentialReferenceSchema } from "../payments/schemas.js";

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

export const flightRouteSchema = z
  .object({
    origin: z.string().regex(/^[A-Z]{3}$/),
    destination: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()
  .refine(({ origin, destination }) => origin !== destination, {
    message: "Flight route origin and destination must differ",
  });

export type FlightRoute = z.infer<typeof flightRouteSchema>;

const mandateScopeShape = {
  principal_id: identifierSchema,
  agent_id: identifierSchema,
  allowed_merchant_ids: z.array(identifierSchema),
  allowed_merchant_categories: z.array(identifierSchema),
  route: flightRouteSchema,
  cabin: cabinClassSchema,
  max_per_purchase: moneySchema,
  max_aggregate: moneySchema,
  max_uses: z.number().int().positive(),
  valid_from: utcRfc3339Schema,
  expires_at: utcRfc3339Schema,
  credential_id: identifierSchema,
};

type MandateScope = z.infer<z.ZodObject<typeof mandateScopeShape>>;

function validateMandateScope(terms: MandateScope, context: z.RefinementCtx): void {
  if (terms.allowed_merchant_ids.length === 0 && terms.allowed_merchant_categories.length === 0) {
    context.addIssue({
      code: "custom",
      message: "At least one merchant ID or merchant category is required",
      path: ["allowed_merchant_ids"],
    });
  }
  if (terms.max_per_purchase.currency !== terms.max_aggregate.currency) {
    context.addIssue({
      code: "custom",
      message: "Per-purchase and aggregate limits must use the same currency",
      path: ["max_aggregate", "currency"],
    });
  }
  if (terms.max_aggregate.amount < terms.max_per_purchase.amount) {
    context.addIssue({
      code: "custom",
      message: "Aggregate limit must be at least the per-purchase limit",
      path: ["max_aggregate", "amount"],
    });
  }
  if (Date.parse(terms.valid_from) >= Date.parse(terms.expires_at)) {
    context.addIssue({
      code: "custom",
      message: "Mandate expiry must be after its validity start",
      path: ["expires_at"],
    });
  }
}

export const createMandateDraftInputSchema = z
  .object({
    mandate_id: identifierSchema,
    supersedes_mandate_id: identifierSchema.optional(),
    ...mandateScopeShape,
  })
  .strict()
  .superRefine((input, context) => {
    validateMandateScope(input, context);
    if (input.supersedes_mandate_id === input.mandate_id) {
      context.addIssue({
        code: "custom",
        message: "A mandate cannot supersede itself",
        path: ["supersedes_mandate_id"],
      });
    }
  });

export type CreateMandateDraftInput = z.infer<typeof createMandateDraftInputSchema>;

export const mandateTermsSchema = z
  .object({
    mandate_id: identifierSchema,
    version: z.number().int().positive(),
    supersedes_mandate_id: identifierSchema.optional(),
    ...mandateScopeShape,
  })
  .strict()
  .superRefine((terms, context) => {
    validateMandateScope(terms, context);
    if (terms.supersedes_mandate_id === terms.mandate_id) {
      context.addIssue({
        code: "custom",
        message: "A mandate cannot supersede itself",
        path: ["supersedes_mandate_id"],
      });
    }
  });

export type MandateTerms = z.infer<typeof mandateTermsSchema>;

const mandateCommonShape = {
  terms: mandateTermsSchema,
  payment_credential: paymentCredentialReferenceSchema,
  created_at: utcRfc3339Schema,
};

const signedMandateShape = {
  ...mandateCommonShape,
  terms_hash: sha256Schema,
  principal_signature: signatureSchema,
  activated_at: utcRfc3339Schema,
};

export const draftMandateSchema = z
  .object({
    ...mandateCommonShape,
    status: z.literal("DRAFT"),
    authority_valid: z.literal(false),
  })
  .strict();

export const activeMandateSchema = z
  .object({
    ...signedMandateShape,
    status: z.literal("ACTIVE"),
    authority_valid: z.boolean(),
  })
  .strict();

export type ActiveMandate = z.infer<typeof activeMandateSchema>;

export const revokedMandateSchema = z
  .object({
    ...signedMandateShape,
    status: z.literal("REVOKED"),
    authority_valid: z.literal(false),
    revoked_at: utcRfc3339Schema,
  })
  .strict();

const inactiveSignedMandateShape = {
  ...signedMandateShape,
  authority_valid: z.literal(false),
};

export const expiredMandateSchema = z
  .object({ ...inactiveSignedMandateShape, status: z.literal("EXPIRED") })
  .strict();

export const consumedMandateSchema = z
  .object({ ...inactiveSignedMandateShape, status: z.literal("CONSUMED") })
  .strict();

export const mandateSchema = z
  .discriminatedUnion("status", [
    draftMandateSchema,
    activeMandateSchema,
    revokedMandateSchema,
    expiredMandateSchema,
    consumedMandateSchema,
  ])
  .superRefine((mandate, context) => {
    if (mandate.payment_credential.credential_id !== mandate.terms.credential_id) {
      context.addIssue({
        code: "custom",
        message: "Payment credential reference must match the signed terms",
        path: ["payment_credential", "credential_id"],
      });
    }
  });

export type Mandate = z.infer<typeof mandateSchema>;
