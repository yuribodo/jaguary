import { z } from "zod";

import {
  cabinClassSchema,
  identifierSchema,
  moneySchema,
  sha256Schema,
  utcRfc3339Schema,
} from "../common/primitives.js";

export const travelBotStateSchema = z.enum([
  "COLLECTING",
  "READY_TO_SEARCH",
  "AWAITING_OFFER_SELECTION",
  "AWAITING_AUTHORITY_CONFIRMATION",
  "READY_TO_PURCHASE",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
]);

export type TravelBotState = z.infer<typeof travelBotStateSchema>;

export const requiredTravelIntentFieldSchema = z.enum([
  "origin_iata",
  "destination_iata",
  "departure_date",
  "passenger_count",
  "cabin",
  "max_total_budget",
]);

export type RequiredTravelIntentField = z.infer<typeof requiredTravelIntentFieldSchema>;

export const travelConfirmationSchema = z.object({
  approval_id: identifierSchema,
  merchant_id: identifierSchema,
  checkout_hash: sha256Schema,
  amount: z.number().int().safe().nonnegative(),
  currency: moneySchema.shape.currency,
  mandate_id: identifierSchema,
  decision: z.enum(["CONFIRMED", "DENIED"]),
  decided_at: utcRfc3339Schema,
}).strict();

export type TravelConfirmation = z.infer<typeof travelConfirmationSchema>;

export const travelIntentSchema = z.object({
  origin_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  destination_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  passenger_count: z.number().int().min(1).max(9).nullable(),
  cabin: cabinClassSchema.nullable(),
  max_total_budget: moneySchema.nullable(),
  selected_offer_id: identifierSchema.nullable(),
  confirmation: travelConfirmationSchema.nullable(),
}).strict();

export type TravelIntent = z.infer<typeof travelIntentSchema>;

export const travelIntentAmbiguitySchema = z.object({
  field: requiredTravelIntentFieldSchema,
  reason: z.enum(["AMBIGUOUS", "INVALID"]),
}).strict();

export type TravelIntentAmbiguity = z.infer<typeof travelIntentAmbiguitySchema>;

export const travelIntentProposalSchema = z.object({
  origin_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  destination_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  passenger_count: z.number().int().min(1).max(9).nullable(),
  cabin: cabinClassSchema.nullable(),
  max_total_budget: moneySchema.nullable(),
  selected_offer_id: identifierSchema.nullable(),
  explicit_confirmation: z.enum(["CONFIRM", "DENY"]).nullable(),
  ambiguities: z.array(travelIntentAmbiguitySchema),
  requested_action: z.enum([
    "NONE",
    "FIND_OFFERS",
    "CREATE_CHECKOUT",
    "PREPARE_AUTHORITY",
    "REQUEST_PURCHASE",
    "GET_RECEIPT",
    "GET_AUDIT_TIMELINE",
  ]),
}).strict();

export type TravelIntentProposal = z.infer<typeof travelIntentProposalSchema>;

export const agentRuntimeOutputSchema = z.object({
  proposal: travelIntentProposalSchema,
  assistant_message: z.string().min(1).max(2_000),
}).strict();

export type AgentRuntimeOutput = z.infer<typeof agentRuntimeOutputSchema>;

export const travelMessageRoleSchema = z.enum(["USER", "ASSISTANT"]);
export const travelModelRunStatusSchema = z.enum(["RUNNING", "COMPLETED", "FAILED", "INTERRUPTED"]);
export const travelToolExecutionStatusSchema = z.enum(["RUNNING", "COMPLETED", "FAILED", "REJECTED"]);
export const travelApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "DENIED", "CANCELLED", "CONSUMED"]);
export const travelSseEventTypeSchema = z.enum([
  "assistant.delta",
  "state.snapshot",
  "tool.status",
  "confirmation.required",
  "turn.completed",
  "error",
]);
