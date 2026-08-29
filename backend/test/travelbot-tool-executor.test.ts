import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryTravelBotRepository,
  StateGuardedAgentToolExecutor,
} from "../src/modules/travelbot/index.js";

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
