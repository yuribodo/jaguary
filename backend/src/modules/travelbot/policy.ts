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
  origin_iata: "de onde você quer sair",
  destination_iata: "qual cidade ou aeroporto você prefere no destino",
  departure_date: "em que data quer viajar",
  passenger_count: "para quantas pessoas",
  cabin: "em qual cabine (por exemplo, econômica)",
  max_total_budget: "quanto pretende gastar e em qual moeda",
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

function normalizedPortuguese(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function destinationRegionFrom(
  recentMessages: readonly string[],
): (typeof brazilianRegions)[number] | undefined {
  for (const message of recentMessages.toReversed()) {
    const normalized = normalizedPortuguese(message);
    for (const region of brazilianRegions) {
      const normalizedRegion = normalizedPortuguese(region).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const destination = new RegExp(
        `(?:\\bpara|\\bpra|\\bpro|\\bate|\\bdestino(?: e|:)?)\\s+(?:(?:o|a)\\s+)?(?:estado\\s+(?:de|do|da)\\s+)?${normalizedRegion}\\b`,
      );
      if (destination.test(normalized)) return region;
    }
  }
  return undefined;
}

function mentionsThailand(recentMessages: readonly string[]): boolean {
  return recentMessages.some((message) => {
    const normalized = normalizedPortuguese(message);
    return /\b(?:thailand|thailandia|tailandia)\b/.test(normalized);
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

const portugueseMonths = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

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
    const normalized = normalizedPortuguese(message);
    if (/\b(?:esse|este|nesse|neste)\s+mes\b|\bthis month\b/.test(normalized)) {
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    if (/\bproximo\s+mes\b|\bnext month\b/.test(normalized)) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    const numericDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/);
    if (numericDate !== null) {
      const day = Number(numericDate[1]);
      const monthIndex = Number(numericDate[2]) - 1;
      let year = inferredYear(monthIndex, now, numericDate[3]);
      const candidate = new Date(Date.UTC(year, monthIndex, day));
      if (numericDate[3] === undefined && candidate <= now) year += 1;
      return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    for (const [monthIndex, month] of portugueseMonths.entries()) {
      const aliases = [normalizedPortuguese(month), englishMonths[monthIndex]!];
      const monthPattern = `(?:${aliases.join("|")})`;
      const exactDate = normalized.match(new RegExp(`\\bdia\\s+(\\d{1,2})\\s+de\\s+${monthPattern}(?:\\s+de\\s+(20\\d{2}))?\\b`));
      if (exactDate !== null) {
        const day = Number(exactDate[1]);
        let year = inferredYear(monthIndex, now, exactDate[2]);
        const candidate = new Date(Date.UTC(year, monthIndex, day));
        if (exactDate[2] === undefined && candidate <= now) year += 1;
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      const monthOnly = new RegExp(`^\\s*${monthPattern}\\s*[.!?]?\\s*$`).test(normalized);
      const monthWithDateContext = new RegExp(
        `\\b(?:mes\\s+de|em|durante|ultimo\\s+dia\\s+de|viajar(?:\\s+em|\\s+no\\s+mes\\s+de)?)\\s+${monthPattern}\\b`,
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
  const normalizedMessages = recentMessages.map(normalizedPortuguese);
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
    /(?:vou\s+)?(?:sair|saio|saindo|partir|parto)\s+de\s+sao paulo\b/.test(message)
    || /\borigem(?:\s+e|:)\s+sao paulo\b/.test(message)
  ));
  if (contextual.origin_iata === null && originContext !== undefined) {
    contextual.origin_iata = "GRU";
    resolved.add("origin_iata");
  }
  if (current.origin_iata === null && contextual.origin_iata === null) {
    const explicitOrigin = recentMessages.toReversed()
      .map((message) => message.match(/\b(?:aeroporto\s+de\s+)?([A-Z]{3})\b/))
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
    const normalized = normalizedPortuguese(message);
    for (const month of portugueseMonths) {
      const normalizedMonth = normalizedPortuguese(month);
      if (new RegExp(`\\bultimo dia de ${normalizedMonth}\\b`).test(normalized)) {
        return `o último dia de ${month}`;
      }
      const datedDeadline = normalized.match(new RegExp(`\\bate(?: no maximo)?(?: o dia)? (\\d{1,2}) de ${normalizedMonth}\\b`));
      if (datedDeadline?.[1] !== undefined) return `${Number(datedDeadline[1])} de ${month}`;
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
    ? "no Rio de Janeiro"
    : destinationRegion === undefined
      ? thailand ? "na Tailândia" : undefined
      : `em ${destinationRegion}`;
  const fields = [...new Set([...invalid, ...missing])].map((field) => (
    field === "destination_iata" && destinationRegionLabel !== undefined
      ? `qual cidade ou aeroporto ${destinationRegionLabel} você prefere`
      : field === "departure_date" && departureDeadline !== undefined
        ? `qual dia até ${departureDeadline} você prefere`
      : fieldLabels[field]
  ));
  if (fields.length === 0) return "Como você gostaria de continuar?";
  const joined = fields.length === 1
    ? fields[0]
    : `${fields.slice(0, -1).join(", ")} e ${fields.at(-1)}`;
  return `Para continuar, me diga ${joined}.`;
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
