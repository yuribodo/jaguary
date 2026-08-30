import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryTravelBotRepository,
  StateGuardedAgentToolExecutor,
} from "../src/modules/travelbot/index.js";
import { offerCandidateFixture } from "../src/contracts/v1/index.js";

test("a tool unavailable in the persisted state is rejected before its handler", async () => {
  const repository = new InMemoryTravelBotRepository();
  let calls = 0;
  const conversation = await repository.create({
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    idempotency_key: "idem_tool_guard_create_001",
    correlation_id: "corr_tool_guard_create_001",
  }, new Date("2026-08-29T12:04:01.000Z"));
  const executor = new StateGuardedAgentToolExecutor(repository, {
    findOffers: async () => { calls += 1; return []; },
  }, { now: () => new Date("2026-08-29T12:04:01.000Z") });
  const result = await executor.execute({
    conversation_id: conversation.conversation_id,
    run_id: "00000000-0000-4000-8000-000000000002",
    tool_call_id: "call_injected_find_offers",
    tool_name: "find_offers",
    arguments: {},
  });
  assert.deepEqual(result, {
    status: "REJECTED",
    reference_id: null,
    reason_code: "tool_unavailable_in_state",
  });
  assert.equal(calls, 0);
});

test("a persisted offer selection is accepted as a proposal for application commit", async () => {
  const repository = new InMemoryTravelBotRepository();
  const now = new Date("2026-08-29T12:04:01.000Z");
  const conversation = await repository.create({
    principal_id: "principal_marta",
    agent_id: "agent_travelbot",
    idempotency_key: "idem_tool_proposal_create_001",
    correlation_id: "corr_tool_proposal_create_001",
  }, now);
  const claimed = await repository.claimTurn({
    conversation_id: conversation.conversation_id,
    content: "I want the available offer.",
    idempotency_key: "idem_tool_proposal_message_001",
    correlation_id: "corr_tool_proposal_message_001",
  }, now);
  assert.equal(claimed.kind, "CLAIMED");
  if (claimed.kind !== "CLAIMED") return;
  await repository.completeTurn(claimed.claim.run_id, {
    state: "AWAITING_OFFER_SELECTION",
    intent: {
      origin_iata: "GRU",
      destination_iata: "COR",
      departure_date: "2026-09-15",
      passenger_count: 1,
      cabin: "ECONOMY",
      max_total_budget: { amount: 15_000, currency: "USD" },
      selected_offer_id: null,
      confirmation: null,
    },
    offers: [offerCandidateFixture],
    assistant_message: "Select the offer.",
  }, now);
  const executor = new StateGuardedAgentToolExecutor(
    repository,
    { findOffers: async () => [] },
    { now: () => now },
  );

  const result = await executor.execute({
    conversation_id: conversation.conversation_id,
    run_id: "00000000-0000-4000-8000-000000000003",
    tool_call_id: "call_select_persisted_offer",
    tool_name: "create_checkout",
    arguments: { offer_id: offerCandidateFixture.offer_id },
  });

  assert.deepEqual(result, {
    status: "OK",
    reference_id: offerCandidateFixture.offer_id,
    reason_code: null,
  });
});
