import {
  merchantCapabilitiesSchema,
  offerCandidateFixture,
  offerCandidateSchema,
  vuelaYaCapabilitiesFixture,
  type MerchantCapabilities,
  type ClockPort,
  type OfferCandidate,
  type TravelIntent,
} from "../../contracts/v1/index.js";
import type { FlightSearchProvider, FlightSearchResult } from "./google-flights.js";

export function getVuelaYaProfile(): MerchantCapabilities {
  return merchantCapabilitiesSchema.parse(vuelaYaCapabilitiesFixture);
}

export function listVuelaYaOffers(): OfferCandidate[] {
  return offerCandidateSchema.array().parse([offerCandidateFixture]);
}

export class FixtureFlightSearchProvider implements FlightSearchProvider {
  async search(): Promise<FlightSearchResult> {
    return {
      outcome: "MATCH_FOUND",
      matches: listVuelaYaOffers(),
      nearest_miss: null,
      observed_at: new Date(offerCandidateFixture.observed_at ?? offerCandidateFixture.available_until).toISOString(),
    };
  }
}

export interface VuelaYaCatalogPort {
  search(intent: TravelIntent, watchId?: string): Promise<FlightSearchResult>;
  list(): OfferCandidate[];
  get(offerId: string): OfferCandidate | undefined;
  remember?(offers: OfferCandidate[]): void;
  queueNextSearchResult?(watchId: string, intent: TravelIntent, result: FlightSearchResult): void;
}

function searchKey(intent: TravelIntent): string {
  return JSON.stringify({
    origin: intent.origin_iata,
    destination: intent.destination_iata,
    date: intent.departure_date,
    passengers: intent.passenger_count,
    cabin: intent.cabin,
    budget: intent.max_total_budget,
  });
}

export class VuelaYaCatalog implements VuelaYaCatalogPort {
  readonly #offers = new Map<string, OfferCandidate>();
  readonly #searches = new Map<string, { expiresAt: number; result: FlightSearchResult }>();
  readonly #pending = new Map<string, Promise<FlightSearchResult>>();
  readonly #queuedResults = new Map<string, FlightSearchResult>();

  constructor(
    private readonly provider: FlightSearchProvider = new FixtureFlightSearchProvider(),
    seed: OfferCandidate[] = listVuelaYaOffers(),
    private readonly cache: {
      clock: ClockPort;
      ttlMs: number;
      maxEntries: number;
    } = {
      clock: { now: () => new Date() },
      ttlMs: 5 * 60_000,
      maxEntries: 100,
    },
  ) {
    this.remember(seed);
  }

  async search(intent: TravelIntent, watchId?: string): Promise<FlightSearchResult> {
    const key = searchKey(intent);
    const simulationKey = watchId === undefined ? undefined : `${watchId}:${key}`;
    const queued = simulationKey === undefined ? undefined : this.#queuedResults.get(simulationKey);
    if (queued !== undefined) {
      this.#queuedResults.delete(simulationKey!);
      this.remember([
        ...queued.matches,
        ...(queued.nearest_miss === null ? [] : [queued.nearest_miss]),
      ]);
      return structuredClone(queued);
    }
    const now = this.cache.clock.now().getTime();
    const cached = this.#searches.get(key);
    if (cached !== undefined && cached.expiresAt > now) return structuredClone(cached.result);
    this.#searches.delete(key);

    const inFlight = this.#pending.get(key);
    if (inFlight !== undefined) return structuredClone(await inFlight);
    const request = this.provider.search(intent).then((result) => {
      const offers = offerCandidateSchema.array().parse([
        ...result.matches,
        ...(result.nearest_miss === null ? [] : [result.nearest_miss]),
      ]);
      for (const offer of offers) this.#offers.set(offer.offer_id, structuredClone(offer));
      this.#searches.set(key, {
        expiresAt: this.cache.clock.now().getTime() + this.cache.ttlMs,
        result: structuredClone(result),
      });
      while (this.#searches.size > this.cache.maxEntries) {
        const oldest = this.#searches.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#searches.delete(oldest);
      }
      return result;
    }).finally(() => this.#pending.delete(key));
    this.#pending.set(key, request);
    return structuredClone(await request);
  }

  list(): OfferCandidate[] {
    return structuredClone([...this.#offers.values()]);
  }

  get(offerId: string): OfferCandidate | undefined {
    const offer = this.#offers.get(offerId);
    return offer === undefined ? undefined : structuredClone(offer);
  }

  remember(offers: OfferCandidate[]): void {
    for (const offer of offerCandidateSchema.array().parse(offers)) {
      this.#offers.set(offer.offer_id, structuredClone(offer));
    }
  }

  queueNextSearchResult(watchId: string, intent: TravelIntent, result: FlightSearchResult): void {
    const parsedOffers = offerCandidateSchema.array().parse([
      ...result.matches,
      ...(result.nearest_miss === null ? [] : [result.nearest_miss]),
    ]);
    const parsedResult: FlightSearchResult = {
      outcome: result.outcome,
      matches: parsedOffers.slice(0, result.matches.length),
      nearest_miss: result.nearest_miss === null ? null : parsedOffers.at(-1)!,
      observed_at: new Date(result.observed_at).toISOString(),
    };
    const key = searchKey(intent);
    this.#searches.delete(key);
    this.#queuedResults.set(`${watchId}:${key}`, structuredClone(parsedResult));
  }
}
