import assert from "node:assert/strict";
import test from "node:test";

import {
  applyConversationConventions,
  applyTravelIntentProposal,
  deterministicClarification,
  emptyTravelIntent,
  missingTravelIntentFields,
} from "../src/modules/travelbot/policy.js";

function noChangeProposal() {
  return {
    origin_iata: null,
    destination_iata: null,
    departure_date: null,
    passenger_count: null,
    cabin: null,
    max_total_budget: null,
    selected_offer_id: null,
    explicit_confirmation: null,
    ambiguities: [],
    requested_action: "NONE" as const,
  };
}

test("a complete request in one turn produces a complete normalized travel intent", () => {
  const result = applyTravelIntentProposal(emptyTravelIntent(), {
    origin_iata: "GRU",
    destination_iata: "COR",
    departure_date: "2026-09-15",
    passenger_count: 1,
    cabin: "ECONOMY",
    max_total_budget: { amount: 15000, currency: "USD" },
    selected_offer_id: null,
    explicit_confirmation: null,
    ambiguities: [],
    requested_action: "FIND_OFFERS",
  });

  assert.deepEqual(missingTravelIntentFields(result.intent), []);
  assert.deepEqual(result.invalid_fields, []);
  assert.equal(result.intent.origin_iata, "GRU");
  assert.equal(result.intent.destination_iata, "COR");
  assert.deepEqual(result.intent.max_total_budget, { amount: 15000, currency: "USD" });
});

test("all missing fields are grouped into one concise deterministic question", () => {
  const question = deterministicClarification(
    missingTravelIntentFields(emptyTravelIntent()),
    [],
  );

  assert.equal(
    question,
    "To continue, tell me where you want to depart from, which city or airport you prefer at the destination, when you want to travel and how much you plan to spend and in which currency.",
  );
  assert.equal((question.match(/\?/g) ?? []).length, 0);
});

test("a regional destination is named in the clarification without asking inferred defaults again", () => {
  const question = deterministicClarification(
    ["origin_iata", "destination_iata", "departure_date"],
    [],
    ["I want to buy a ticket to Rondônia for no more than 3,000 reais."],
  );

  assert.equal(
    question,
    "To continue, tell me where you want to depart from, which city or airport in Rondônia you prefer and when you want to travel.",
  );
  assert.doesNotMatch(question, /passenger|cabin/i);
});

test("the Rio de Janeiro clarification uses natural English", () => {
  assert.equal(
    deterministicClarification(
      ["destination_iata"],
      [],
      ["I want a flight to Rio de Janeiro."],
    ),
    "To continue, tell me which city or airport in Rio de Janeiro you prefer.",
  );
});

test("Portuguese destination phrasing resolves Rio de Janeiro instead of asking again", () => {
  const proposal = applyConversationConventions(
    emptyTravelIntent(),
    noChangeProposal(),
    ["Quero ir pro Rio de Janeiro"],
    new Date("2026-08-30T12:00:00.000Z"),
  );

  assert.equal(proposal.destination_iata, "GIG");
  assert.equal(proposal.ambiguities.some(({ field }) => field === "destination_iata"), false);
});

test("a correction after offer selection invalidates the selected offer", () => {
  const current = {
    origin_iata: "GRU",
    destination_iata: "COR",
    departure_date: "2026-09-15",
    passenger_count: 1,
    cabin: "ECONOMY" as const,
    max_total_budget: { amount: 15000, currency: "USD" as const },
    selected_offer_id: "offer_vy_471_gru_cor",
    confirmation: null,
  };

  const result = applyTravelIntentProposal(current, {
    origin_iata: null,
    destination_iata: null,
    departure_date: null,
    passenger_count: 2,
    cabin: null,
    max_total_budget: null,
    selected_offer_id: null,
    explicit_confirmation: null,
    ambiguities: [],
    requested_action: "NONE",
  });

  assert.equal(result.intent.passenger_count, 2);
  assert.equal(result.intent.selected_offer_id, null);
  assert.deepEqual(result.changed_fields, ["passenger_count"]);
  assert.equal(result.invalidates_downstream, true);
});

test("same-route and impossible or past dates are rejected deterministically", () => {
  const result = applyTravelIntentProposal(emptyTravelIntent(), {
    origin_iata: "GRU",
    destination_iata: "GRU",
    departure_date: "2026-02-30",
    passenger_count: 1,
    cabin: "ECONOMY",
    max_total_budget: { amount: 15000, currency: "USD" },
    selected_offer_id: null,
    explicit_confirmation: null,
    ambiguities: [],
    requested_action: "FIND_OFFERS",
  }, new Date("2026-08-29T12:00:00.000Z"));
  assert.equal(result.intent.destination_iata, null);
  assert.equal(result.intent.departure_date, null);
  assert.deepEqual(new Set(result.invalid_fields), new Set(["destination_iata", "departure_date"]));
});

test("every individual missing field is named by the deterministic clarification", () => {
  const complete = {
    origin_iata: "GRU",
    destination_iata: "COR",
    departure_date: "2026-09-15",
    passenger_count: 1,
    cabin: "ECONOMY" as const,
    max_total_budget: { amount: 15000, currency: "USD" as const },
    selected_offer_id: null,
    confirmation: null,
  };
  for (const field of [
    "origin_iata",
    "destination_iata",
    "departure_date",
    "passenger_count",
    "cabin",
    "max_total_budget",
  ] as const) {
    const intent = { ...complete, [field]: null };
    const missing = missingTravelIntentFields(intent);
    assert.deepEqual(missing, [field]);
    assert.match(deterministicClarification(missing, []), /^To continue, tell me /);
  }
});
