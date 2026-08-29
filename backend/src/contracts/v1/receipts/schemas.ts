import { z } from "zod";

import {
  correlationIdSchema,
  identifierSchema,
  moneySchema,
  sha256Schema,
  utcRfc3339Schema,
} from "../common/primitives.js";
import { commerceItemSchema, flightFulfillmentSchema } from "../commerce/schemas.js";

export const auditEvidenceSchema = z
  .object({
    event_id: identifierSchema,
    correlation_id: correlationIdSchema,
    event_type: z.string().min(1).max(128),
    subject_id: identifierSchema,
    payload_hash: sha256Schema,
    previous_hash: sha256Schema.nullable(),
    event_hash: sha256Schema,
    recorded_at: utcRfc3339Schema,
  })
  .strict();

export type AuditEvidence = z.infer<typeof auditEvidenceSchema>;

export const orderReceiptSchema = z
  .object({
    receipt_id: identifierSchema,
    order_id: identifierSchema,
    checkout_id: identifierSchema,
    authorization_id: identifierSchema,
    payment_id: identifierSchema,
    merchant_id: identifierSchema,
    status: z.enum(["CONFIRMED", "CANCELLED"]),
    items: z.array(commerceItemSchema).min(1),
    total: moneySchema,
    fulfillment: flightFulfillmentSchema,
    issued_at: utcRfc3339Schema,
    evidence: auditEvidenceSchema,
  })
  .strict();

export type OrderReceipt = z.infer<typeof orderReceiptSchema>;
