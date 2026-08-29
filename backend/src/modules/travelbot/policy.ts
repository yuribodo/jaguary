import type {
  RequiredTravelIntentField,
  TravelIntent,
  TravelIntentProposal,
} from "../../contracts/v1/index.js";

export const requiredTravelIntentFields = [
  "origin_iata",
  "destination_iata",
  "departure_date",
  "passenger_count",
  "cabin",
  "max_total_budget",
] as const;

export interface AppliedTravelIntentProposal {
  intent: TravelIntent;
  invalid_fields: RequiredTravelIntentField[];
  changed_fields: RequiredTravelIntentField[];
  invalidates_downstream: boolean;
}

export function emptyTravelIntent(): TravelIntent {
  return {
    origin_iata: null,
    destination_iata: null,
    departure_date: null,
    passenger_count: null,
    cabin: null,
    max_total_budget: null,
    selected_offer_id: null,
    confirmation: null,
  };
}

export function missingTravelIntentFields(intent: TravelIntent): RequiredTravelIntentField[] {
  return requiredTravelIntentFields.filter((field) => intent[field] === null);
}

const fieldLabels: Record<RequiredTravelIntentField, string> = {
  origin_iata: "origem (IATA)",
  destination_iata: "destino (IATA)",
  departure_date: "data de ida",
  passenger_count: "passageiros",
  cabin: "cabine",
  max_total_budget: "orçamento total com moeda",
};

export function deterministicClarification(
  missing: readonly RequiredTravelIntentField[],
  invalid: readonly RequiredTravelIntentField[],
): string {
  if (missing.length === requiredTravelIntentFields.length && invalid.length === 0) {
    return "Informe origem e destino (IATA), data de ida, passageiros, cabine e orçamento total com moeda.";
  }
  const fields = [...new Set([...invalid, ...missing])].map((field) => fieldLabels[field]);
  if (fields.length === 0) return "Como deseja continuar?";
  const joined = fields.length === 1
    ? fields[0]
    : `${fields.slice(0, -1).join(", ")} e ${fields.at(-1)}`;
  return `Informe ${joined}.`;
}

export function applyTravelIntentProposal(
  current: TravelIntent,
  proposal: TravelIntentProposal,
  now?: Date,
): AppliedTravelIntentProposal {
  const intent = structuredClone(current);
  const invalid = new Set(proposal.ambiguities.map(({ field }) => field));
  const changedFields: RequiredTravelIntentField[] = [];

  for (const field of requiredTravelIntentFields) {
    const value = proposal[field];
    if (value === null || invalid.has(field)) continue;
    if (JSON.stringify(intent[field]) !== JSON.stringify(value)) changedFields.push(field);
    Object.assign(intent, { [field]: value });
  }
  if (proposal.selected_offer_id !== null) intent.selected_offer_id = proposal.selected_offer_id;

  if (
    intent.origin_iata !== null
    && intent.destination_iata !== null
    && intent.origin_iata === intent.destination_iata
  ) {
    invalid.add("destination_iata");
    intent.destination_iata = null;
  }
  if (intent.departure_date !== null) {
    const [year, month, day] = intent.departure_date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year!, month! - 1, day!));
    const isCalendarDate = parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month! - 1
      && parsed.getUTCDate() === day;
    const today = now === undefined
      ? undefined
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (!isCalendarDate || (today !== undefined && parsed <= today)) {
      invalid.add("departure_date");
      intent.departure_date = null;
    }
  }

  const invalidatesDownstream = changedFields.length > 0 && current.selected_offer_id !== null;
  if (invalidatesDownstream) intent.selected_offer_id = null;

  return {
    intent,
    invalid_fields: [...invalid],
    changed_fields: changedFields,
    invalidates_downstream: invalidatesDownstream,
  };
}
