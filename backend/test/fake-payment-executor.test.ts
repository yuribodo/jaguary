import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizedPaymentFixture,
  paymentResultSchema,
} from "../src/contracts/v1/index.js";
import { FakePaymentExecutor } from "../src/modules/payments/index.js";

const occurredAt = "2026-08-29T12:04:00.000Z";
const idempotencyKey = "payment:authorization_vy_471_001";

test("FakePaymentExecutor deterministically approves a payment", async () => {
  const executor = new FakePaymentExecutor({ outcome: "APPROVED", occurredAt });

  const result = paymentResultSchema.parse(
    await executor.pay(authorizedPaymentFixture, idempotencyKey),
  );

  assert.deepEqual(result, {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: occurredAt,
    status: "APPROVED",
    payment_id: "payment_fake_authorization_vy_471_001",
    provider_reference: "fake_ref_authorization_vy_471_001",
  });
});

test("FakePaymentExecutor deterministically declines a payment", async () => {
  const executor = new FakePaymentExecutor({ outcome: "DECLINED", occurredAt });

  const result = paymentResultSchema.parse(
    await executor.pay(authorizedPaymentFixture, idempotencyKey),
  );

  assert.deepEqual(result, {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: occurredAt,
    status: "DECLINED",
    payment_id: "payment_fake_authorization_vy_471_001",
    decline_code: "fake_declined",
  });
});

test("FakePaymentExecutor deterministically times out a payment", async () => {
  const executor = new FakePaymentExecutor({ outcome: "TIMEOUT", occurredAt });

  const result = paymentResultSchema.parse(
    await executor.pay(authorizedPaymentFixture, idempotencyKey),
  );

  assert.deepEqual(result, {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: occurredAt,
    status: "TIMEOUT",
  });
});

test("FakePaymentExecutor deterministically returns an unknown outcome", async () => {
  const executor = new FakePaymentExecutor({ outcome: "UNKNOWN", occurredAt });

  const result = paymentResultSchema.parse(
    await executor.pay(authorizedPaymentFixture, idempotencyKey),
  );

  assert.deepEqual(result, {
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    amount: authorizedPaymentFixture.authorization.reserved_amount,
    occurred_at: occurredAt,
    status: "UNKNOWN",
    payment_id: "payment_fake_authorization_vy_471_001",
  });
});

test("FakePaymentExecutor records only sanitized payment call metadata", async () => {
  const executor = new FakePaymentExecutor({ outcome: "APPROVED", occurredAt });

  await executor.pay(authorizedPaymentFixture, idempotencyKey);

  assert.equal(executor.callCount, 1);
  assert.deepEqual(executor.calls, [{
    authorization_id: authorizedPaymentFixture.authorization.authorization_id,
    idempotency_key: idempotencyKey,
  }]);
  assert.equal(JSON.stringify(executor.calls).includes(authorizedPaymentFixture.credential.display), false);
  assert.equal("credential" in executor.calls[0]!, false);
});
