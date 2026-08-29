import { z } from "zod";

import {
  correlationIdSchema,
  identifierSchema,
  moneySchema,
  utcRfc3339Schema,
} from "../common/primitives.js";
import { reservedAuthorizationSchema } from "../authorization/schemas.js";

export const paymentCredentialReferenceSchema = z
  .object({
    credential_id: identifierSchema,
    display: z.string().min(1).max(128),
  })
  .strict();

export type PaymentCredentialReference = z.infer<typeof paymentCredentialReferenceSchema>;

export const authorizedPaymentSchema = z
  .object({
    authorization: reservedAuthorizationSchema,
    credential: paymentCredentialReferenceSchema,
    correlation_id: correlationIdSchema,
  })
  .strict();

export type AuthorizedPayment = z.infer<typeof authorizedPaymentSchema>;

const paymentResultBase = {
  authorization_id: identifierSchema,
  amount: moneySchema,
  occurred_at: utcRfc3339Schema,
};

export const approvedPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal("APPROVED"),
    payment_id: identifierSchema,
    provider_reference: identifierSchema.optional(),
  })
  .strict();

export const declinedPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal("DECLINED"),
    payment_id: identifierSchema.optional(),
    decline_code: z.string().min(1).max(128),
  })
  .strict();

export const timeoutPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal("TIMEOUT"),
  })
  .strict();

export const unknownPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal("UNKNOWN"),
    payment_id: identifierSchema.optional(),
  })
  .strict();

export const paymentResultSchema = z.discriminatedUnion("status", [
  approvedPaymentResultSchema,
  declinedPaymentResultSchema,
  timeoutPaymentResultSchema,
  unknownPaymentResultSchema,
]);

export type PaymentResult = z.infer<typeof paymentResultSchema>;
