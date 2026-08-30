import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { EnabledYunoConfig, YunoConfig } from "../src/config/env.js";
import {
  authorizedPaymentFixture,
  paymentResultSchema,
} from "../src/contracts/v1/index.js";
import {
  YunoAdapterError,
  YunoPaymentExecutor,
  type YunoCredentialResolver,
} from "../src/modules/payments/yuno/executor.js";

const idempotencyKey = "9f79e7e9-40c2-4f62-94bb-0a9487b5d21d";
const fallbackNow = new Date("2026-08-29T12:05:00.000Z");
const config: EnabledYunoConfig = {
  enabled: true,
  baseUrl: "https://api-sandbox.y.uno",
  accountId: "550e8400-e29b-41d4-a716-446655440000",
  publicApiKey: "[REDACTED]",
  privateSecretKey: "[REDACTED]",
  country: "BR",
  requestTimeoutMs: 10_000,
};

async function fixture(name: string): Promise<unknown> {
  const source = await readFile(new URL(`fixtures/yuno/${name}.json`, import.meta.url), "utf8");
  return JSON.parse(source) as unknown;
}

const sanitizedCredentialResolver: YunoCredentialResolver = {
  resolve: async () => ({
    accountId: config.accountId,
    customerId: "33333333-3333-4333-8333-333333333333",
    vaultedToken: "[REDACTED]",
  }),
};

interface ExecutorOverrides {
  config?: YunoConfig;
  credentialResolver?: YunoCredentialResolver;
}

function createExecutor(
  fetchTransport: typeof fetch,
  overrides: ExecutorOverrides = {},
): YunoPaymentExecutor {
  return new YunoPaymentExecutor(overrides.config ?? config, {
    fetch: fetchTransport,
    now: () => fallbackNow,
    credentialResolver: overrides.credentialResolver ?? sanitizedCredentialResolver,
  });
}

function createBoundaryProbe(yunoConfig: YunoConfig = config) {
  let calls = 0;
  const countCall = () => {
    calls += 1;
  };
  const executor = createExecutor(
    async () => {
      countCall();
      return new Response(null, { status: 500 });
    },
    {
      config: yunoConfig,
      credentialResolver: {
        resolve: async () => {
          countCall();
          return undefined;
        },
      },
    },
  );
  return { executor, callCount: () => calls };
}

test("YunoPaymentExecutor approves only a bound authorized payment", async () => {
  let observedRequest: { input: string | URL | Request; init?: RequestInit } | undefined;
  const fetchStub: typeof fetch = async (input, init) => {
    observedRequest = { input, ...(init === undefined ? {} : { init }) };
    return new Response(JSON.stringify(await fixture("payment-succeeded")), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  const executor = createExecutor(fetchStub);

  const result = paymentResultSchema.parse(
    await executor.pay(authorizedPaymentFixture, idempotencyKey),
  );

  assert.deepEqual(result, {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: "2026-08-29T12:04:00.000Z",
    status: "APPROVED",
    payment_id: "11111111-1111-4111-8111-111111111111",
    provider_reference: "22222222-2222-4222-8222-222222222222",
  });
  assert.ok(observedRequest);
  assert.equal(String(observedRequest.input), "https://api-sandbox.y.uno/v1/payments");
  assert.equal(observedRequest.init?.method, "POST");
  const headers = new Headers(observedRequest.init?.headers);
  assert.equal(headers.get("public-api-key"), config.publicApiKey);
  assert.equal(headers.get("private-secret-key"), config.privateSecretKey);
  assert.equal(headers.get("x-idempotency-key"), idempotencyKey);
  assert.deepEqual(JSON.parse(String(observedRequest.init?.body)), {
    account_id: config.accountId,
    merchant_order_id: "bound:authorization_vy_471_001",
    merchant_reference: authorizedPaymentFixture.authorization.checkout_id,
    description: "Bound authorized payment",
    country: config.country,
    amount: { currency: "USD", value: 137 },
    customer_payer: { id: "33333333-3333-4333-8333-333333333333" },
    workflow: "DIRECT",
    payment_method: { type: "CARD", vaulted_token: "[REDACTED]" },
  });
});

test("YunoPaymentExecutor converts fractional minor units without binary division", async () => {
  const payment = {
    ...authorizedPaymentFixture,
    authorization: {
      ...authorizedPaymentFixture.authorization,
      reserved_amount: { amount: 13_701, currency: "USD" as const },
    },
  };
  const responseBody = await fixture("payment-succeeded") as {
    amount: { value: number; currency: string };
  };
  responseBody.amount.value = 137.01;
  let requestBody: unknown;
  const executor = createExecutor(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as unknown;
    return new Response(JSON.stringify(responseBody), { status: 201 });
  });

  const result = await executor.pay(payment, idempotencyKey);

  assert.equal((requestBody as { amount: { value: number } }).amount.value, 137.01);
  assert.equal(result.status, "APPROVED");
  assert.deepEqual(result.amount, { amount: 13_701, currency: "USD" });
});

test("YunoPaymentExecutor normalizes a terminal provider decline", async () => {
  const executor = createExecutor(async () => new Response(
    JSON.stringify(await fixture("payment-declined")),
    {
      status: 201,
      headers: { "content-type": "application/json" },
    },
  ));

  assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: "2026-08-29T12:04:02.000Z",
    status: "DECLINED",
    payment_id: "44444444-4444-4444-8444-444444444444",
    decline_code: "insufficient_funds",
  });
});

test("YunoPaymentExecutor reports a client timeout without claiming payment failure", async () => {
  const executor = createExecutor(async () => {
    throw new DOMException("request exceeded its deadline", "TimeoutError");
  });

  assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: fallbackNow.toISOString(),
    status: "TIMEOUT",
  });
});

test("YunoPaymentExecutor keeps an interrupted transport economically unknown", async () => {
  const executor = createExecutor(async () => {
    throw new Error("connection reset with synthetic-vaulted-value-never-log");
  });

  assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: fallbackNow.toISOString(),
    status: "UNKNOWN",
  });
});

test("YunoPaymentExecutor keeps a provider error economically unknown", async () => {
  const executor = createExecutor(async () => new Response(JSON.stringify({
    message: "upstream failure",
    raw_response: "[REDACTED]",
  }), { status: 503 }));

  assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: fallbackNow.toISOString(),
    status: "UNKNOWN",
  });
});

test("YunoPaymentExecutor accepts a platform-neutral HTTP response contract", async () => {
  const executor = new YunoPaymentExecutor(config, {
    fetch: async () => ({ status: 503, json: async () => ({}) }),
    credentialResolver: sanitizedCredentialResolver,
    now: () => fallbackNow,
  });

  assert.equal((await executor.pay(authorizedPaymentFixture, idempotencyKey)).status, "UNKNOWN");
});

test("YunoPaymentExecutor treats a malformed success response as unknown", async () => {
  const executor = createExecutor(async () => new Response(
    JSON.stringify(await fixture("payment-malformed")),
    {
      status: 201,
    },
  ));

  assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: fallbackNow.toISOString(),
    status: "UNKNOWN",
    payment_id: "66666666-6666-4666-8666-666666666666",
  });
});

test("YunoPaymentExecutor never approves mismatched amount or currency bindings", async (t) => {
  const mismatches = [
    { name: "amount", amount: { value: 137.01, currency: "USD" } },
    { name: "currency", amount: { value: 137, currency: "BRL" } },
    { name: "precision", amount: { value: 137.001, currency: "USD" } },
  ];

  for (const mismatch of mismatches) {
    await t.test(mismatch.name, async () => {
      const responseBody = await fixture("payment-succeeded") as {
        amount: { value: number; currency: string };
      };
      responseBody.amount = mismatch.amount;
      const executor = createExecutor(
        async () => new Response(JSON.stringify(responseBody), { status: 201 }),
      );

      assert.deepEqual(await executor.pay(authorizedPaymentFixture, idempotencyKey), {
        authorization_id: authorizedPaymentFixture.authorization.authorization_id,
        amount: authorizedPaymentFixture.authorization.reserved_amount,
        occurred_at: "2026-08-29T12:04:00.000Z",
        status: "UNKNOWN",
        payment_id: "11111111-1111-4111-8111-111111111111",
      });
    });
  }
});

test("YunoPaymentExecutor rejects a non-UUID idempotency key before resolving credentials", async () => {
  const invalidKey = "authorization_vy_471_001";
  const boundary = createBoundaryProbe();

  await assert.rejects(
    boundary.executor.pay(authorizedPaymentFixture, invalidKey),
    (error: unknown) => {
      assert.ok(error instanceof YunoAdapterError);
      assert.equal(error.code, "invalid_idempotency_key");
      assert.equal(error.message.includes(invalidKey), false);
      return true;
    },
  );
  assert.equal(boundary.callCount(), 0);
});

test("YunoPaymentExecutor fails closed when Yuno configuration is disabled", async () => {
  const disabledConfig: YunoConfig = { enabled: false };
  const boundary = createBoundaryProbe(disabledConfig);

  await assert.rejects(
    boundary.executor.pay(authorizedPaymentFixture, idempotencyKey),
    (error: unknown) => error instanceof YunoAdapterError && error.code === "configuration_error",
  );
  assert.equal(boundary.callCount(), 0);
});

test("YunoPaymentExecutor rejects incomplete or non-sandbox runtime configuration", async (t) => {
  const invalidConfigurations = [
    { name: "incomplete", value: { enabled: true } },
    { name: "production URL", value: { ...config, baseUrl: "https://api.y.uno" } },
  ];

  for (const invalidConfiguration of invalidConfigurations) {
    await t.test(invalidConfiguration.name, async () => {
      const boundary = createBoundaryProbe(invalidConfiguration.value as YunoConfig);

      await assert.rejects(
        boundary.executor.pay(authorizedPaymentFixture, idempotencyKey),
        (error: unknown) => error instanceof YunoAdapterError && error.code === "configuration_error",
      );
      assert.equal(boundary.callCount(), 0);
    });
  }
});

test("YunoPaymentExecutor rejects currencies without a trusted precision mapping", async () => {
  const boundary = createBoundaryProbe();
  const unsupportedPayment = {
    ...authorizedPaymentFixture,
    authorization: {
      ...authorizedPaymentFixture.authorization,
      reserved_amount: { amount: 137, currency: "JPY" as const },
    },
  };

  await assert.rejects(
    boundary.executor.pay(unsupportedPayment, idempotencyKey),
    (error: unknown) => error instanceof YunoAdapterError && error.code === "unsupported_currency",
  );
  assert.equal(boundary.callCount(), 0);
});

test("YunoPaymentExecutor errors redact provider headers, customer data, tokens and raw payloads", async () => {
  const sensitiveValues = [
    "synthetic-public-key-never-log",
    "synthetic-private-key-never-log",
    "synthetic-customer-never-log",
    "synthetic-vaulted-value-never-log",
    "synthetic-network-value-never-log",
    "synthetic-document-never-log",
    "synthetic-raw-payload-never-log",
  ];
  const sensitiveConfig: EnabledYunoConfig = {
    ...config,
    publicApiKey: sensitiveValues[0]!,
    privateSecretKey: sensitiveValues[1]!,
  };
  const executor = createExecutor(
    async () => new Response(JSON.stringify({
      headers: {
        "public-api-key": sensitiveValues[0],
        "private-secret-key": sensitiveValues[1],
      },
      customer_payer: { email: sensitiveValues[2] },
      vaulted_token: sensitiveValues[3],
      network_token: sensitiveValues[4],
      document_number: sensitiveValues[5],
      raw_response: sensitiveValues[6],
    }), { status: 401 }),
    {
      config: sensitiveConfig,
      credentialResolver: {
        resolve: async () => ({
          accountId: sensitiveConfig.accountId,
          customerId: "33333333-3333-4333-8333-333333333333",
          vaultedToken: sensitiveValues[3]!,
        }),
      },
    },
  );

  await assert.rejects(
    executor.pay(authorizedPaymentFixture, idempotencyKey),
    (error: unknown) => {
      assert.ok(error instanceof YunoAdapterError);
      assert.equal(error.code, "request_rejected");
      const serializedError = `${String(error)} ${JSON.stringify(error)}`;
      for (const sensitiveValue of sensitiveValues) {
        assert.equal(serializedError.includes(sensitiveValue), false);
      }
      return true;
    },
  );
});
