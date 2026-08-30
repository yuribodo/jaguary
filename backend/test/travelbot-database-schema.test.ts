import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";

import { databaseSchema, mandates, travelConversations, travelWatches } from "../src/db/schema.js";

test("the database schema owns durable TravelBot turns, approvals, tools and SSE recovery", () => {
  assert.deepEqual(
    [
      "travelConversations",
      "travelMessages",
      "travelIntentSnapshots",
      "travelModelRuns",
      "travelToolExecutions",
      "travelApprovals",
      "travelSseEvents",
    ].filter((table) => !(table in databaseSchema)),
    [],
  );
});

test("platform agent and customer relationships are enforced independently", () => {
  for (const [table, prefix] of [
    [mandates, "mandates"],
    [travelConversations, "travel_conversations"],
    [travelWatches, "travel_watches"],
  ] as const) {
    const foreignKeyNames = getTableConfig(table).foreignKeys.map((foreignKey) => foreignKey.getName());
    assert.ok(foreignKeyNames.includes(`${prefix}_agent_fk`));
    assert.ok(foreignKeyNames.includes(`${prefix}_principal_fk`));
    assert.equal(foreignKeyNames.includes(`${prefix}_agent_principal_fk`), false);
  }
});
