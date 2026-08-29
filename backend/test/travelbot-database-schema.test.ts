import assert from "node:assert/strict";
import test from "node:test";

import { databaseSchema } from "../src/db/schema.js";

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
