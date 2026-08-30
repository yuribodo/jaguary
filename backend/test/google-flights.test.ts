import assert from "node:assert/strict";
import test from "node:test";

import { offerCandidateSchema, type TravelIntent } from "../src/contracts/v1/index.js";
import {
  GoogleFlightsSearchProvider,
  VuelaYaCatalog,
} from "../src/modules/vuelaya/index.js";

const intent: TravelIntent = {
  origin_iata: "GRU",
  destination_iata: "COR",
  departure_date: "2026-09-15",
  passenger_count: 2,
  cabin: "ECONOMY",
  max_total_budget: { amount: 30_000, currency: "USD" },
  selected_offer_id: null,
  confirmation: null,
};

const providerResponse = {
  search_metadata: {
    status: "Success",
    google_flights_url: "https://www.google.com/travel/flights?hl=pt-BR&example=1",
  },
  best_flights: [{
    flights: [{
      departure_airport: { name: "Guarulhos International Airport", id: "GRU", time: "2026-09-15 08:40" },
      arrival_airport: { name: "Ingeniero Aeronáutico Ambrosio L.V. Taravella", id: "COR", time: "2026-09-15 11:40" },
      airline: "LATAM",
      flight_number: "LA 8120",
    }],
    total_duration: 180,
    price: 120,
    type: "One way",
  }],
  other_flights: [],
};

test("Google Flights adapter sends normalized search controls and maps typed live offers", async () => {
  let requestedUrl = "";
  const provider = new GoogleFlightsSearchProvider({
    apiKey: "private-key",
    timeoutMs: 2_000,
    clock: { now: () => new Date("2026-08-29T15:00:00.000Z") },
    fetch: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(providerResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const [offer] = offerCandidateSchema.array().parse(await provider.search(intent));
  assert.ok(offer);
  assert.equal(offer.source, "GOOGLE_FLIGHTS");
  assert.equal(offer.ranking, "BEST");
  assert.deepEqual(offer.total, { amount: 12_000, currency: "USD" });
  assert.equal(offer.fulfillment.departure_local, "2026-09-15T08:40");
  assert.equal(offer.fulfillment.arrival_local, "2026-09-15T11:40");
  assert.deepEqual(offer.fulfillment.airline_names, ["LATAM"]);
  assert.deepEqual(offer.fulfillment.flight_numbers, ["LA 8120"]);
  assert.equal(offer.fulfillment.stops, 0);
  assert.equal(offer.fulfillment.duration_minutes, 180);
  assert.equal(offer.source_url, providerResponse.search_metadata.google_flights_url);

  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get("engine"), "google_flights");
  assert.equal(params.get("type"), "2");
  assert.equal(params.get("departure_id"), "GRU");
  assert.equal(params.get("arrival_id"), "COR");
  assert.equal(params.get("outbound_date"), "2026-09-15");
  assert.equal(params.get("adults"), "1");
  assert.equal(params.get("max_price"), "150");
});

test("a month-only request searches from the first eligible day and returns the earliest day with flights", async () => {
  const requestedDates: string[] = [];
  const provider = new GoogleFlightsSearchProvider({
    apiKey: "private-key",
    timeoutMs: 2_000,
    clock: { now: () => new Date("2026-08-29T15:00:00.000Z") },
    fetch: async (input) => {
      const date = new URL(String(input)).searchParams.get("outbound_date")!;
      requestedDates.push(date);
      if (date !== "2026-09-02") {
        return new Response(JSON.stringify({
          search_metadata: { status: "Success" },
          best_flights: [],
          other_flights: [],
        }), { status: 200 });
      }
      const response = structuredClone(providerResponse);
      response.best_flights[0]!.flights[0]!.departure_airport.time = "2026-09-02 08:40";
      response.best_flights[0]!.flights[0]!.arrival_airport.time = "2026-09-02 11:40";
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });

  const [offer] = await provider.search({ ...intent, departure_date: "2026-09" });

  assert.equal(offer?.fulfillment.departure_local, "2026-09-02T08:40");
  assert.deepEqual(requestedDates, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.ok(requestedDates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
});

test("catalog caches identical searches and deduplicates simultaneous provider calls", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const provider = {
    async search() {
      calls += 1;
      await gate;
      return new GoogleFlightsSearchProvider({
        apiKey: "private-key",
        timeoutMs: 2_000,
        clock: { now: () => new Date("2026-08-29T15:00:00.000Z") },
        fetch: async () => new Response(JSON.stringify(providerResponse), { status: 200 }),
      }).search(intent);
    },
  };
  const catalog = new VuelaYaCatalog(provider, [], {
    clock: { now: () => new Date("2026-08-29T15:00:00.000Z") },
    ttlMs: 5 * 60_000,
    maxEntries: 10,
  });

  const first = catalog.search(intent);
  const second = catalog.search(intent);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(await catalog.search(intent), a);
  assert.equal(calls, 1);
});
