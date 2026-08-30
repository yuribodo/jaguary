import assert from "node:assert/strict";
import test from "node:test";

import Fastify from "fastify";

import { PublicApiError } from "../src/contracts/v1/index.js";
import { configureHttpConventions } from "../src/http/conventions.js";
import type { PrincipalAuthService } from "../src/modules/auth/index.js";
import { paymentCredentialRoutes } from "../src/modules/payments/credential-routes.js";
import { paymentMethodSummaryFromRow } from "../src/modules/payments/credentials.js";

test("payment method summaries never expose stored card-like display data", () => {
  const summary = paymentMethodSummaryFromRow({
    credentialId: "cred_owner_visa",
    display: "Visa 4111111111114242 provider-token-secret",
    createdAt: new Date("2026-08-29T12:00:00.000Z"),
    updatedAt: new Date("2026-08-30T12:00:00.000Z"),
  });

  assert.deepEqual(summary, {
    credential_id: "cred_owner_visa",
    network: "VISA",
    last_four: "4242",
    label: "Visa ending in 4242",
    created_at: "2026-08-29T12:00:00.000Z",
    updated_at: "2026-08-30T12:00:00.000Z",
  });
  assert.equal(JSON.stringify(summary).includes("4111111111114242"), false);
  assert.equal(JSON.stringify(summary).includes("provider-token-secret"), false);
});

test("payment method listing requires a session and is scoped to its principal", async (t) => {
  const app = Fastify({ logger: false });
  t.after(async () => app.close());
  configureHttpConventions(app);

  const credentials = {
    requestedPrincipalId: undefined as string | undefined,
    async listForPrincipal(principalId: string) {
      this.requestedPrincipalId = principalId;
      return [{
        credential_id: "cred_owner_visa",
        network: "VISA" as const,
        last_four: "4242",
        label: "Visa ending in 4242",
        created_at: "2026-08-29T12:00:00.000Z",
        updated_at: "2026-08-30T12:00:00.000Z",
      }];
    },
  };
  const auth = {
    async requireSession(token: string | undefined) {
      if (token !== "session-token") throw new PublicApiError(401, "invalid_request", "Authentication is required");
      return { principal: { principal_id: "principal_marta" } } as Awaited<ReturnType<PrincipalAuthService["requireSession"]>>;
    },
  };

  await app.register(paymentCredentialRoutes, { auth, credentials });

  const unauthenticated = await app.inject({ method: "GET", url: "/v1/payment-methods" });
  assert.equal(unauthenticated.statusCode, 401);

  const response = await app.inject({
    method: "GET",
    url: "/v1/payment-methods",
    headers: { cookie: "bound_session=session-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json()[0].label, "Visa ending in 4242");
  assert.equal(credentials.requestedPrincipalId, "principal_marta");
});
