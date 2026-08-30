import {
  offerCandidateSchema,
  PublicApiError,
  sha256CanonicalJson,
  type ClockPort,
  type OfferCandidate,
  type TravelIntent,
} from "../../contracts/v1/index.js";
import type { FlightSearchResult } from "../vuelaya/google-flights.js";
import type { TravelWatch, TravelWatchRepositoryPort } from "./watch.js";

interface SimulationCatalogPort {
  queueNextSearchResult(watchId: string, intent: TravelIntent, result: FlightSearchResult): void;
}

export interface TravelWatchSimulatorPort {
  simulateMatch(watchId: string, idempotencyKey: string): Promise<TravelWatch>;
}

export interface DevelopmentTravelWatchSimulatorOptions {
  repository: TravelWatchRepositoryPort;
  catalog: SimulationCatalogPort;
  clock: ClockPort;
  merchantId: string;
  merchantUrl: string;
}

function simulatedDeparture(watch: TravelWatch, now: Date): Date {
  const constraints = watch.authority.flight_constraints;
  const notBefore = Date.parse(constraints.departure_not_before);
  const notAfter = Date.parse(constraints.departure_not_after);
  const preferred = notBefore + 10 * 60 * 60_000;
  const departure = new Date(Math.max(preferred, now.getTime() + 60 * 60_000));
  if (departure.getTime() > notAfter) {
    throw new PublicApiError(409, "invalid_request", "No future departure remains inside this watch window");
  }
  return departure;
}

function simulatedOffer(
  watch: TravelWatch,
  idempotencyKey: string,
  now: Date,
  merchantId: string,
  merchantUrl: string,
): OfferCandidate {
  const unitAmount = Math.floor(
    (watch.criteria.max_total_budget.amount / watch.criteria.passenger_count) * 0.9,
  );
  const departure = simulatedDeparture(watch, now);
  const arrival = new Date(departure.getTime() + 3 * 60 * 60_000);
  const suffix = sha256CanonicalJson({
    watch_id: watch.watch_id,
    criteria_hash: watch.criteria_hash,
    idempotency_key: idempotencyKey,
  }).slice(0, 24);
  const offerId = `offer_dev_sim_${suffix}`;
  const itemId = `flight_dev_sim_${suffix}`;
  const total = { amount: unitAmount, currency: watch.criteria.max_total_budget.currency };
  return offerCandidateSchema.parse({
    offer_id: offerId,
    merchant_id: merchantId,
    merchant_url: merchantUrl,
    items: [{
      item_id: itemId,
      name: `Simulated fare ${watch.criteria.origin_iata} to ${watch.criteria.destination_iata}`,
      quantity: 1,
      unit_price: total,
      total,
    }],
    total,
    fulfillment: {
      type: "FLIGHT",
      cabin: watch.criteria.cabin,
      origin: watch.criteria.origin_iata,
      destination: watch.criteria.destination_iata,
      departure_at: departure.toISOString(),
      arrival_at: arrival.toISOString(),
      airline_names: ["VuelaYa Demo"],
      flight_numbers: ["VY-DEMO"],
      duration_minutes: 180,
      stops: 0,
    },
    available_until: new Date(now.getTime() + 15 * 60_000).toISOString(),
    source_url: `${merchantUrl}/dev-simulation/${offerId}`,
    observed_at: now.toISOString(),
    source: "VUELAYA_DEMO",
    ranking: "BEST",
  });
}

export class DevelopmentTravelWatchSimulator implements TravelWatchSimulatorPort {
  constructor(private readonly options: DevelopmentTravelWatchSimulatorOptions) {}

  async simulateMatch(watchId: string, idempotencyKey: string): Promise<TravelWatch> {
    const watch = await this.options.repository.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status !== "ACTIVE") {
      throw new PublicApiError(409, "invalid_request", "Only an active travel watch can be simulated");
    }
    const now = this.options.clock.now();
    const offer = simulatedOffer(
      watch,
      idempotencyKey,
      now,
      this.options.merchantId,
      this.options.merchantUrl,
    );
    const expedited = await this.options.repository.expedite(watchId, now);
    this.options.catalog.queueNextSearchResult(watch.watch_id, {
      ...watch.criteria,
      selected_offer_id: null,
      confirmation: null,
    }, {
      outcome: "MATCH_FOUND",
      matches: [offer],
      nearest_miss: null,
      observed_at: now.toISOString(),
    });
    return expedited;
  }
}
