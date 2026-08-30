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
import type { FlightSearchProvider } from "./google-flights.js";

export function getVuelaYaProfile(): MerchantCapabilities {
  return merchantCapabilitiesSchema.parse(vuelaYaCapabilitiesFixture);
}

export function listVuelaYaOffers(): OfferCandidate[] {
  return offerCandidateSchema.array().parse([offerCandidateFixture]);
}

export class FixtureFlightSearchProvider implements FlightSearchProvider {
  async search(): Promise<OfferCandidate[]> {
    return listVuelaYaOffers();
  }
}

export interface VuelaYaCatalogPort {
  search(intent: TravelIntent): Promise<OfferCandidate[]>;
  list(): OfferCandidate[];
  get(offerId: string): OfferCandidate | undefined;
  remember?(offers: OfferCandidate[]): void;
}

export class VuelaYaCatalog implements VuelaYaCatalogPort {
  readonly #offers = new Map<string, OfferCandidate>();
  readonly #searches = new Map<string, { expiresAt: number; offers: OfferCandidate[] }>();
  readonly #pending = new Map<string, Promise<OfferCandidate[]>>();

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

  async search(intent: TravelIntent): Promise<OfferCandidate[]> {
    const key = JSON.stringify({
      origin: intent.origin_iata,
      destination: intent.destination_iata,
      date: intent.departure_date,
      passengers: intent.passenger_count,
      cabin: intent.cabin,
      budget: intent.max_total_budget,
    });
    const now = this.cache.clock.now().getTime();
    const cached = this.#searches.get(key);
    if (cached !== undefined && cached.expiresAt > now) return structuredClone(cached.offers);
    this.#searches.delete(key);

    const inFlight = this.#pending.get(key);
    if (inFlight !== undefined) return structuredClone(await inFlight);
    const request = this.provider.search(intent).then((result) => {
      const offers = offerCandidateSchema.array().parse(result);
      for (const offer of offers) this.#offers.set(offer.offer_id, structuredClone(offer));
      this.#searches.set(key, {
        expiresAt: this.cache.clock.now().getTime() + this.cache.ttlMs,
        offers: structuredClone(offers),
      });
      while (this.#searches.size > this.cache.maxEntries) {
        const oldest = this.#searches.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.#searches.delete(oldest);
      }
      return offers;
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
}
