import { z } from "zod";

import {
  offerCandidateSchema,
  PublicApiError,
  sha256CanonicalJson,
  type CabinClass,
  type ClockPort,
  type OfferCandidate,
  type TravelIntent,
} from "../../contracts/v1/index.js";
import { vuelaYaCapabilitiesFixture } from "../../contracts/v1/fixtures/index.js";

const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
const airportSchema = z.object({
  name: z.string().min(1),
  id: z.string().regex(/^[A-Z]{3}$/),
  time: localDateTimeSchema,
}).passthrough();
const segmentSchema = z.object({
  departure_airport: airportSchema,
  arrival_airport: airportSchema,
  airline: z.string().min(1),
  flight_number: z.string().min(1),
}).passthrough();
const resultSchema = z.object({
  flights: z.array(segmentSchema).min(1),
  total_duration: z.number().int().positive(),
  price: z.number().finite().nonnegative(),
}).passthrough();
const responseSchema = z.object({
  search_metadata: z.object({
    status: z.string().optional(),
    google_flights_url: z.url().optional(),
  }).passthrough().optional(),
  best_flights: z.array(resultSchema).optional(),
  other_flights: z.array(resultSchema).optional(),
  error: z.string().optional(),
}).passthrough();

export interface FlightSearchProvider {
  search(intent: TravelIntent): Promise<FlightSearchResult>;
}

export type FlightSearchOutcome = "MATCH_FOUND" | "OVER_BUDGET" | "NO_INVENTORY";

export interface FlightSearchResult {
  outcome: FlightSearchOutcome;
  matches: OfferCandidate[];
  nearest_miss: OfferCandidate | null;
  observed_at: string;
}

export interface GoogleFlightsSearchOptions {
  apiKey: string;
  timeoutMs: number;
  clock: ClockPort;
  deepSearch?: boolean;
  fetch?: typeof fetch;
}

type SearchableTravelIntent = TravelIntent & {
  origin_iata: string;
  destination_iata: string;
  departure_date: string;
  passenger_count: number;
  cabin: CabinClass;
  max_total_budget: NonNullable<TravelIntent["max_total_budget"]>;
};

function travelClass(cabin: CabinClass): string {
  return ({
    ECONOMY: "1",
    PREMIUM_ECONOMY: "2",
    BUSINESS: "3",
    FIRST: "4",
  } satisfies Record<CabinClass, string>)[cabin];
}

function localTimestamp(value: string): string {
  return value.replace(" ", "T");
}

// Google Flights exposes airport-local wall times without an offset. The
// explicit *_local fields are authoritative for display; these normalized UTC
// values retain the legacy v1 ordering/filtering contract.
function normalizedTimestamp(value: string): string {
  return `${localTimestamp(value)}:00.000Z`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function eligibleDepartureDates(value: string, now: Date): string[] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return [value];
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match === null) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const firstEligible = firstOfMonth < tomorrow ? tomorrow : firstOfMonth;
  const dates: string[] = [];
  for (let cursor = firstEligible; cursor <= lastOfMonth; cursor = new Date(cursor.getTime() + 86_400_000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function safeItemName(airlines: string[], flightNumbers: string[], origin: string, destination: string): string {
  const label = `${airlines.join(" + ")} ${flightNumbers.join(" / ")} · ${origin} → ${destination}`;
  return label.slice(0, 256);
}

export class GoogleFlightsSearchProvider implements FlightSearchProvider {
  readonly #fetch: typeof fetch;

  constructor(private readonly options: GoogleFlightsSearchOptions) {
    this.#fetch = options.fetch ?? fetch;
  }

  async search(intent: TravelIntent): Promise<FlightSearchResult> {
    if (
      intent.origin_iata === null
      || intent.destination_iata === null
      || intent.departure_date === null
      || intent.passenger_count === null
      || intent.cabin === null
      || intent.max_total_budget === null
    ) {
      throw new PublicApiError(400, "invalid_request", "Flight search requires a complete travel intent");
    }

    const searchableIntent = intent as SearchableTravelIntent;
    const dates = eligibleDepartureDates(searchableIntent.departure_date, this.options.clock.now());
    if (dates.length === 0) return {
      outcome: "NO_INVENTORY",
      matches: [],
      nearest_miss: null,
      observed_at: this.options.clock.now().toISOString(),
    };

    let nearestMiss: OfferCandidate | null = null;
    for (let index = 0; index < dates.length; index += 3) {
      const batch = await Promise.all(
        dates.slice(index, index + 3).map((date) => this.#searchDate(searchableIntent, date)),
      );
      for (const offers of batch) {
        const matches = offers.filter((offer) => (
          offer.total.currency === searchableIntent.max_total_budget.currency
          && offer.total.amount * searchableIntent.passenger_count <= searchableIntent.max_total_budget.amount
        ));
        if (matches.length > 0) return {
          outcome: "MATCH_FOUND",
          matches,
          nearest_miss: null,
          observed_at: this.options.clock.now().toISOString(),
        };
        const candidate = offers.toSorted((left, right) => left.total.amount - right.total.amount)[0];
        if (candidate !== undefined && (nearestMiss === null || candidate.total.amount < nearestMiss.total.amount)) {
          nearestMiss = candidate;
        }
      }
    }
    return {
      outcome: nearestMiss === null ? "NO_INVENTORY" : "OVER_BUDGET",
      matches: [],
      nearest_miss: nearestMiss,
      observed_at: this.options.clock.now().toISOString(),
    };
  }

  async #searchDate(intent: SearchableTravelIntent, outboundDate: string): Promise<OfferCandidate[]> {
    const params = new URLSearchParams({
      engine: "google_flights",
      api_key: this.options.apiKey,
      departure_id: intent.origin_iata,
      arrival_id: intent.destination_iata,
      outbound_date: outboundDate,
      type: "2",
      travel_class: travelClass(intent.cabin),
      adults: "1",
      currency: intent.max_total_budget.currency,
      gl: "br",
      hl: "pt",
      sort_by: "1",
      ...(this.options.deepSearch ? { deep_search: "true" } : {}),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(`https://serpapi.com/search.json?${params}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network";
      throw new PublicApiError(503, "invalid_request", "Live flight search is temporarily unavailable", {
        provider: "google_flights",
        reason,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new PublicApiError(503, "invalid_request", "Live flight search is temporarily unavailable", {
        provider: "google_flights",
        reason: `http_${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    const parsed = responseSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      throw new PublicApiError(503, "invalid_request", "The live flight provider returned an invalid response", {
        provider: "google_flights",
        retryable: true,
      });
    }
    if (parsed.data.error !== undefined) {
      const emptyResult = /(?:no|hasn't|didn't|not).*?(?:flight|result)/i.test(parsed.data.error);
      if (emptyResult) return [];
      throw new PublicApiError(503, "invalid_request", "The live flight provider returned an invalid response", {
        provider: "google_flights",
        retryable: true,
      });
    }

    const observedAt = this.options.clock.now();
    const availableUntil = new Date(observedAt.getTime() + 15 * 60_000).toISOString();
    const sourceUrl = parsed.data.search_metadata?.google_flights_url
      ?? "https://www.google.com/travel/flights?hl=pt-BR";
    const rankedResults = [
      ...(parsed.data.best_flights ?? []).map((result) => ({ result, ranking: "BEST" as const })),
      ...(parsed.data.other_flights ?? []).map((result) => ({ result, ranking: "OTHER" as const })),
    ].slice(0, 5);

    return rankedResults.map(({ result, ranking }) => {
      const first = result.flights[0]!;
      const last = result.flights.at(-1)!;
      const airlineNames = unique(result.flights.map(({ airline }) => airline));
      const flightNumbers = result.flights.map(({ flight_number: flightNumber }) => flightNumber);
      const unitAmount = Math.round(result.price * 100);
      const identity = {
        origin: first.departure_airport.id,
        destination: last.arrival_airport.id,
        departure: first.departure_airport.time,
        arrival: last.arrival_airport.time,
        flight_numbers: flightNumbers,
        price: unitAmount,
        currency: intent.max_total_budget!.currency,
      };
      const fingerprint = sha256CanonicalJson(identity).slice(0, 24);
      return offerCandidateSchema.parse({
        offer_id: `offer_gf_${fingerprint}`,
        merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
        merchant_url: vuelaYaCapabilitiesFixture.merchant_url,
        items: [{
          item_id: `flight_gf_${fingerprint}`,
          name: safeItemName(airlineNames, flightNumbers, identity.origin, identity.destination),
          quantity: 1,
          unit_price: { amount: unitAmount, currency: intent.max_total_budget!.currency },
          total: { amount: unitAmount, currency: intent.max_total_budget!.currency },
        }],
        total: { amount: unitAmount, currency: intent.max_total_budget!.currency },
        fulfillment: {
          type: "FLIGHT",
          cabin: intent.cabin,
          origin: identity.origin,
          destination: identity.destination,
          departure_at: normalizedTimestamp(first.departure_airport.time),
          arrival_at: normalizedTimestamp(last.arrival_airport.time),
          departure_local: localTimestamp(first.departure_airport.time),
          arrival_local: localTimestamp(last.arrival_airport.time),
          departure_airport_name: first.departure_airport.name,
          arrival_airport_name: last.arrival_airport.name,
          airline_names: airlineNames,
          flight_numbers: flightNumbers,
          duration_minutes: result.total_duration,
          stops: Math.max(0, result.flights.length - 1),
        },
        available_until: availableUntil,
        source_url: sourceUrl,
        observed_at: observedAt.toISOString(),
        source: "GOOGLE_FLIGHTS",
        ranking,
      });
    });
  }
}

export class UnavailableFlightSearchProvider implements FlightSearchProvider {
  async search(): Promise<FlightSearchResult> {
    throw new PublicApiError(503, "invalid_request", "Live flight search is not configured", {
      provider: "google_flights",
      reason: "missing_api_key",
      retryable: false,
    });
  }
}
