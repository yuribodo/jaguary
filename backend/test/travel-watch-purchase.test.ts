import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRequestProofFixture,
  mandateFixture,
  normalizedCheckoutSchema,
  offerCandidateFixture,
  offerCandidateSchema,
  orderReceiptFixture,
  sha256CanonicalJson,
} from "../src/contracts/v1/index.js";
import {
  ApplicationTravelWatchPurchases,
  type TravelWatch,
} from "../src/modules/travelbot/index.js";

test("automatic watch purchase uses its already-active conditional mandate without new liveness", async () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const offer = offerCandidateSchema.parse({
    ...offerCandidateFixture,
    offer_id: "offer_watch_purchase_001",
    total: { amount: 70_000, currency: "BRL" },
    items: [{
      ...offerCandidateFixture.items[0]!,
      unit_price: { amount: 70_000, currency: "BRL" },
      total: { amount: 70_000, currency: "BRL" },
    }],
    fulfillment: {
      ...offerCandidateFixture.fulfillment,
      departure_at: "2026-09-15T10:00:00.000Z",
      arrival_at: "2026-09-15T13:05:00.000Z",
    },
    available_until: "2026-08-30T12:15:00.000Z",
    observed_at: now.toISOString(),
  });
  const watch: TravelWatch = {
    watch_id: "d83cb674-70ce-4555-b3b1-2dfd2e21b18e",
    conversation_id: "5a89de04-4b45-4dc4-a0c4-ed12ceaa9bea",
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    mode: "AUTO_PURCHASE",
    status: "CHECKING",
    criteria: {
      origin_iata: "GRU",
      destination_iata: "COR",
      departure_date: "2026-09",
      passenger_count: 2,
      cabin: "ECONOMY",
      max_total_budget: { amount: 150_000, currency: "BRL" },
    },
    criteria_hash: "b".repeat(64),
    mandate_id: "mandate_watch_purchase_001",
    authority: {
      max_per_purchase: { amount: 150_000, currency: "BRL" },
      max_uses: 1,
      expires_at: "2026-09-30T23:59:59.999Z",
      flight_constraints: {
        departure_not_before: "2026-09-01T00:00:00.000Z",
        departure_not_after: "2026-09-30T23:59:59.999Z",
        passenger_count: 2,
      },
    },
    next_check_at: null,
    last_checked_at: now.toISOString(),
    expires_at: "2026-09-30T23:59:59.999Z",
    attempt_count: 1,
    consecutive_failures: 0,
    last_outcome: null,
    nearest_miss: null,
    matched_offer_id: offer.offer_id,
    matched_offer: offer,
    receipt_id: null,
    version: 3,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const checkoutTerms = {
    checkout_id: "checkout_watch_purchase_001",
    merchant_id: offer.merchant_id,
    merchant_url: offer.merchant_url,
    items: offer.items.map((item) => ({
      ...item,
      quantity: 2,
      total: { amount: item.unit_price.amount * 2, currency: item.unit_price.currency },
    })),
    total: { amount: 140_000, currency: "BRL" },
    fulfillment: offer.fulfillment,
    created_at: now.toISOString(),
    expires_at: "2026-08-30T12:15:00.000Z",
    protocol: { name: "UCP", version: "2026-08-25" },
  };
  const checkout = normalizedCheckoutSchema.parse({
    terms: checkoutTerms,
    checkout_hash: sha256CanonicalJson(checkoutTerms),
    merchant_signature: mandateFixture.principal_signature,
  });
  const activeMandate = {
    ...mandateFixture,
    terms: {
      ...mandateFixture.terms,
      mandate_id: watch.mandate_id,
      max_per_purchase: watch.authority.max_per_purchase,
      max_aggregate: watch.authority.max_per_purchase,
      expires_at: watch.expires_at,
      flight_constraints: watch.authority.flight_constraints,
    },
  };
  activeMandate.terms_hash = sha256CanonicalJson(activeMandate.terms);
  const purchases = new ApplicationTravelWatchPurchases({
    merchant: { createCheckout: async () => checkout },
    mandates: { loadActiveMandate: async () => activeMandate },
    verify: {
      verify: async () => ({
        decision: "ALLOW",
        reasons: [],
        authorization_id: "authorization_watch_purchase_001",
      }),
    },
    payments: {
      pay: async () => ({
        status: "APPROVED",
        authorization_id: "authorization_watch_purchase_001",
        payment_id: "payment_watch_purchase_001",
        provider_reference: "provider_watch_purchase_001",
        amount: checkout.terms.total,
        occurred_at: now.toISOString(),
      }),
    },
    receipts: {
      findByAuthorization: async () => ({
        ...orderReceiptFixture,
        receipt_id: "receipt_watch_purchase_001",
        checkout_id: checkout.terms.checkout_id,
        authorization_id: "authorization_watch_purchase_001",
        total: checkout.terms.total,
        fulfillment: checkout.terms.fulfillment,
      }),
    },
    proofFactory: { sign: async () => agentRequestProofFixture },
    clock: { now: () => now },
    catalog: { remember: () => undefined },
  });

  const result = await purchases.purchase({
    watch,
    offer,
    idempotency_key: "idem_watch_purchase_001",
    correlation_id: "corr_watch_purchase_001",
  });

  assert.deepEqual(result, { status: "COMPLETED", receipt_id: "receipt_watch_purchase_001" });
});
