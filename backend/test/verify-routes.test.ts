import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import {
  agentRequestProofFixture,
  authorizationDecisionSchema,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
} from "../src/contracts/v1/index.js";

test("POST /verify returns the BE-01 decision contract after a committed reservation", async (t) => {
  const app = await buildApp({
    logger: false,
    verifyOrchestrator: {
      verify: async () => ({
        decision: "ALLOW",
        reasons: [],
        authorization_id: "authorization_route_001",
        policy_version: "bound.verify.v1",
        evidence_hash: "a".repeat(64),
      }),
    },
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/verify",
    headers: {
      "idempotency-key": "idem_verify_route_001",
      "x-correlation-id": "corr_verify_route_001",
    },
    payload: {
      request_body: {
        authorization: normalizedAuthorizationFixture,
        checkout: normalizedCheckoutFixture,
      },
      proof: agentRequestProofFixture,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-correlation-id"], "corr_verify_route_001");
  assert.deepEqual(authorizationDecisionSchema.parse(response.json()), {
    decision: "ALLOW",
    reasons: [],
    authorization_id: "authorization_route_001",
    policy_version: "bound.verify.v1",
    evidence_hash: "a".repeat(64),
  });
});
