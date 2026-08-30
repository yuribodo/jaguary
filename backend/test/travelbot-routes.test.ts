import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/build-app.js";
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
