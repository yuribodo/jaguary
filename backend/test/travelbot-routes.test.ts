import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/build-app.js";
import { mandateSchema, type CreateMandateDraftInput } from "../src/contracts/v1/index.js";
import { AuthCrypto } from "../src/modules/auth/crypto.js";
import { DemoPrincipalAuthProvider } from "../src/modules/auth/demo-provider.js";
import { InMemoryPrincipalAuthStore } from "../src/modules/auth/memory-repository.js";
import { PrincipalAuthService } from "../src/modules/auth/service.js";
import {
  emptyTravelIntent,
  InMemoryTravelBotRepository,
  InMemoryTravelWatchRepository,
  TravelBotService,
  TravelWatchService,
  type TravelBotConversation,
} from "../src/modules/travelbot/index.js";

function fixtureService() {
  return new TravelBotService({
    repository: new InMemoryTravelBotRepository(),
    runtime: {
      async run() {
        return {
          proposal: {
            ...emptyTravelIntent(),
            explicit_confirmation: null,
            ambiguities: [],
            requested_action: "NONE" as const,
          },
          assistant_message: "Certo.",
        };
      },
    },
    tools: { findOffers: async () => [] },
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    model: "fake-test-model",
  });
}

function fixtureAuthService() {
  const crypto = new AuthCrypto("travelbot-discard-test-secret");
  const store = new InMemoryPrincipalAuthStore(crypto);
  return new PrincipalAuthService({
    mode: "demo",
    providers: {},
    authRepository: store,
    sessions: store,
    crypto,
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    callbackUrl: "http://localhost:3001/auth/v1/login/google/callback",
    sessionTtlSeconds: 28_800,
    loginTransactionTtlSeconds: 600,
    demoProvider: new DemoPrincipalAuthProvider("development", "demo"),
  });
}

test("TravelBot v1 routes create, read and append a durable conversation", async () => {
  const app = await buildApp({ travelBotService: fixtureService(), logger: false });
  const headers = {
    "idempotency-key": "idem_route_create_001",
    "x-correlation-id": "corr_route_create_001",
  };
  const created = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers,
    payload: { principal_id: "principal_marta", agent_id: "agent_travelbot" },
  });
  assert.equal(created.statusCode, 201);
  const conversation = created.json();
  assert.equal(conversation.state, "COLLECTING");

  const message = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversation.conversation_id}/messages`,
    headers: {
      "idempotency-key": "idem_route_message_001",
      "x-correlation-id": "corr_route_message_001",
    },
    payload: { content: "I want to travel." },
  });
  assert.equal(message.statusCode, 200);
  assert.equal(message.json().messages.length, 2);

  const read = await app.inject({ method: "GET", url: `/v1/conversations/${conversation.conversation_id}` });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.json(), message.json());
  await app.close();
});

test("TravelBot SSE uses persisted event sequence IDs and supports Last-Event-ID recovery", async () => {
  const service = fixtureService();
  const created = await service.createConversation({
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    idempotency_key: "idem_sse_create_001",
    correlation_id: "corr_sse_create_001",
  });
  const app = await buildApp({
    travelBotService: service,
    travelBotEvents: {
      async listSseEvents(_conversationId, afterSequence) {
        return [1, 2, 3].filter((sequence) => sequence > (afterSequence ?? 0)).map((sequence) => ({
          sequence,
          event_type: sequence === 3 ? "turn.completed" : "state.snapshot",
          payload: { sequence },
        }));
      },
    },
    logger: false,
  });
  const response = await app.inject({
    method: "POST",
    url: `/v1/conversations/${created.conversation_id}/messages`,
    headers: {
      accept: "text/event-stream",
      "last-event-id": "1",
      "idempotency-key": "idem_sse_message_001",
      "x-correlation-id": "corr_sse_message_001",
    },
    payload: { content: "I want to travel." },
  });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"] ?? ""), /^text\/event-stream/);
  assert.equal(response.body.includes("id: 1\n"), false);
  assert.match(response.body, /id: 2\nevent: state\.snapshot/);
  assert.match(response.body, /id: 3\nevent: turn\.completed/);
  await app.close();
});

test("discarding a conversation requires the owning principal session, CSRF and allowed origin", async () => {
  const auth = fixtureAuthService();
  const app = await buildApp({
    travelBotService: fixtureService(),
    auth: {
      service: auth,
      mode: "demo",
      allowedOrigin: "http://localhost:3000",
      secureCookies: false,
      sessionTtlSeconds: 28_800,
    },
    logger: false,
  });
  const created = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: {
      "idempotency-key": "idem_discard_create_001",
      "x-correlation-id": "corr_discard_create_001",
    },
    payload: { principal_id: "principal_marta", agent_id: "agent_travelbot" },
  });
  const conversationId = created.json().conversation_id as string;
  const commonHeaders = {
    origin: "http://localhost:3000",
    "idempotency-key": "idem_discard_delete_001",
    "x-correlation-id": "corr_discard_delete_001",
  };

  const preflight = await app.inject({
    method: "OPTIONS",
    url: `/v1/conversations/${conversationId}`,
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "DELETE",
      "access-control-request-headers": "x-csrf-token,idempotency-key,x-correlation-id",
    },
  });
  assert.equal(preflight.statusCode, 204);
  assert.match(String(preflight.headers["access-control-allow-methods"]), /\bDELETE\b/);

  const unauthenticated = await app.inject({
    method: "DELETE",
    url: `/v1/conversations/${conversationId}`,
    headers: commonHeaders,
  });
  assert.equal(unauthenticated.statusCode, 401);

  const issued = await auth.createDemoSession();
  const cookie = `bound_session=${encodeURIComponent(issued.token)}`;
  const crossOrigin = await app.inject({
    method: "DELETE",
    url: `/v1/conversations/${conversationId}`,
    headers: {
      ...commonHeaders,
      origin: "https://attacker.example",
      cookie,
      "x-csrf-token": issued.csrfToken,
    },
  });
  assert.equal(crossOrigin.statusCode, 403);

  const discarded = await app.inject({
    method: "DELETE",
    url: `/v1/conversations/${conversationId}`,
    headers: { ...commonHeaders, cookie, "x-csrf-token": issued.csrfToken },
  });
  assert.equal(discarded.statusCode, 204);
  const read = await app.inject({ method: "GET", url: `/v1/conversations/${conversationId}` });
  assert.equal(read.statusCode, 404);
  await app.close();
});

test("voice sessions are short-lived, authenticated and bound to the conversation owner", async () => {
  const auth = fixtureAuthService();
  const issuedFor: string[] = [];
  const app = await buildApp({
    travelBotService: fixtureService(),
    voiceSessionIssuer: {
      async createClientSecret(principalId) {
        issuedFor.push(principalId);
        return { value: "ek_test_ephemeral_only", expires_at: 1_788_072_900 };
      },
    },
    auth: {
      service: auth,
      mode: "demo",
      allowedOrigin: "http://localhost:3000",
      secureCookies: false,
      sessionTtlSeconds: 28_800,
    },
    logger: false,
  });
  const created = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: {
      "idempotency-key": "idem_voice_create_001",
      "x-correlation-id": "corr_voice_create_001",
    },
    payload: { principal_id: "principal_marta", agent_id: "agent_travelbot" },
  });
  const conversationId = created.json().conversation_id as string;
  const session = await auth.createDemoSession();
  const cookie = `bound_session=${encodeURIComponent(session.token)}`;
  const commonHeaders = {
    origin: "http://localhost:3000",
    cookie,
    "x-csrf-token": session.csrfToken,
    "idempotency-key": "idem_voice_session_001",
    "x-correlation-id": "corr_voice_session_001",
  };

  const unauthenticated = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/voice-sessions`,
    headers: {
      origin: commonHeaders.origin,
      "idempotency-key": commonHeaders["idempotency-key"],
      "x-correlation-id": commonHeaders["x-correlation-id"],
    },
  });
  assert.equal(unauthenticated.statusCode, 401);

  const crossOrigin = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/voice-sessions`,
    headers: { ...commonHeaders, origin: "https://attacker.example" },
  });
  assert.equal(crossOrigin.statusCode, 403);

  const response = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/voice-sessions`,
    headers: commonHeaders,
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(response.json(), { value: "ek_test_ephemeral_only", expires_at: 1_788_072_900 });
  assert.deepEqual(issuedFor, ["principal_marta"]);

  const other = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: {
      "idempotency-key": "idem_voice_create_other",
      "x-correlation-id": "corr_voice_create_other",
    },
    payload: { principal_id: "principal_other", agent_id: "agent_travelbot" },
  });
  const refused = await app.inject({
    method: "POST",
    url: `/v1/conversations/${other.json().conversation_id as string}/voice-sessions`,
    headers: { ...commonHeaders, "idempotency-key": "idem_voice_session_other" },
  });
  assert.equal(refused.statusCode, 404);
  assert.deepEqual(issuedFor, ["principal_marta"]);
  await app.close();
});

test("travel watch routes create authority first and activate monitoring only after liveness", async () => {
  const now = new Date("2026-08-30T12:00:00.000Z");
  const conversation: TravelBotConversation = {
    conversation_id: "5a89de04-4b45-4dc4-a0c4-ed12ceaa9bea",
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    state: "READY_TO_SEARCH",
    version: 1,
    intent: {
      origin_iata: "GRU", destination_iata: "COR", departure_date: "2026-09",
      passenger_count: 1, cabin: "ECONOMY", max_total_budget: { amount: 150_000, currency: "BRL" },
      selected_offer_id: null, confirmation: null,
    },
    offers: [], messages: [], active_run_id: null,
    operation: { checkout_id: null, checkout_hash: null, mandate_id: null, authorization_id: null, receipt_id: null, pending_approval: null },
    created_at: now.toISOString(), updated_at: now.toISOString(),
  };
  let draft!: ReturnType<typeof mandateSchema.parse>;
  const service = new TravelWatchService({
    repository: new InMemoryTravelWatchRepository(),
    conversations: { get: async () => structuredClone(conversation) },
    mandates: {
      async createDraft(input: CreateMandateDraftInput) {
        draft = mandateSchema.parse({
          terms: { ...input, version: 1 },
          payment_credential: { credential_id: input.credential_id, display: "Visa •••• 4242" },
          status: "DRAFT", authority_valid: false, created_at: now.toISOString(),
        });
        return { mandate: draft };
      },
      async activate() {
        return mandateSchema.parse({
          ...draft, status: "ACTIVE", authority_valid: true, terms_hash: "a".repeat(64),
          principal_signature: { algorithm: "ES256", key_id: "key_demo_bound_2026", value: "ZGVtb19zaWduYXR1cmVfbm90X2Zvcl9wcm9kdWN0aW9u" },
          activated_at: now.toISOString(),
        });
      },
      async revoke() {
        const active = mandateSchema.parse({
          ...draft, status: "ACTIVE", authority_valid: true, terms_hash: "a".repeat(64),
          principal_signature: { algorithm: "ES256", key_id: "key_demo_bound_2026", value: "ZGVtb19zaWduYXR1cmVfbm90X2Zvcl9wcm9kdWN0aW9u" },
          activated_at: now.toISOString(),
        });
        return mandateSchema.parse({ ...active, status: "REVOKED", authority_valid: false, revoked_at: now.toISOString() });
      },
    },
    clock: { now: () => now },
    credentialId: "cred_demo_marta_visa",
    merchantId: "merchant_vuelaya",
  });
  const app = await buildApp({ travelWatchService: service, logger: false });

  const created = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversation.conversation_id}/watches`,
    headers: { "idempotency-key": "idem_watch_route_create_001", "x-correlation-id": "corr_watch_route_create_001" },
    payload: { mode: "AUTO_PURCHASE", expires_at: "2026-09-30T23:59:59.999Z" },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().status, "AWAITING_LIVENESS");

  const activated = await app.inject({
    method: "POST",
    url: `/v1/travel-watches/${created.json().watch_id}/activate`,
    headers: { "idempotency-key": "idem_watch_route_activate_001", "x-correlation-id": "corr_watch_route_activate_001" },
    payload: {},
  });
  assert.equal(activated.statusCode, 200);
  assert.equal(activated.json().status, "ACTIVE");
  const read = await app.inject({ method: "GET", url: `/v1/travel-watches/${created.json().watch_id}` });
  assert.deepEqual(read.json(), activated.json());
  const discovered = await app.inject({
    method: "GET",
    url: `/v1/conversations/${conversation.conversation_id}/watch`,
  });
  assert.equal(discovered.statusCode, 200);
  assert.deepEqual(discovered.json(), activated.json());
  const cancelled = await app.inject({
    method: "POST",
    url: `/v1/travel-watches/${created.json().watch_id}/cancel`,
    headers: { "idempotency-key": "idem_watch_route_cancel_001", "x-correlation-id": "corr_watch_route_cancel_001" },
    payload: {},
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().status, "CANCELLED");
  assert.equal(cancelled.json().next_check_at, null);
  await app.close();
});
