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

const travelIntentInputFields = requiredTravelIntentFields;

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
    passenger_count: 1,
    cabin: "ECONOMY",
    max_total_budget: null,
    selected_offer_id: null,
    confirmation: null,
  };
}

export function missingTravelIntentFields(intent: TravelIntent): RequiredTravelIntentField[] {
  return requiredTravelIntentFields.filter((field) => intent[field] === null);
}

const fieldLabels: Record<RequiredTravelIntentField, string> = {
  origin_iata: "where you want to depart from",
  destination_iata: "which city or airport you prefer at the destination",
  departure_date: "when you want to travel",
  passenger_count: "how many people are traveling",
  cabin: "which cabin you prefer (for example, economy)",
  max_total_budget: "how much you plan to spend and in which currency",
};

const brazilianRegions = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima",
  "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
] as const;

const preferredAirportByRegion: Partial<Record<(typeof brazilianRegions)[number], string>> = {
  Acre: "RBR", Alagoas: "MCZ", Amapá: "MCP", Amazonas: "MAO", Bahia: "SSA",
  Ceará: "FOR", "Distrito Federal": "BSB", "Espírito Santo": "VIX", Goiás: "GYN",
  Maranhão: "SLZ", "Mato Grosso": "CGB", "Mato Grosso do Sul": "CGR",
  "Minas Gerais": "CNF", Pará: "BEL", Paraíba: "JPA", Paraná: "CWB",
  Pernambuco: "REC", Piauí: "THE", "Rio de Janeiro": "GIG",
  "Rio Grande do Norte": "NAT", "Rio Grande do Sul": "POA", Rondônia: "PVH",
  Roraima: "BVB", "Santa Catarina": "FLN", "São Paulo": "GRU", Sergipe: "AJU",
  Tocantins: "PMW",
};

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function usesDayFirstDateConvention(value: string): boolean {
  return /\b(?:dia|quero|passagem|viagem|viajar|economica|economico|passageir[oa]s?|orcamento|limite|reais)\b/.test(value);
}

function destinationRegionFrom(
  recentMessages: readonly string[],
): (typeof brazilianRegions)[number] | undefined {
  for (const message of recentMessages.toReversed()) {
    const normalized = normalizedText(message);
    for (const region of brazilianRegions) {
      const normalizedRegion = normalizedText(region).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const destination = new RegExp(
        `(?:\\bto|\\btoward|\\bpara(?:\\s+(?:o|a))?|\\bpro|\\bpra|\\bdestination(?: is|:)?|\\bdestino(?:\\s+(?:e|:))?)\\s+(?:the\\s+)?(?:state\\s+of\\s+)?${normalizedRegion}\\b`,
      );
      if (destination.test(normalized)) return region;
    }
  }
  return undefined;
}

function mentionsThailand(recentMessages: readonly string[]): boolean {
  return recentMessages.some((message) => {
    const normalized = normalizedText(message);
    return /\bthailand\b/.test(normalized);
  });
}

function withoutAmbiguities(
  proposal: TravelIntentProposal,
  resolved: ReadonlySet<RequiredTravelIntentField>,
): TravelIntentProposal {
  return {
    ...proposal,
    ambiguities: proposal.ambiguities.filter(({ field }) => !resolved.has(field)),
  };
}

const englishMonths = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

function inferredYear(monthIndex: number, now: Date, explicitYear?: string): number {
  if (explicitYear !== undefined) return Number(explicitYear);
  return now.getUTCFullYear() + (monthIndex < now.getUTCMonth() ? 1 : 0);
}

function departureDateFrom(recentMessages: readonly string[], now: Date): string | undefined {
  for (const message of recentMessages.toReversed()) {
    const normalized = normalizedText(message);
    if (/\bthis month\b/.test(normalized)) {
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    if (/\bnext month\b/.test(normalized)) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    const isoDate = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (isoDate !== null) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;

    const numericDate = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
    if (numericDate !== null) {
      const first = Number(numericDate[1]);
      const second = Number(numericDate[2]);
      const dayFirst = first > 12 || (second <= 12 && usesDayFirstDateConvention(normalized));
      const monthIndex = (dayFirst ? second : first) - 1;
      const day = dayFirst ? first : second;
      let year = inferredYear(monthIndex, now, numericDate[3]);
      const candidate = new Date(Date.UTC(year, monthIndex, day));
      if (numericDate[3] === undefined && candidate <= now) year += 1;
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    for (const [monthIndex, month] of englishMonths.entries()) {
      const dayFirst = normalized.match(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${month}(?:[ ,]+(20\\d{2}))?\\b`));
      const monthFirst = normalized.match(new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[ ,]+(20\\d{2}))?\\b`));
      const exactDate = dayFirst ?? monthFirst;
      if (exactDate !== null) {
        const day = Number(exactDate[1]);
        let year = inferredYear(monthIndex, now, exactDate[2]);
        const candidate = new Date(Date.UTC(year, monthIndex, day));
        if (exactDate[2] === undefined && candidate <= now) year += 1;
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      const monthOnly = new RegExp(`^\\s*${month}\\s*[.!?]?\\s*$`).test(normalized);
      const monthWithDateContext = new RegExp(
        `\\b(?:in|during|last\\s+day\\s+of|travel(?:\\s+in|\\s+during)?)\\s+${month}\\b`,
      ).test(normalized);
      if (monthOnly || monthWithDateContext) {
        const explicitYear = normalized.match(/\b(20\d{2})\b/)?.[1];
        const year = inferredYear(monthIndex, now, explicitYear);
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      }
    }
  }
  return undefined;
}

export function applyConversationConventions(
  current: TravelIntent,
  proposal: TravelIntentProposal,
  recentMessages: readonly string[],
  now: Date,
): TravelIntentProposal {
  let contextual = structuredClone(proposal);
  const normalizedMessages = recentMessages.map(normalizedText);
  const resolved = new Set<RequiredTravelIntentField>();
  for (const field of travelIntentInputFields) {
    if (current[field] !== null && contextual[field] === null) resolved.add(field);
  }

  if (
    current.passenger_count === null
    &&
    contextual.passenger_count === null
  ) {
    contextual.passenger_count = 1;
    resolved.add("passenger_count");
  }

  if (current.cabin === null && contextual.cabin === null) {
    contextual.cabin = "ECONOMY";
    resolved.add("cabin");
  }

  const originContext = normalizedMessages.toReversed().find((message) => (
    /(?:i(?:'m| am)?\s+)?(?:leav(?:e|ing)|depart(?:ing)?)\s+from\s+sao paulo\b/.test(message)
    || /\borigin(?:\s+is|:)\s+sao paulo\b/.test(message)
  ));
  if (contextual.origin_iata === null && originContext !== undefined) {
    contextual.origin_iata = "GRU";
    resolved.add("origin_iata");
  }
  if (current.origin_iata === null && contextual.origin_iata === null) {
    const explicitOrigin = recentMessages.toReversed()
      .map((message) => message.match(/\b(?:airport\s+)?([A-Z]{3})\b/))
      .find((match) => match?.[1] !== undefined)?.[1];
    if (explicitOrigin !== undefined) {
      contextual.origin_iata = explicitOrigin;
      resolved.add("origin_iata");
    }
  }

  const destinationRegion = destinationRegionFrom(recentMessages);
  if (current.destination_iata === null && contextual.destination_iata === null) {
    const preferredAirport = destinationRegion === undefined
      ? mentionsThailand(recentMessages) ? "BKK" : undefined
      : preferredAirportByRegion[destinationRegion];
    if (preferredAirport !== undefined) {
      contextual.destination_iata = preferredAirport;
      resolved.add("destination_iata");
    }
  }

  if (current.departure_date === null) {
    const departureDate = departureDateFrom(recentMessages, now);
    if (departureDate !== undefined) {
      contextual.departure_date = departureDate;
      resolved.add("departure_date");
    }
  }

  contextual = withoutAmbiguities(contextual, resolved);
  return contextual;
}

function departureDeadlineFrom(recentMessages: readonly string[]): string | undefined {
  for (const message of recentMessages.toReversed()) {
    const normalized = normalizedText(message);
    for (const month of englishMonths) {
      if (new RegExp(`\\blast day of ${month}\\b`).test(normalized)) {
        return `the last day of ${month}`;
      }
      const datedDeadline = normalized.match(new RegExp(`\\b(?:by|no later than)(?: the)? (\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${month}\\b`));
      if (datedDeadline?.[1] !== undefined) return `${month} ${Number(datedDeadline[1])}`;
    }
  }
  return undefined;
}

export function deterministicClarification(
  missing: readonly RequiredTravelIntentField[],
  invalid: readonly RequiredTravelIntentField[],
  recentMessages: readonly string[] = [],
): string {
  const destinationRegion = destinationRegionFrom(recentMessages);
  const thailand = mentionsThailand(recentMessages);
  const departureDeadline = departureDeadlineFrom(recentMessages);
  const destinationRegionLabel = destinationRegion === "Rio de Janeiro"
    ? "in Rio de Janeiro"
    : destinationRegion === undefined
      ? thailand ? "in Thailand" : undefined
      : `in ${destinationRegion}`;
  const fields = [...new Set([...invalid, ...missing])].map((field) => (
    field === "destination_iata" && destinationRegionLabel !== undefined
      ? `which city or airport ${destinationRegionLabel} you prefer`
      : field === "departure_date" && departureDeadline !== undefined
        ? `which day up to ${departureDeadline} you prefer`
      : fieldLabels[field]
  ));
  if (fields.length === 0) return "How would you like to continue?";
  const joined = fields.length === 1
    ? fields[0]
    : `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)}`;
  return `To continue, tell me ${joined}.`;
}

export function applyTravelIntentProposal(
  current: TravelIntent,
  proposal: TravelIntentProposal,
  now?: Date,
): AppliedTravelIntentProposal {
  const intent = structuredClone(current);
  const invalid = new Set(proposal.ambiguities.map(({ field }) => field));
  const changedFields: RequiredTravelIntentField[] = [];

  for (const field of travelIntentInputFields) {
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
    if (/^\d{4}-\d{2}$/.test(intent.departure_date)) {
      const [year, month] = intent.departure_date.split("-").map(Number);
      const currentMonth = now === undefined
        ? undefined
        : now.getUTCFullYear() * 12 + now.getUTCMonth();
      const proposedMonth = year! * 12 + month! - 1;
      if (month! < 1 || month! > 12 || (currentMonth !== undefined && proposedMonth < currentMonth)) {
        invalid.add("departure_date");
        intent.departure_date = null;
      }
    } else {
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
