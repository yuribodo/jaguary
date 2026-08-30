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

export const paymentMethodNetworkSchema = z.enum(["VISA", "MASTERCARD", "OTHER"]);

export type PaymentMethodNetwork = z.infer<typeof paymentMethodNetworkSchema>;

export const paymentMethodSummarySchema = z
  .object({
    credential_id: identifierSchema,
    network: paymentMethodNetworkSchema,
    last_four: z.string().regex(/^\d{4}$/).nullable(),
    label: z.string().min(1).max(64),
    created_at: utcRfc3339Schema,
    updated_at: utcRfc3339Schema,
  })
  .strict();

export type PaymentMethodSummary = z.infer<typeof paymentMethodSummarySchema>;

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

export const paymentResultStatusSchema = z.enum(["APPROVED", "DECLINED", "TIMEOUT", "UNKNOWN"]);

export type PaymentResultStatus = z.infer<typeof paymentResultStatusSchema>;

export const approvedPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal(paymentResultStatusSchema.enum.APPROVED),
    payment_id: identifierSchema,
    provider_reference: identifierSchema.optional(),
  })
  .strict();

export const declinedPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal(paymentResultStatusSchema.enum.DECLINED),
    payment_id: identifierSchema.optional(),
    decline_code: z.string().min(1).max(128),
  })
  .strict();

export const timeoutPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal(paymentResultStatusSchema.enum.TIMEOUT),
  })
  .strict();

export const unknownPaymentResultSchema = z
  .object({
    ...paymentResultBase,
    status: z.literal(paymentResultStatusSchema.enum.UNKNOWN),
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
