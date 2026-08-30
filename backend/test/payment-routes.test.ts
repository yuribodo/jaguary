import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";

import { buildApp } from "../src/build-app.js";
import {
  approvedPaymentFixture,
  authorizedPaymentFixture,
  paymentResultSchema,
  type PaymentExecutor,
  type PaymentResult,
} from "../src/contracts/v1/index.js";
import {
  FakePaymentExecutor,
  PaymentService,
  type PaymentClaimStore,
} from "../src/modules/payments/index.js";

const providerIdempotencyKey = "123e4567-e89b-42d3-a456-426614174000";

test("POST /authorizations/:id/pay executes an injected payment executor", async (t) => {
  const executor = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: approvedPaymentFixture.occurred_at,
  });
  let persistedResult: PaymentResult | undefined;
  const store: PaymentClaimStore = {
    claim: async () => ({
      kind: "CLAIMED",
      payment_attempt_id: "payment_attempt_route_001",
      idempotency_key: providerIdempotencyKey,
      payment: authorizedPaymentFixture,
    }),
    persistResult: async (_paymentAttemptId, result) => {
      persistedResult = result;
      return result;
    },
  };
  const app = await buildApp({
    logger: false,
    paymentService: new PaymentService(store, executor),
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/authorizations/${authorizedPaymentFixture.authorization.authorization_id}/pay`,
    headers: {
      "idempotency-key": "idem_payment_route_001",
      "x-correlation-id": authorizedPaymentFixture.correlation_id,
    },
    payload: {},
  });

  const expected = {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: approvedPaymentFixture.occurred_at,
    status: "APPROVED" as const,
    payment_id: "payment_authorization_authorization_vy_471_001",
    provider_reference: "fake_ref_authorization_vy_471_001",
  };
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-correlation-id"], authorizedPaymentFixture.correlation_id);
  assert.deepEqual(paymentResultSchema.parse(response.json()), expected);
  assert.deepEqual(persistedResult, expected);
  assert.deepEqual(executor.calls, [{
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    idempotency_key: providerIdempotencyKey,
  }]);
});

test("payment route accepts no caller-authored payment authority", async (t) => {
  const executor = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: approvedPaymentFixture.occurred_at,
  });
  const store: PaymentClaimStore = {
    claim: async () => assert.fail("invalid bodies must not reach the payment store"),
    persistResult: async () => assert.fail("invalid bodies must not persist a payment"),
  };
  const app = await buildApp({
    logger: false,
    paymentService: new PaymentService(store, executor),
  });
  t.after(async () => app.close());

  const secret = "reusable-sensitive-value";
  const response = await app.inject({
    method: "POST",
    url: `/authorizations/${authorizedPaymentFixture.authorization.authorization_id}/pay`,
    headers: { "idempotency-key": "idem_payment_route_bad_001" },
    payload: {
      amount: { amount: 1, currency: "BRL" },
      merchant_id: "merchant_attacker",
      credential_token: secret,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
  assert.equal(response.body.includes(secret), false);
  assert.equal(executor.callCount, 0);
});

test("an invalid persisted provider idempotency key fails before executor I/O", async () => {
  const executor = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: approvedPaymentFixture.occurred_at,
  });
  const service = new PaymentService({
    claim: async () => ({
      kind: "CLAIMED",
      payment_attempt_id: "payment_attempt_invalid_provider_key",
      idempotency_key: authorizedPaymentFixture.authorization.authorization_id,
      payment: authorizedPaymentFixture,
    }),
    persistResult: async () => assert.fail("an invalid provider key must not persist a result"),
  }, executor);

  await assert.rejects(
    service.pay(
      authorizedPaymentFixture.authorization.authorization_id,
      authorizedPaymentFixture.correlation_id,
    ),
  );
  assert.equal(executor.callCount, 0);
});

test("a divergent executor result remains unpersisted and fails closed", async () => {
  let persisted = false;
  const executor: PaymentExecutor = {
    async pay() {
      return {
        ...approvedPaymentFixture,
        amount: {
          ...approvedPaymentFixture.amount,
          amount: approvedPaymentFixture.amount.amount + 1,
        },
      };
    },
  };
  const service = new PaymentService({
    claim: async () => ({
      kind: "CLAIMED",
      payment_attempt_id: "payment_attempt_divergent_result",
      idempotency_key: providerIdempotencyKey,
      payment: authorizedPaymentFixture,
    }),
    persistResult: async (_paymentAttemptId, result) => {
      persisted = true;
      return result;
    },
  }, executor);

  await assert.rejects(
    service.pay(
      authorizedPaymentFixture.authorization.authorization_id,
      authorizedPaymentFixture.correlation_id,
    ),
    /does not match its persisted authorization/,
  );
  assert.equal(persisted, false);
});

test("payment logs contain no credential display or reusable payment material", async (t) => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  const sensitiveDisplay = "secret-reusable-token-value";
  const executor = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: approvedPaymentFixture.occurred_at,
  });
  const store: PaymentClaimStore = {
    claim: async () => ({
      kind: "CLAIMED",
      payment_attempt_id: "payment_attempt_logs_001",
      idempotency_key: providerIdempotencyKey,
      payment: {
        ...authorizedPaymentFixture,
        credential: {
          ...authorizedPaymentFixture.credential,
          display: sensitiveDisplay,
        },
      },
    }),
    persistResult: async (_paymentAttemptId, result) => result,
  };
  const app = await buildApp({
    logger: { level: "info", stream },
    paymentService: new PaymentService(store, executor),
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/authorizations/${authorizedPaymentFixture.authorization.authorization_id}/pay`,
    headers: {
      "idempotency-key": "idem_payment_logs_001",
      "x-correlation-id": "corr_payment_logs_001",
    },
    payload: {},
  });
  const logs = chunks.join("");

  assert.equal(response.statusCode, 200);
  assert.match(logs, /corr_payment_logs_001/);
  assert.equal(logs.includes(sensitiveDisplay), false);
  assert.equal(logs.includes(authorizedPaymentFixture.credential.display), false);
  assert.equal(logs.includes(JSON.stringify(authorizedPaymentFixture)), false);
});
