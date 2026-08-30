import assert from "node:assert/strict";
import test from "node:test";

import OpenAI from "openai";

import {
  OpenAIAgentsRuntime,
  emptyTravelIntent,
  type AgentRuntimeRequest,
} from "../src/modules/travelbot/index.js";

const output = {
  proposal: {
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
  },
  assistant_message: "I will search for offers.",
};

function responseBody() {
  return {
    id: "resp_contract_001",
    object: "response",
    created_at: 1_788_043_441,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: "gpt-test-contract",
    output: [{
      id: "msg_contract_001",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }],
    }],
    parallel_tool_calls: false,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: 1,
    text: { format: { type: "json_schema" } },
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    truncation: "disabled",
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 18,
    },
  };
}

test("the Agents SDK request disables provider storage and parallel tool calls", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const client = new OpenAI({
    apiKey: "sk-test-never-log-this-value",
    maxRetries: 0,
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify(responseBody()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const runtime = new OpenAIAgentsRuntime({
    model: "gpt-test-contract",
    openAIClient: client,
  });
  const request: AgentRuntimeRequest = {
    conversation_id: "00000000-0000-4000-8000-000000000001",
    run_id: "00000000-0000-4000-8000-000000000002",
    model: "gpt-test-contract",
    state: "READY_TO_SEARCH",
    intent: emptyTravelIntent(),
    user_message: "GRU to COR",
    available_tools: ["find_offers"],
  };

  const contextualRequest = {
    ...request,
    conversation_history: [
      {
        role: "USER" as const,
        content: "I want to buy a ticket to Rondônia for no more than three thousand reais.",
      },
      {
        role: "ASSISTANT" as const,
        content: "Which city or airport do you prefer at the destination?",
      },
    ],
  };

  const result = await runtime.run(contextualRequest);

  assert.equal(result.proposal.origin_iata, "GRU");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.store, false);
  assert.equal(requests[0]?.parallel_tool_calls, false);
  assert.match(
    JSON.stringify(requests[0]?.input),
    /Rondônia/,
    "the model must receive recent sanitized conversation context",
  );
  assert.match(
    JSON.stringify(requests[0]?.input),
    /Córdoba.*COR/,
    "the model must receive grounded aliases for supported airports",
  );
  assert.match(
    String(requests[0]?.instructions),
    /USD 150 = 15000/,
    "the model contract must express budgets in currency minor units",
  );
  const tools = requests[0]?.tools as Array<Record<string, unknown>>;
  assert.deepEqual(tools.map(({ name }) => name), ["find_offers"]);
  assert.equal(tools[0]?.strict, true);
  assert.equal((tools[0]?.parameters as Record<string, unknown>).additionalProperties, false);

  await runtime.prepareApproval({
    ...request,
    state: "READY_TO_PURCHASE",
    available_tools: ["request_purchase"],
  });
  assert.equal(requests.length, 2);
  assert.match(
    JSON.stringify(requests[1]?.input),
    /PREPARE_PURCHASE_APPROVAL/,
    "approval preparation must be a trusted backend directive, not untrusted user text",
  );
});
