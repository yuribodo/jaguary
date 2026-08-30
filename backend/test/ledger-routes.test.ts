import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { PublicApiError } from "../src/contracts/v1/index.js";
import { configureHttpConventions } from "../src/http/conventions.js";
import type { PrincipalAuthService } from "../src/modules/auth/index.js";
import { auditRoutes } from "../src/modules/ledger/routes.js";

test("receipt listing requires a session and scopes the query to its principal", async (t) => {
  const app = Fastify({ logger: false });
  t.after(async () => app.close());
  configureHttpConventions(app);

  let requestedPrincipalId: string | undefined;
  const auth = {
    async requireSession(token: string | undefined) {
      if (token !== "session-token") throw new PublicApiError(401, "invalid_request", "Authentication is required");
      return { principal: { principal_id: "principal_marta" } } as Awaited<ReturnType<PrincipalAuthService["requireSession"]>>;
    },
  };
  await app.register(auditRoutes, {
    auth,
    ledger: { async getTimeline() { return { correlation_id: "corr_test", events: [] }; } },
    receipts: {
      async getReceipt() { return {}; },
      async listReceipts(principalId: string) {
        requestedPrincipalId = principalId;
        return [{ receipt_id: "receipt_owner_001" }];
      },
    },
  });

  const unauthenticated = await app.inject({ method: "GET", url: "/receipts" });
  assert.equal(unauthenticated.statusCode, 401);

  const response = await app.inject({
    method: "GET",
    url: "/receipts",
    headers: { cookie: "bound_session=session-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [{ receipt_id: "receipt_owner_001" }]);
  assert.equal(requestedPrincipalId, "principal_marta");
});
