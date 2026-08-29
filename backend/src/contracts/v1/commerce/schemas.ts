import { z } from "zod";

import {
  identifierSchema,
  moneySchema,
  sha256Schema,
  signatureSchema,
  utcRfc3339Schema,
} from "../common/primitives.js";

export const commerceItemSchema = z
  .object({
    item_id: identifierSchema,
    name: z.string().min(1).max(256),
    quantity: z.number().int().positive(),
    unit_price: moneySchema,
    total: moneySchema,
  })
  .strict();

export type CommerceItem = z.infer<typeof commerceItemSchema>;

export const flightFulfillmentSchema = z
  .object({
    type: z.literal("FLIGHT"),
    origin: z.string().regex(/^[A-Z]{3}$/),
    destination: z.string().regex(/^[A-Z]{3}$/),
    departure_at: utcRfc3339Schema,
    arrival_at: utcRfc3339Schema,
  })
  .strict();

export type FlightFulfillment = z.infer<typeof flightFulfillmentSchema>;

export const purchaseIntentSchema = z
  .object({
    intent_id: identifierSchema,
    agent_id: identifierSchema,
    merchant_id: identifierSchema,
    offer_id: identifierSchema,
    quantity: z.number().int().positive(),
    requested_at: utcRfc3339Schema,
  })
  .strict();

export type PurchaseIntent = z.infer<typeof purchaseIntentSchema>;

export const offerCandidateSchema = z
  .object({
    offer_id: identifierSchema,
    merchant_id: identifierSchema,
    merchant_url: z.url(),
    items: z.array(commerceItemSchema).min(1),
    total: moneySchema,
    fulfillment: flightFulfillmentSchema,
    available_until: utcRfc3339Schema,
    source_url: z.url(),
    observed_at: utcRfc3339Schema,
  })
  .strict();

export type OfferCandidate = z.infer<typeof offerCandidateSchema>;

export const merchantCapabilitySchema = z
  .object({
    name: z.string().min(1).max(256),
    version: z.string().min(1).max(64),
    extends: z.array(z.string().min(1).max(256)).default([]),
  })
  .strict();

export const merchantCapabilitiesSchema = z
  .object({
    merchant_id: identifierSchema,
    merchant_name: z.string().min(1).max(256),
    merchant_url: z.url(),
    protocol: z
      .object({
        name: z.string().min(1).max(64),
        version: z.string().min(1).max(64),
      })
      .strict(),
    capabilities: z.array(merchantCapabilitySchema).min(1),
  })
  .strict();

export type MerchantCapabilities = z.infer<typeof merchantCapabilitiesSchema>;

/** Exact merchant-authored economic content covered by checkout_hash/signature. */
export const checkoutTermsSchema = z
  .object({
    checkout_id: identifierSchema,
    merchant_id: identifierSchema,
    merchant_url: z.url(),
    items: z.array(commerceItemSchema).min(1),
    total: moneySchema,
    fulfillment: flightFulfillmentSchema,
    created_at: utcRfc3339Schema,
    expires_at: utcRfc3339Schema,
    protocol: z
      .object({
        name: z.string().min(1).max(64),
        version: z.string().min(1).max(64),
      })
      .strict(),
  })
  .strict();

export type CheckoutTerms = z.infer<typeof checkoutTermsSchema>;

export const normalizedCheckoutSchema = z
  .object({
    terms: checkoutTermsSchema,
    checkout_hash: sha256Schema,
    merchant_signature: signatureSchema,
  })
  .strict();

export type NormalizedCheckout = z.infer<typeof normalizedCheckoutSchema>;
