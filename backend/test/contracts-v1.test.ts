import assert from "node:assert/strict";
import test from "node:test";

import {
  agentIdentitySchema,
  agentIdentityStatusSchema,
  agentRequestPayloadSchema,
  agentRequestProofSchema,
  agentRequestVerificationSchema,
  apiErrorCodeSchema,
  apiErrorEnvelopeSchema,
  approvedPaymentResultSchema,
  authorizationDecisionSchema,
  authorizationStatusSchema,
  authorizedCheckoutSchema,
  authorizedPaymentSchema,
  auditEvidenceSchema,
  canTransitionAuthorization,
  canTransitionMandate,
  canonicalizeJson,
  checkoutTermsSchema,
  commerceItemSchema,
  correlationIdSchema,
  currencySchema,
  decisionSchema,
  declinedPaymentResultSchema,
  flightFulfillmentSchema,
  idempotencyKeySchema,
  es256PublicJwkSchema,
  mandateSchema,
  mandateStatusSchema,
  mandateTermsSchema,
  merchantCapabilitiesSchema,
  merchantCapabilitySchema,
  moneySchema,
  normalizedAuthorizationSchema,
  normalizedCheckoutSchema,
  offerCandidateSchema,
  orderStatusSchema,
  orderReceiptSchema,
  paymentCredentialReferenceSchema,
  paymentResultSchema,
  paymentResultStatusSchema,
  principalIdentitySchema,
  proofTypeSchema,
  purchaseIntentSchema,
  reasonCodeSchema,
  reservedAuthorizationSchema,
  sha256CanonicalJson,
  sha256Schema,
  signatureAlgorithmSchema,
  signatureSchema,
  timeoutPaymentResultSchema,
  transportErrorCodeSchema,
  unknownPaymentResultSchema,
  utcRfc3339Schema,
} from "../src/contracts/v1/index.js";
import {
  agentRequestProofFixture,
  approvedPaymentFixture,
  authorizedPaymentFixture,
  canonicalCheckoutFixture,
  checkoutTermsFixture,
  declinedPaymentFixture,
  mandateFixture,
  martaFixture,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  offerCandidateFixture,
  orderReceiptFixture,
  paymentResultFixtures,
  purchaseIntentFixture,
  reservedAuthorizationFixture,
  timeoutPaymentFixture,
  travelBotFixture,
  unknownPaymentFixture,
  vuelaYaCapabilitiesFixture,
} from "../src/contracts/v1/fixtures/index.js";

test("Money accepts integer minor units and rejects fractional or invalid currencies", () => {
  assert.deepEqual(moneySchema.parse({ amount: 13700, currency: "USD" }), {
    amount: 13700,
    currency: "USD",
  });
  assert.throws(() => moneySchema.parse({ amount: 137.5, currency: "USD" }));
  assert.throws(() => moneySchema.parse({ amount: 13700, currency: "usd" }));
  assert.throws(() => moneySchema.parse({ amount: 13700, currency: "ZZZ" }));
  assert.throws(() => moneySchema.parse({ amount: -1, currency: "USD" }));
});

test("timestamps require RFC 3339 UTC with a Z suffix", () => {
  assert.equal(utcRfc3339Schema.parse("2026-08-29T12:00:00.000Z"), "2026-08-29T12:00:00.000Z");
  assert.throws(() => utcRfc3339Schema.parse("2026-08-29T12:00:00"));
  assert.throws(() => utcRfc3339Schema.parse("2026-08-29T09:00:00-03:00"));
  assert.throws(() => utcRfc3339Schema.parse("2026-08-29"));
});

test("signed payload schemas reject unknown fields", () => {
  assert.throws(() => checkoutTermsSchema.parse({ ...checkoutTermsFixture, injected: true }));
  assert.throws(() => agentRequestPayloadSchema.parse({
    ...agentRequestProofFixture.payload,
    merchant_override: "attacker",
  }));
  assert.throws(() => agentRequestProofSchema.parse({ ...agentRequestProofFixture, private_key: "secret" }));
  assert.throws(() => es256PublicJwkSchema.parse({
    ...travelBotFixture.verification_key.public_jwk,
    d: "private-material-is-never-accepted",
  }));
});

test("RFC 8785 canonical content and SHA-256 remain stable", () => {
  assert.equal(canonicalizeJson(canonicalCheckoutFixture.input), canonicalCheckoutFixture.canonical);
  assert.equal(sha256CanonicalJson(canonicalCheckoutFixture.input), canonicalCheckoutFixture.sha256);

  const reordered = {
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
  assert.equal(canonicalizeJson(reordered), canonicalCheckoutFixture.canonical);
  assert.equal(sha256CanonicalJson(reordered), canonicalCheckoutFixture.sha256);
  assert.equal(
    sha256CanonicalJson(agentRequestProofFixture.payload),
    agentRequestProofFixture.payload_hash,
  );
  assert.throws(() => canonicalizeJson({ invalid: undefined }));
  assert.throws(() => canonicalizeJson(new Array(1)));
  assert.throws(() => canonicalizeJson(Number.NaN));
});

test("all mandate statuses and transitions are frozen", () => {
  const statuses = ["DRAFT", "ACTIVE", "REVOKED", "EXPIRED", "CONSUMED"] as const;
  assert.deepEqual(mandateStatusSchema.options, statuses);
  assert.equal(canTransitionMandate("DRAFT", "ACTIVE"), true);
  assert.equal(canTransitionMandate("ACTIVE", "REVOKED"), true);
  assert.equal(canTransitionMandate("ACTIVE", "EXPIRED"), true);
  assert.equal(canTransitionMandate("ACTIVE", "CONSUMED"), true);
  assert.equal(canTransitionMandate("DRAFT", "CONSUMED"), false);
  for (const terminal of ["REVOKED", "EXPIRED", "CONSUMED"] as const) {
    for (const target of statuses) assert.equal(canTransitionMandate(terminal, target), false);
  }
});

test("all authorization statuses and safe payment transitions are frozen", () => {
  const statuses = ["RESERVED", "PAYMENT_PENDING", "CONSUMED", "FAILED", "CANCELLED"] as const;
  assert.deepEqual(authorizationStatusSchema.options, statuses);
  assert.equal(canTransitionAuthorization("RESERVED", "PAYMENT_PENDING"), true);
  assert.equal(canTransitionAuthorization("RESERVED", "CANCELLED"), true);
  assert.equal(canTransitionAuthorization("PAYMENT_PENDING", "CONSUMED"), true);
  assert.equal(canTransitionAuthorization("PAYMENT_PENDING", "FAILED"), true);
  assert.equal(canTransitionAuthorization("PAYMENT_PENDING", "CANCELLED"), false);
  for (const terminal of ["CONSUMED", "FAILED", "CANCELLED"] as const) {
    for (const target of statuses) assert.equal(canTransitionAuthorization(terminal, target), false);
  }
});

test("decision and reason enums are complete and decision invariants hold", () => {
  assert.deepEqual(decisionSchema.options, ["ALLOW", "DENY", "ESCALATE"]);
  const requiredReasons = [
    "invalid_agent_signature",
    "agent_not_found",
    "agent_not_active",
    "agent_request_expired",
    "agent_request_not_yet_valid",
    "mandate_not_active",
    "mandate_revoked",
    "mandate_expired",
    "agent_not_authorized",
    "merchant_not_authorized",
    "checkout_integrity_failure",
    "scope_mismatch",
    "currency_mismatch",
    "amount_limit_exceeded",
    "aggregate_limit_exceeded",
    "usage_limit_exceeded",
    "replay_detected",
    "human_approval_required",
  ];
  assert.deepEqual(reasonCodeSchema.options, requiredReasons);
  const evidenceHash = "a".repeat(64);
  assert.doesNotThrow(() => authorizationDecisionSchema.parse({
    decision: "ALLOW",
    reasons: [],
    authorization_id: "authorization_1",
    policy_version: "v1",
    evidence_hash: evidenceHash,
  }));
  assert.throws(() => authorizationDecisionSchema.parse({
    decision: "DENY",
    reasons: [],
    policy_version: "v1",
    evidence_hash: evidenceHash,
  }));
  assert.throws(() => authorizationDecisionSchema.parse({
    decision: "ESCALATE",
    reasons: ["human_approval_required"],
    authorization_id: "authorization_1",
    policy_version: "v1",
    evidence_hash: evidenceHash,
  }));
});

test("all sanitized domain fixtures validate against their public schemas", () => {
  const checks: Array<[string, { parse(value: unknown): unknown }, unknown]> = [
    ["principalIdentity", principalIdentitySchema, martaFixture],
    ["agentIdentity", agentIdentitySchema, travelBotFixture],
    ["purchaseIntent", purchaseIntentSchema, purchaseIntentFixture],
    ["offerCandidate", offerCandidateSchema, offerCandidateFixture],
    ["merchantCapabilities", merchantCapabilitiesSchema, vuelaYaCapabilitiesFixture],
    ["checkoutTerms", checkoutTermsSchema, checkoutTermsFixture],
    ["normalizedCheckout", normalizedCheckoutSchema, normalizedCheckoutFixture],
    ["agentRequestPayload", agentRequestPayloadSchema, agentRequestProofFixture.payload],
    ["agentRequestProof", agentRequestProofSchema, agentRequestProofFixture],
    ["agentRequestVerification", agentRequestVerificationSchema, {
      request_body: canonicalCheckoutFixture.input,
      proof: agentRequestProofFixture,
    }],
    ["mandateTerms", mandateTermsSchema, mandateFixture.terms],
    ["mandate", mandateSchema, mandateFixture],
    ["normalizedAuthorization", normalizedAuthorizationSchema, normalizedAuthorizationFixture],
    ["reservedAuthorization", reservedAuthorizationSchema, reservedAuthorizationFixture],
    ["authorizedCheckout", authorizedCheckoutSchema, {
      checkout: normalizedCheckoutFixture,
      authorization: reservedAuthorizationFixture,
    }],
    ["paymentCredentialReference", paymentCredentialReferenceSchema, authorizedPaymentFixture.credential],
    ["authorizedPayment", authorizedPaymentSchema, authorizedPaymentFixture],
    ["approvedPaymentResult", approvedPaymentResultSchema, approvedPaymentFixture],
    ["declinedPaymentResult", declinedPaymentResultSchema, declinedPaymentFixture],
    ["timeoutPaymentResult", timeoutPaymentResultSchema, timeoutPaymentFixture],
    ["unknownPaymentResult", unknownPaymentResultSchema, unknownPaymentFixture],
    ["auditEvidence", auditEvidenceSchema, orderReceiptFixture.evidence],
    ["orderReceipt", orderReceiptSchema, orderReceiptFixture],
  ];
  for (const [name, schema, fixture] of checks) {
    assert.doesNotThrow(() => schema.parse(fixture), `${name} fixture must validate`);
  }
  for (const fixture of paymentResultFixtures) {
    assert.doesNotThrow(() => paymentResultSchema.parse(fixture));
  }
});

test("supporting schemas validate their intended values", () => {
  const checks: Array<[{ parse(value: unknown): unknown }, unknown]> = [
    [currencySchema, "USD"],
    [sha256Schema, "a".repeat(64)],
    [signatureAlgorithmSchema, "ES256"],
    [signatureSchema, normalizedCheckoutFixture.merchant_signature],
    [correlationIdSchema, "corr_demo_001"],
    [idempotencyKeySchema, "idem_demo_001"],
    [commerceItemSchema, offerCandidateFixture.items[0]],
    [flightFulfillmentSchema, offerCandidateFixture.fulfillment],
    [merchantCapabilitySchema, vuelaYaCapabilitiesFixture.capabilities[0]],
    [agentIdentityStatusSchema, "ACTIVE"],
    [proofTypeSchema, "AP2"],
    [paymentResultStatusSchema, "APPROVED"],
    [orderStatusSchema, "CONFIRMED"],
    [apiErrorCodeSchema, "amount_limit_exceeded"],
    [transportErrorCodeSchema, "validation_error"],
    [apiErrorEnvelopeSchema, {
      error: { code: "amount_limit_exceeded", message: "Checkout amount exceeds the mandate limit", details: {} },
      correlation_id: "corr_demo_001",
    }],
  ];
  for (const [schema, value] of checks) assert.doesNotThrow(() => schema.parse(value));
});
