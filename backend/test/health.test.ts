import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/build-app.js";

test("GET /health reports that the API is ready", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "bound-api",
    timestamp: response.json<{ timestamp: string }>().timestamp,
  });
  assert.match(response.json<{ timestamp: string }>().timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
