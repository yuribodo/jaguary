import assert from "node:assert/strict";
import test from "node:test";

import {
  mandateSchema,
  offerCandidateFixture,
  offerCandidateSchema,
  type CreateMandateDraftInput,
} from "../src/contracts/v1/index.js";
import {
  InMemoryTravelWatchRepository,
  TravelWatchService,
  TravelWatchWorker,
  type TravelBotConversation,
  type TravelWatch,
} from "../src/modules/travelbot/index.js";

const now = new Date("2026-08-30T12:00:00.000Z");

const conversation: TravelBotConversation = {
  conversation_id: "5a89de04-4b45-4dc4-a0c4-ed12ceaa9bea",
  principal_id: "principal_marta",
  agent_id: "agent_travelbot",
  state: "READY_TO_SEARCH",
  version: 1,
  intent: {
    origin_iata: "GRU",
    destination_iata: "COR",
    departure_date: "2026-09",
    passenger_count: 2,
    cabin: "ECONOMY",
    max_total_budget: { amount: 150_000, currency: "BRL" },
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

test("an automatic watch waits for liveness over its conditional mandate before monitoring", async () => {
  const repository = new InMemoryTravelWatchRepository();
  const service = new TravelWatchService({
    repository,
    conversations: { get: async () => structuredClone(conversation) },
    mandates: {
      async createDraft(input: CreateMandateDraftInput) {
        return {
          mandate: mandateSchema.parse({
            terms: { ...input, version: 1 },
            payment_credential: { credential_id: input.credential_id, display: "Visa •••• 4242" },
            status: "DRAFT",
            authority_valid: false,
            created_at: now.toISOString(),
          }),
        };
      },
      async activate() {
        assert.fail("liveness must happen before watch activation");
      },
    },
    clock: { now: () => now },
    credentialId: "cred_demo_marta_visa",
    merchantId: "merchant_vuelaya",
  });

  const created = await service.create({
    conversation_id: conversation.conversation_id,
    mode: "AUTO_PURCHASE",
    expires_at: "2026-09-30T23:59:59.999Z",
    idempotency_key: "idem_watch_create_001",
    correlation_id: "corr_watch_create_001",
  });

  assert.equal(created.status, "AWAITING_LIVENESS");
  assert.equal(created.next_check_at, null);
  assert.equal(created.mandate_id.startsWith("mandate_watch_"), true);
  assert.deepEqual(created.criteria, {
    origin_iata: "GRU",
    destination_iata: "COR",
    departure_date: "2026-09",
    passenger_count: 2,
    cabin: "ECONOMY",
    max_total_budget: { amount: 150_000, currency: "BRL" },
  });
  assert.deepEqual(created.authority.flight_constraints, {
    departure_not_before: "2026-09-01T00:00:00.000Z",
    departure_not_after: "2026-09-30T23:59:59.999Z",
    passenger_count: 2,
  });
  assert.deepEqual(await service.get(created.watch_id), created);
});

test("a due automatic watch buys one matching offer and completes with its receipt", async () => {
  const repository = new InMemoryTravelWatchRepository();
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
  const created = await service.create({
    conversation_id: conversation.conversation_id,
    mode: "AUTO_PURCHASE",
    expires_at: "2026-09-30T23:59:59.999Z",
    idempotency_key: "idem_watch_create_003",
    correlation_id: "corr_watch_create_003",
  });
  await service.activate({
    watch_id: created.watch_id,
    idempotency_key: "idem_watch_activate_003",
    correlation_id: "corr_watch_activate_003",
  });
  const matchingOffer = offerCandidateSchema.parse({
    ...offerCandidateFixture,
    offer_id: "offer_watch_match_001",
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
  });
  const worker = new TravelWatchWorker({
    repository,
    search: {
      async search() {
        return {
          outcome: "MATCH_FOUND",
          matches: [matchingOffer],
          nearest_miss: null,
          observed_at: now.toISOString(),
        };
      },
    },
    purchases: {
      async purchase({ watch, offer }) {
        assert.equal(watch.matched_offer_id, matchingOffer.offer_id);
        assert.deepEqual(watch.matched_offer, matchingOffer);
        assert.equal(offer.offer_id, matchingOffer.offer_id);
        return { status: "COMPLETED", receipt_id: "receipt_watch_001" };
      },
    },
    clock: { now: () => now },
  });

  assert.equal(await worker.runDue(), 1);
  const completed = await service.get(created.watch_id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.attempt_count, 1);
  assert.equal(completed.matched_offer_id, matchingOffer.offer_id);
  assert.equal(completed.receipt_id, "receipt_watch_001");
  assert.equal(completed.next_check_at, null);
  assert.equal(await worker.runDue(), 0);
});

test("an over-budget check keeps the watch active and schedules another attempt", async () => {
  const repository = new InMemoryTravelWatchRepository();
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
          principal_signature: { algorithm: "ES256", key_id: "key_demo_bound_2026", value: "ZGVtb19zaWduYXR1cmVfbm90X2Zvcl9wcm9kdWN0aW9u" },
          activated_at: now.toISOString(),
        });
      },
    },
    clock: { now: () => now },
    credentialId: "cred_demo_marta_visa",
    merchantId: "merchant_vuelaya",
  });
  const created = await service.create({
    conversation_id: conversation.conversation_id,
    mode: "AUTO_PURCHASE",
    expires_at: "2026-09-30T23:59:59.999Z",
    idempotency_key: "idem_watch_create_004",
    correlation_id: "corr_watch_create_004",
  });
  await service.activate({
    watch_id: created.watch_id,
    idempotency_key: "idem_watch_activate_004",
    correlation_id: "corr_watch_activate_004",
  });
  const nearest = offerCandidateSchema.parse({
    ...offerCandidateFixture,
    offer_id: "offer_watch_nearest_001",
    total: { amount: 80_000, currency: "BRL" },
    items: [{
      ...offerCandidateFixture.items[0]!,
      unit_price: { amount: 80_000, currency: "BRL" },
      total: { amount: 80_000, currency: "BRL" },
    }],
  });
  const worker = new TravelWatchWorker({
    repository,
    search: { search: async () => ({ outcome: "OVER_BUDGET", matches: [], nearest_miss: nearest, observed_at: now.toISOString() }) },
    purchases: { purchase: async () => assert.fail("an over-budget offer cannot be purchased") },
    clock: { now: () => now },
  });

  assert.equal(await worker.runDue(), 1);
  const waiting = await service.get(created.watch_id);
  assert.equal(waiting.status, "ACTIVE");
  assert.equal(waiting.attempt_count, 1);
  assert.equal(waiting.last_outcome, "OVER_BUDGET");
  assert.deepEqual(waiting.nearest_miss, {
    offer_id: nearest.offer_id,
    unit_total: { amount: 80_000, currency: "BRL" },
    party_total: { amount: 160_000, currency: "BRL" },
  });
  assert.equal(waiting.next_check_at, "2026-08-30T14:00:00.000Z");
  assert.equal(await worker.runDue(), 0);
});

test("a temporary provider failure backs off without abandoning the watch", async () => {
  const repository = new InMemoryTravelWatchRepository();
  const active: TravelWatch = {
    watch_id: "9d08c008-2a15-42fe-82bc-e60f99533c89",
    conversation_id: conversation.conversation_id,
    principal_id: conversation.principal_id,
    agent_id: conversation.agent_id,
    mode: "AUTO_PURCHASE",
    status: "ACTIVE",
    criteria: {
      origin_iata: "GRU", destination_iata: "COR", departure_date: "2026-09",
      passenger_count: 2, cabin: "ECONOMY", max_total_budget: { amount: 150_000, currency: "BRL" },
    },
    criteria_hash: "c".repeat(64),
    mandate_id: "mandate_watch_failure_001",
    authority: {
      max_per_purchase: { amount: 150_000, currency: "BRL" }, max_uses: 1,
      expires_at: "2026-09-30T23:59:59.999Z",
      flight_constraints: { departure_not_before: "2026-09-01T00:00:00.000Z", departure_not_after: "2026-09-30T23:59:59.999Z", passenger_count: 2 },
    },
    next_check_at: now.toISOString(), last_checked_at: null, expires_at: "2026-09-30T23:59:59.999Z",
    attempt_count: 0, consecutive_failures: 0, last_outcome: null, nearest_miss: null,
    matched_offer_id: null, receipt_id: null, version: 1, created_at: now.toISOString(), updated_at: now.toISOString(),
    matched_offer: null,
  };
  await repository.create(active, "idem_watch_failure_seed_001", "d".repeat(64));
  const worker = new TravelWatchWorker({
    repository,
    search: { search: async () => { throw new Error("provider timeout"); } },
    purchases: { purchase: async () => assert.fail("purchase cannot run after provider failure") },
    clock: { now: () => now },
  });

  assert.equal(await worker.runDue(), 1);
  const waiting = await repository.get(active.watch_id);
  assert.equal(waiting?.status, "ACTIVE");
  assert.equal(waiting?.attempt_count, 1);
  assert.equal(waiting?.consecutive_failures, 1);
  assert.equal(waiting?.next_check_at, "2026-08-30T12:05:00.000Z");
});

test("verified liveness activates the conditional mandate and schedules the first check", async () => {
  const repository = new InMemoryTravelWatchRepository();
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
        assert.equal(draft.status, "DRAFT");
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
  const created = await service.create({
    conversation_id: conversation.conversation_id,
    mode: "AUTO_PURCHASE",
    expires_at: "2026-09-30T23:59:59.999Z",
    idempotency_key: "idem_watch_create_002",
    correlation_id: "corr_watch_create_002",
  });

  const active = await service.activate({
    watch_id: created.watch_id,
    idempotency_key: "idem_watch_activate_002",
    correlation_id: "corr_watch_activate_002",
  });

  assert.equal(active.status, "ACTIVE");
  assert.equal(active.next_check_at, now.toISOString());
  assert.equal(active.version, 2);
  assert.deepEqual(await service.get(active.watch_id), active);
});
