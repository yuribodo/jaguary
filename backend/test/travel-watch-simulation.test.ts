import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/build-app.js";
import { mandateSchema, type CreateMandateDraftInput } from "../src/contracts/v1/index.js";
import {
  DevelopmentTravelWatchSimulator,
  InMemoryTravelWatchRepository,
  TravelWatchService,
  TravelWatchWorker,
  type TravelBotConversation,
} from "../src/modules/travelbot/index.js";
import { VuelaYaCatalog } from "../src/modules/vuelaya/index.js";

const now = new Date("2026-08-30T12:00:00.000Z");

test("development simulator makes an eligible fare appear and lets the normal worker complete the watch", async () => {
  const repository = new InMemoryTravelWatchRepository();
  const catalog = new VuelaYaCatalog({
    search: async () => assert.fail("the queued simulation must replace the external flight provider"),
  }, []);
  const conversation: TravelBotConversation = {
    conversation_id: "9a25a9cb-c58a-427b-8b7e-d9411f6effb0",
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    state: "READY_TO_SEARCH",
    version: 1,
    intent: {
      origin_iata: "GRU",
      destination_iata: "COR",
      departure_date: "2026-09-15",
      passenger_count: 1,
      cabin: "ECONOMY",
      max_total_budget: { amount: 10_000, currency: "USD" },
      selected_offer_id: null,
      confirmation: null,
    },
    offers: [],
    messages: [],
    active_run_id: null,
    operation: {
      checkout_id: null,
      checkout_hash: null,
      mandate_id: null,
      authorization_id: null,
      receipt_id: null,
      pending_approval: null,
    },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  let draft!: ReturnType<typeof mandateSchema.parse>;
  const service = new TravelWatchService({
    repository,
    conversations: { get: async () => structuredClone(conversation) },
    mandates: {
      async createDraft(input: CreateMandateDraftInput) {
        draft = mandateSchema.parse({
          terms: { ...input, version: 1 },
          payment_credential: { credential_id: input.credential_id, display: "Visa •••• 4242" },
          status: "DRAFT",
          authority_valid: false,
          created_at: now.toISOString(),
        });
        return { mandate: draft };
      },
      async activate() {
        return mandateSchema.parse({
          ...draft,
          status: "ACTIVE",
          authority_valid: true,
          terms_hash: "a".repeat(64),
          principal_signature: {
            algorithm: "ES256",
            key_id: "key_demo_bound_2026",
            value: "ZGVtb19zaWduYXR1cmVfbm90X2Zvcl9wcm9kdWN0aW9u",
          },
          activated_at: now.toISOString(),
        });
      },
    },
    clock: { now: () => now },
    credentialId: "cred_demo_marta_visa",
    merchantId: "merchant_vuelaya",
  });
  const simulator = new DevelopmentTravelWatchSimulator({
    repository,
    catalog,
    clock: { now: () => now },
    merchantId: "merchant_vuelaya",
    merchantUrl: "https://demo.vuelaya.example",
  });
  const app = await buildApp({
    travelWatchService: service,
    travelWatchSimulator: simulator,
    logger: false,
  });

  const created = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversation.conversation_id}/watches`,
    headers: { "idempotency-key": "idem_watch_sim_create_001" },
    payload: { mode: "AUTO_PURCHASE", expires_at: "2026-09-15T23:59:59.999Z" },
  });
  const watchId = created.json().watch_id as string;
  await app.inject({
    method: "POST",
    url: `/v1/travel-watches/${watchId}/activate`,
    headers: { "idempotency-key": "idem_watch_sim_activate_001" },
    payload: {},
  });

  const simulated = await app.inject({
    method: "POST",
    url: `/v1/dev/travel-watches/${watchId}/simulate-match`,
    headers: { "idempotency-key": "idem_watch_sim_match_001" },
    payload: {},
  });
  assert.equal(simulated.statusCode, 200);
  assert.equal(simulated.json().status, "ACTIVE");
  assert.equal(simulated.json().next_check_at, now.toISOString());
  assert.equal(simulated.json().receipt_id, null);

  const worker = new TravelWatchWorker({
    repository,
    search: {
      search: (criteria, watchId) => catalog.search({
        ...criteria,
        selected_offer_id: null,
        confirmation: null,
      }, watchId),
    },
    purchases: {
      purchase: async () => ({ status: "COMPLETED", receipt_id: "receipt_simulated_watch_001" }),
    },
    clock: { now: () => now },
  });
  assert.equal(await worker.runDue(), 1);

  const completed = await app.inject({ method: "GET", url: `/v1/travel-watches/${watchId}` });
  assert.equal(completed.json().status, "COMPLETED");
  assert.equal(completed.json().receipt_id, "receipt_simulated_watch_001");
  assert.equal(completed.json().matched_offer.total.amount, 9_000);
  assert.equal(completed.json().matched_offer.total.currency, "USD");
  await app.close();
});

test("simulation route is absent when the development simulator is not installed", async () => {
  const app = await buildApp({ logger: false });
  const response = await app.inject({
    method: "POST",
    url: "/v1/dev/travel-watches/9a25a9cb-c58a-427b-8b7e-d9411f6effb0/simulate-match",
    headers: { "idempotency-key": "idem_watch_sim_absent_001" },
    payload: {},
  });
  assert.equal(response.statusCode, 404);
  await app.close();
});
