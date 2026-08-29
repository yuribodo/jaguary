import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { apiErrorEnvelopeSchema, PublicApiError } from "../src/contracts/v1/index.js";

test("all responses expose a validated correlation ID", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const generated = await app.inject({ method: "GET", url: "/health" });
  assert.match(String(generated.headers["x-correlation-id"] ?? ""), /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

  const supplied = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-correlation-id": "corr_client_001" },
  });
  assert.equal(supplied.headers["x-correlation-id"], "corr_client_001");

  const invalid = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-correlation-id": "invalid correlation\nvalue" },
  });
  assert.notEqual(invalid.headers["x-correlation-id"], "invalid correlation\nvalue");
});

test("public errors use the stable envelope without stack traces", async (t) => {
  const app = await buildApp({ logger: false });
  app.get("/test/public-error", async () => {
    throw new PublicApiError(
      422,
      "amount_limit_exceeded",
      "Checkout amount exceeds the mandate limit",
    );
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/test/public-error",
    headers: { "x-correlation-id": "corr_error_001" },
  });
  assert.equal(response.statusCode, 422);
  assert.deepEqual(response.json(), {
    error: {
      code: "amount_limit_exceeded",
      message: "Checkout amount exceeds the mandate limit",
      details: {},
    },
    correlation_id: "corr_error_001",
  });
  assert.equal(response.headers["x-correlation-id"], "corr_error_001");
  assert.doesNotThrow(() => apiErrorEnvelopeSchema.parse(response.json()));
  assert.equal("stack" in response.json(), false);

  const missing = await app.inject({ method: "GET", url: "/missing" });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error.code, "not_found");
  assert.equal(missing.json().correlation_id, missing.headers["x-correlation-id"]);
});

test("mutable requests require a valid Idempotency-Key", async (t) => {
  const app = await buildApp({ logger: false });
  app.post("/test/mutable", async () => ({ ok: true }));
  t.after(async () => app.close());

  const missing = await app.inject({ method: "POST", url: "/test/mutable" });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error.code, "missing_idempotency_key");
  assert.equal(missing.json().correlation_id, missing.headers["x-correlation-id"]);

  const invalid = await app.inject({
    method: "POST",
    url: "/test/mutable",
    headers: { "idempotency-key": "short" },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, "invalid_idempotency_key");

  const valid = await app.inject({
    method: "POST",
    url: "/test/mutable",
    headers: { "idempotency-key": "idem_purchase_001" },
  });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.json(), { ok: true });
});
