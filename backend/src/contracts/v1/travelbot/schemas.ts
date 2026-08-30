import { z } from "zod";

import {
  cabinClassSchema,
  identifierSchema,
  moneySchema,
  sha256Schema,
  utcRfc3339Schema,
} from "../common/primitives.js";
import { conditionalFlightConstraintsSchema } from "../mandates/schemas.js";

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
  departure_date: z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/).nullable(),
  passenger_count: z.number().int().min(1).max(9).nullable(),
  cabin: cabinClassSchema.nullable(),
  max_total_budget: moneySchema.nullable(),
  selected_offer_id: identifierSchema.nullable(),
  confirmation: travelConfirmationSchema.nullable(),
}).strict();

export type TravelIntent = z.infer<typeof travelIntentSchema>;

export const travelWatchModeSchema = z.enum(["ASK_BEFORE_PURCHASE", "AUTO_PURCHASE"]);
export type TravelWatchMode = z.infer<typeof travelWatchModeSchema>;

export const travelWatchStatusSchema = z.enum([
  "AWAITING_LIVENESS",
  "ACTIVE",
  "CHECKING",
  "MATCHED",
  "EXECUTING",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
]);
export type TravelWatchStatus = z.infer<typeof travelWatchStatusSchema>;

export const travelWatchCriteriaSchema = z.object({
  origin_iata: z.string().regex(/^[A-Z]{3}$/),
  destination_iata: z.string().regex(/^[A-Z]{3}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/),
  passenger_count: z.number().int().min(1).max(9),
  cabin: cabinClassSchema,
  max_total_budget: moneySchema,
}).strict();
export type TravelWatchCriteria = z.infer<typeof travelWatchCriteriaSchema>;

export const travelWatchAuthoritySchema = z.object({
  max_per_purchase: moneySchema,
  max_uses: z.number().int().positive(),
  expires_at: utcRfc3339Schema,
  flight_constraints: conditionalFlightConstraintsSchema,
}).strict();
export type TravelWatchAuthority = z.infer<typeof travelWatchAuthoritySchema>;

export const travelWatchNearestMissSchema = z.object({
  offer_id: identifierSchema,
  unit_total: moneySchema,
  party_total: moneySchema,
}).strict();
export type TravelWatchNearestMiss = z.infer<typeof travelWatchNearestMissSchema>;

export const travelIntentAmbiguitySchema = z.object({
  field: requiredTravelIntentFieldSchema,
  reason: z.enum(["AMBIGUOUS", "INVALID"]),
}).strict();

export type TravelIntentAmbiguity = z.infer<typeof travelIntentAmbiguitySchema>;

export const travelIntentProposalSchema = z.object({
  origin_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  destination_iata: z.string().regex(/^[A-Z]{3}$/).nullable(),
  departure_date: z.string().regex(/^\d{4}-\d{2}(?:-\d{2})?$/).nullable(),
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
