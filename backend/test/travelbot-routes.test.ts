import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/build-app.js";
import { AuthCrypto } from "../src/modules/auth/crypto.js";
import { DemoPrincipalAuthProvider } from "../src/modules/auth/demo-provider.js";
import { InMemoryPrincipalAuthStore } from "../src/modules/auth/memory-repository.js";
import { PrincipalAuthService } from "../src/modules/auth/service.js";
import {
  emptyTravelIntent,
  InMemoryTravelBotRepository,
  TravelBotService,
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
