import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRequestProofFixture,
  approvedPaymentFixture,
  mandateFixture,
  normalizedCheckoutFixture,
  offerCandidateFixture,
  orderReceiptFixture,
  reservedAuthorizationFixture,
} from "../src/contracts/v1/index.js";
import {
  ApplicationTravelBotTools,
  type ApplicationTravelBotToolsOptions,
  type TravelBotConversation,
} from "../src/modules/travelbot/index.js";

function boundConversation(): TravelBotConversation {
  return {
    conversation_id: "00000000-0000-4000-8000-000000000001",
    principal_id: mandateFixture.terms.principal_id,
    agent_id: mandateFixture.terms.agent_id,
    state: "AWAITING_AUTHORITY_CONFIRMATION",
    version: 2,
    intent: {
      origin_iata: "GRU",
      destination_iata: "COR",
      departure_date: "2026-09-15",
      passenger_count: 1,
      cabin: "ECONOMY",
      max_total_budget: { amount: 15000, currency: "USD" },
      selected_offer_id: offerCandidateFixture.offer_id,
      confirmation: {
        approval_id: "approval_chat_001",
        merchant_id: offerCandidateFixture.merchant_id,
        checkout_hash: normalizedCheckoutFixture.checkout_hash,
        amount: 13700,
        currency: "USD",
        mandate_id: mandateFixture.terms.mandate_id,
        decision: "CONFIRMED",
        decided_at: "2026-08-29T12:04:01.000Z",
      },
    },
    offers: [offerCandidateFixture],
    messages: [],
    active_run_id: null,
    operation: {
      checkout_id: normalizedCheckoutFixture.terms.checkout_id,
      checkout_hash: normalizedCheckoutFixture.checkout_hash,
      mandate_id: mandateFixture.terms.mandate_id,
      authorization_id: null,
      receipt_id: null,
      pending_approval: {
        approval_id: "approval_chat_001",
        merchant_id: offerCandidateFixture.merchant_id,
        checkout_hash: normalizedCheckoutFixture.checkout_hash,
        amount: 13700,
        currency: "USD",
        mandate_id: mandateFixture.terms.mandate_id,
        status: "PENDING",
        sdk_run_state: "encrypted",
      },
    },
    created_at: "2026-08-29T12:00:00.000Z",
    updated_at: "2026-08-29T12:04:01.000Z",
  };
}

function dependencies(decision: "ALLOW" | "DENY") {
  let payments = 0;
  const options: ApplicationTravelBotToolsOptions = {
    merchant: { createCheckout: async () => normalizedCheckoutFixture },
    mandates: {
      createDraft: async () => ({ mandate: mandateFixture }),
      activate: async () => mandateFixture,
      loadActiveMandate: async () => mandateFixture,
    },
    verify: {
      verify: async () => decision === "ALLOW"
        ? {
          decision,
          reasons: [],
          authorization_id: reservedAuthorizationFixture.authorization_id,
        }
        : { decision, reasons: ["amount_limit_exceeded"] },
    },
    payments: {
      pay: async () => {
        payments += 1;
        return approvedPaymentFixture;
      },
    },
    receipts: {
      findByAuthorization: async () => orderReceiptFixture,
      getReceipt: async () => orderReceiptFixture,
    },
    audit: { getTimeline: async () => ({ events: [{ event_type: "order.confirmed" }] }) },
    proofFactory: { sign: async () => agentRequestProofFixture },
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    credentialId: mandateFixture.terms.credential_id,
  };
  return { options, paymentCalls: () => payments };
}

test("request_purchase goes through Verify then PaymentService and returns the persisted receipt", async () => {
  const fixture = dependencies("ALLOW");
  const tools = new ApplicationTravelBotTools(fixture.options);
  const result = await tools.requestPurchase!({
    conversation: boundConversation(),
    idempotency_key: "purchase_approval_chat_001",
    correlation_id: "corr_purchase_chat_001",
  });
  assert.deepEqual(result, {
    status: "COMPLETED",
    authorization_id: reservedAuthorizationFixture.authorization_id,
    receipt_id: orderReceiptFixture.receipt_id,
  });
  assert.equal(fixture.paymentCalls(), 1);
});

test("a Verify DENY never reaches payment", async () => {
  const fixture = dependencies("DENY");
  const tools = new ApplicationTravelBotTools(fixture.options);
  const result = await tools.requestPurchase!({
    conversation: boundConversation(),
    idempotency_key: "purchase_approval_chat_deny_001",
    correlation_id: "corr_purchase_chat_deny_001",
  });
  assert.deepEqual(result, { status: "DENIED", reason_code: "amount_limit_exceeded" });
  assert.equal(fixture.paymentCalls(), 0);
});

test("a changed checkout is reported as stale before Verify or payment", async () => {
  const fixture = dependencies("ALLOW");
  fixture.options.merchant = {
    createCheckout: async () => ({
      ...normalizedCheckoutFixture,
      checkout_hash: "b".repeat(64),
    }),
  };
  const tools = new ApplicationTravelBotTools(fixture.options);

  const result = await tools.requestPurchase!({
    conversation: boundConversation(),
    idempotency_key: "purchase_stale_checkout_001",
    correlation_id: "corr_purchase_stale_checkout_001",
  });

  assert.deepEqual(result, { status: "FAILED", reason_code: "checkout_stale" });
  assert.equal(fixture.paymentCalls(), 0);
});
