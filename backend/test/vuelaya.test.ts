import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildApp } from "../src/app.js";
import {
  checkoutTermsFixture,
  canonicalCheckoutFixture,
  merchantCapabilitiesSchema,
  normalizedCheckoutSchema,
  offerCandidateFixture,
  offerCandidateSchema,
  orderReceiptSchema,
  purchaseIntentFixture,
  reservedAuthorizationFixture,
  sha256CanonicalJson,
  vuelaYaCapabilitiesFixture,
} from "../src/contracts/v1/index.js";
import {
  EphemeralEs256Signer,
  VuelaYaMerchant,
  verifyCheckoutIntegrity,
} from "../src/modules/vuelaya/index.js";

const AP2_CAPABILITIES = [
  "dev.ucp.shopping.checkout",
  "dev.ucp.common.payment.ap2_mandate",
].join(",");

test("VuelaYa publishes the pinned Checkout + AP2 profile and deterministic offer", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const profileResponse = await app.inject({
    method: "GET",
    url: "/.well-known/ucp",
    headers: { "x-correlation-id": "corr_vuelaya_profile_001" },
  });
  assert.equal(profileResponse.statusCode, 200);
  assert.deepEqual(merchantCapabilitiesSchema.parse(profileResponse.json()), vuelaYaCapabilitiesFixture);
  assert.match(
    String(profileResponse.headers.link),
    /<http:\/\/localhost(?::\d+)?\/ucp\/v1\/checkout>; rel="create-checkout"/,
  );
  assert.equal(profileResponse.headers["x-correlation-id"], "corr_vuelaya_profile_001");

  const offersResponse = await app.inject({ method: "GET", url: "/merchant/flights" });
  assert.equal(offersResponse.statusCode, 200);
  const offers = offerCandidateSchema.array().parse(offersResponse.json());
  assert.deepEqual(offers, [offerCandidateFixture]);
  assert.deepEqual(offers[0]?.total, { amount: 13700, currency: "USD" });
  assert.deepEqual(offers[0]?.fulfillment, {
    type: "FLIGHT",
    origin: "GRU",
    destination: "COR",
    departure_at: "2026-09-15T10:00:00.000Z",
    arrival_at: "2026-09-15T13:05:00.000Z",
  });
});

test("completion requires ReservedAuthorization and returns one idempotent order receipt", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const createResponse = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_completion_checkout_create",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: purchaseIntentFixture,
  });
  const checkout = normalizedCheckoutSchema.parse(createResponse.json());

  const allowDeclarationOnly = await app.inject({
    method: "POST",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}/complete`,
    headers: {
      "idempotency-key": "idem_completion_allow_only",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: { decision: "ALLOW", authorization_id: reservedAuthorizationFixture.authorization_id },
  });
  assert.equal(allowDeclarationOnly.statusCode, 400);
  assert.equal(allowDeclarationOnly.json().error.code, "validation_error");

  const completionRequest = {
    checkout,
    authorization: reservedAuthorizationFixture,
  };
  const completionHeaders = {
    "idempotency-key": "idem_completion_authorized_001",
    "ucp-capabilities": AP2_CAPABILITIES,
    "x-correlation-id": "corr_completion_authorized_001",
  };
  const first = await app.inject({
    method: "POST",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}/complete`,
    headers: completionHeaders,
    payload: completionRequest,
  });
  assert.equal(first.statusCode, 201);
  const firstReceipt = orderReceiptSchema.parse(first.json());
  assert.equal(firstReceipt.checkout_id, checkout.terms.checkout_id);
  assert.equal(firstReceipt.authorization_id, reservedAuthorizationFixture.authorization_id);
  assert.equal(firstReceipt.evidence.correlation_id, "corr_completion_authorized_001");

  const repeated = await app.inject({
    method: "POST",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}/complete`,
    headers: completionHeaders,
    payload: completionRequest,
  });
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), firstReceipt);

  const readOrder = await app.inject({
    method: "GET",
    url: `/ucp/v1/orders/${firstReceipt.order_id}`,
  });
  assert.equal(readOrder.statusCode, 200);
  assert.deepEqual(readOrder.json(), firstReceipt);
});

test("a valid PurchaseIntent creates and reads the merchant-authoritative signed checkout", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const createResponse = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_create_001",
      "ucp-capabilities": AP2_CAPABILITIES,
      "x-correlation-id": "corr_checkout_create_001",
    },
    payload: purchaseIntentFixture,
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.headers["x-correlation-id"], "corr_checkout_create_001");

  const checkout = normalizedCheckoutSchema.parse(createResponse.json());
  assert.equal(checkout.checkout_hash, "b059774ba8efeb7200c1aaefa6786bf293e4c8d5fece24a147586a1a330f9c01");
  assert.deepEqual(checkout.terms.total, { amount: 13700, currency: "USD" });
  assert.deepEqual(checkout.terms.items[0]?.total, { amount: 13700, currency: "USD" });

  const readResponse = await app.inject({
    method: "GET",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}`,
  });
  assert.equal(readResponse.statusCode, 200);
  assert.deepEqual(readResponse.json(), checkout);
});

test("VuelaYa recalculates quantity and rejects client-authored economic fields", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const recalculated = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_quantity_002",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: { ...purchaseIntentFixture, quantity: 2 },
  });
  assert.equal(recalculated.statusCode, 201);
  assert.equal(recalculated.json().terms.items[0].quantity, 2);
  assert.deepEqual(recalculated.json().terms.items[0].total, { amount: 27400, currency: "USD" });
  assert.deepEqual(recalculated.json().terms.total, { amount: 27400, currency: "USD" });

  const injectedEconomics = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_injected_total",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: {
      ...purchaseIntentFixture,
      total: { amount: 1, currency: "USD" },
    },
  });
  assert.equal(injectedEconomics.statusCode, 400);
  assert.equal(injectedEconomics.json().error.code, "validation_error");
});

test("VuelaYa rejects AP2 downgrade, missing offers and expired offers with stable errors", async (t) => {
  const app = await buildApp({ logger: false });
  t.after(async () => app.close());

  const downgrade = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_downgrade_001",
      "ucp-capabilities": "dev.ucp.shopping.checkout",
      "x-correlation-id": "corr_checkout_downgrade_001",
    },
    payload: purchaseIntentFixture,
  });
  assert.equal(downgrade.statusCode, 400);
  assert.equal(downgrade.json().error.code, "invalid_request");
  assert.equal(downgrade.json().correlation_id, "corr_checkout_downgrade_001");

  const missingOffer = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_missing_offer",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: { ...purchaseIntentFixture, offer_id: "offer_missing" },
  });
  assert.equal(missingOffer.statusCode, 404);
  assert.equal(missingOffer.json().error.code, "not_found");

  const expiredApp = await buildApp({
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:15:00.000Z") },
  });
  t.after(async () => expiredApp.close());
  const expiredOffer = await expiredApp.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_checkout_expired_offer",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: purchaseIntentFixture,
  });
  assert.equal(expiredOffer.statusCode, 410);
  assert.equal(expiredOffer.json().error.code, "invalid_request");
});

test("JCS and the merchant signature detect every relevant checkout mutation", async () => {
  const signer = new EphemeralEs256Signer();
  const merchant = new VuelaYaMerchant(
    signer,
    { now: () => new Date("2026-08-29T12:04:01.000Z") },
  );
  const checkout = await merchant.createCheckout(purchaseIntentFixture);
  assert.equal(checkout.checkout_hash, canonicalCheckoutFixture.sha256);
  assert.equal(await verifyCheckoutIntegrity(checkout, signer), true);

  const reorderedTerms = {
    total: checkoutTermsFixture.total,
    protocol: checkoutTermsFixture.protocol,
    merchant_url: checkoutTermsFixture.merchant_url,
    merchant_id: checkoutTermsFixture.merchant_id,
    items: checkoutTermsFixture.items,
    fulfillment: checkoutTermsFixture.fulfillment,
    expires_at: checkoutTermsFixture.expires_at,
    created_at: checkoutTermsFixture.created_at,
    checkout_id: checkoutTermsFixture.checkout_id,
  };
  assert.equal(await verifyCheckoutIntegrity({ ...checkout, terms: reorderedTerms }, signer), true);

  const mutations: unknown[] = [];
  const price = structuredClone(checkout);
  price.terms.items[0]!.unit_price.amount = 1;
  mutations.push(price);
  const currency = structuredClone(checkout);
  currency.terms.total.currency = "EUR";
  mutations.push(currency);
  const route = structuredClone(checkout);
  route.terms.fulfillment.origin = "GIG";
  mutations.push(route);
  const item = structuredClone(checkout);
  item.terms.items[0]!.name = "Injected flight";
  mutations.push(item);
  const merchantId = structuredClone(checkout);
  merchantId.terms.merchant_id = "merchant_attacker";
  mutations.push(merchantId);
  const expiry = structuredClone(checkout);
  expiry.terms.expires_at = "2026-08-29T12:18:00.000Z";
  mutations.push(expiry);
  mutations.push({
    ...checkout,
    terms: { ...checkout.terms, injected: true },
  });

  for (const mutated of mutations) {
    const candidate = mutated as { terms: unknown; checkout_hash: string };
    candidate.checkout_hash = sha256CanonicalJson(candidate.terms);
    assert.equal(await verifyCheckoutIntegrity(mutated, signer), false);
  }
  assert.equal("merchant_signature" in checkout.terms, false);
});

test("expired checkouts and mismatched authorization bindings fail closed", async (t) => {
  let now = new Date("2026-08-29T12:04:01.000Z");
  const app = await buildApp({ logger: false, clock: { now: () => now } });
  t.after(async () => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_expiring_checkout_create",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: purchaseIntentFixture,
  });
  const checkout = normalizedCheckoutSchema.parse(created.json());

  const mismatched = await app.inject({
    method: "POST",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}/complete`,
    headers: {
      "idempotency-key": "idem_mismatched_authorization",
      "ucp-capabilities": AP2_CAPABILITIES,
    },
    payload: {
      checkout,
      authorization: {
        ...reservedAuthorizationFixture,
        reserved_amount: { amount: 1, currency: "EUR" },
      },
    },
  });
  assert.equal(mismatched.statusCode, 400);
  assert.equal(mismatched.json().error.code, "validation_error");

  now = new Date("2026-08-29T12:17:00.000Z");
  const expired = await app.inject({
    method: "GET",
    url: `/ucp/v1/checkout/${checkout.terms.checkout_id}`,
  });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.json().error.code, "invalid_request");
});

test("the merchant module has no payment executor or Yuno path and fixtures remain sanitized", async () => {
  const moduleFiles = ["merchant.ts", "routes.ts", "catalog.ts", "signer.ts"];
  const moduleSource = (
    await Promise.all(moduleFiles.map((file) => readFile(new URL(`../src/modules/vuelaya/${file}`, import.meta.url), "utf8")))
  ).join("\n");
  assert.doesNotMatch(moduleSource, /PaymentExecutor|Yuno|vaulted_token/i);

  const fixtures = await readFile(
    new URL("../src/contracts/v1/fixtures/index.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    /\bpan\b/i,
    /\bcvv\b/i,
    /private[_ ]key\s*[:=]/i,
    /vaulted_token/i,
    /reusable[_ ]token/i,
  ]) {
    assert.doesNotMatch(fixtures, forbidden);
  }
});
