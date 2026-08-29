import type { NormalizedAuthorization, ReservedAuthorization } from "../authorization/schemas.js";
import type {
  CheckoutTerms,
  MerchantCapabilities,
  NormalizedCheckout,
  OfferCandidate,
  PurchaseIntent,
} from "../commerce/schemas.js";
import type { AgentIdentity, AgentRequestProof, PrincipalIdentity } from "../identity/schemas.js";
import type { Mandate } from "../mandates/schemas.js";
import type { AuthorizedPayment, PaymentResult } from "../payments/schemas.js";
import type { OrderReceipt } from "../receipts/schemas.js";

const demoSignature = {
  algorithm: "ES256",
  key_id: "key_demo_bound_2026",
  value: "ZGVtb19zaWduYXR1cmVfbm90X2Zvcl9wcm9kdWN0aW9u",
} as const;

export const martaFixture = {
  principal_id: "principal_marta",
  display_name: "Marta",
} satisfies PrincipalIdentity;

export const travelBotFixture = {
  agent_id: "agent_travelbot",
  principal_id: martaFixture.principal_id,
  display_name: "TravelBot",
  status: "ACTIVE",
  build_fingerprint: "6b52b86b8a1d9c0280c94927d137b3211e3d79efae7cabe529bfba651f6f4324",
  verification_key: {
    key_id: "key_demo_travelbot_2026",
    algorithm: "ES256",
    public_jwk: {
      kty: "EC",
      crv: "P-256",
      x: "P5N6t_B_UujhUx-YhWddvxSfqWqARy235FBR0d6JjQ0",
      y: "CX6FU_MWJxx1zfvyPwiFSpdxodJXnlYwsnLR8qzvZ1Q",
    },
  },
  created_at: "2026-08-29T12:00:00.000Z",
} satisfies AgentIdentity;

export const vuelaYaCapabilitiesFixture = {
  merchant_id: "merchant_vuelaya",
  merchant_name: "VuelaYa",
  merchant_url: "https://demo.vuelaya.example",
  protocol: { name: "UCP", version: "2026-08-25" },
  capabilities: [
    { name: "dev.ucp.shopping.checkout", version: "2026-08-25", extends: [] },
    {
      name: "dev.ucp.common.payment.ap2_mandate",
      version: "2026-08-25",
      extends: ["dev.ucp.shopping.checkout"],
    },
  ],
} satisfies MerchantCapabilities;

const flightItem = {
  item_id: "flight_vy_471_gru_cor",
  name: "VuelaYa flight GRU to COR",
  quantity: 1,
  unit_price: { amount: 13700, currency: "USD" },
  total: { amount: 13700, currency: "USD" },
} as const;

const flightFulfillment = {
  type: "FLIGHT",
  cabin: "ECONOMY",
  origin: "GRU",
  destination: "COR",
  departure_at: "2026-09-15T10:00:00.000Z",
  arrival_at: "2026-09-15T13:05:00.000Z",
} as const;

export const offerCandidateFixture = {
  offer_id: "offer_vy_471_gru_cor",
  merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
  merchant_url: vuelaYaCapabilitiesFixture.merchant_url,
  items: [flightItem],
  total: { amount: 13700, currency: "USD" },
  fulfillment: flightFulfillment,
  available_until: "2026-08-29T12:15:00.000Z",
  source_url: "https://demo.vuelaya.example/flights/vy-471",
  observed_at: "2026-08-29T12:00:00.000Z",
} satisfies OfferCandidate;

export const purchaseIntentFixture = {
  intent_id: "intent_travelbot_vy_471",
  agent_id: travelBotFixture.agent_id,
  merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
  offer_id: offerCandidateFixture.offer_id,
  quantity: 1,
  requested_at: "2026-08-29T12:01:00.000Z",
} satisfies PurchaseIntent;

export const checkoutTermsFixture = {
  checkout_id: "checkout_vy_471_gru_cor",
  merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
  merchant_url: vuelaYaCapabilitiesFixture.merchant_url,
  items: [flightItem],
  total: { amount: 13700, currency: "USD" },
  fulfillment: flightFulfillment,
  created_at: "2026-08-29T12:02:00.000Z",
  expires_at: "2026-08-29T12:17:00.000Z",
  protocol: { name: "UCP", version: "2026-08-25" },
} satisfies CheckoutTerms;

export const canonicalCheckoutFixture = {
  input: checkoutTermsFixture,
  canonical: "{\"checkout_id\":\"checkout_vy_471_gru_cor\",\"created_at\":\"2026-08-29T12:02:00.000Z\",\"expires_at\":\"2026-08-29T12:17:00.000Z\",\"fulfillment\":{\"arrival_at\":\"2026-09-15T13:05:00.000Z\",\"cabin\":\"ECONOMY\",\"departure_at\":\"2026-09-15T10:00:00.000Z\",\"destination\":\"COR\",\"origin\":\"GRU\",\"type\":\"FLIGHT\"},\"items\":[{\"item_id\":\"flight_vy_471_gru_cor\",\"name\":\"VuelaYa flight GRU to COR\",\"quantity\":1,\"total\":{\"amount\":13700,\"currency\":\"USD\"},\"unit_price\":{\"amount\":13700,\"currency\":\"USD\"}}],\"merchant_id\":\"merchant_vuelaya\",\"merchant_url\":\"https://demo.vuelaya.example\",\"protocol\":{\"name\":\"UCP\",\"version\":\"2026-08-25\"},\"total\":{\"amount\":13700,\"currency\":\"USD\"}}",
  sha256: "d2f3856b7bac0531b71ac6ff9e2e2fd7f970d38d3fcef79afde052b77b0f071d",
} as const;

export const normalizedCheckoutFixture = {
  terms: checkoutTermsFixture,
  checkout_hash: canonicalCheckoutFixture.sha256,
  merchant_signature: demoSignature,
} satisfies NormalizedCheckout;

export const mandateFixture = {
  terms: {
    mandate_id: "mandate_marta_travel_001",
    version: 1,
    principal_id: martaFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    allowed_merchant_ids: [vuelaYaCapabilitiesFixture.merchant_id],
    allowed_merchant_categories: ["airline"],
    route: { origin: "GRU", destination: "COR" },
    cabin: "ECONOMY",
    max_per_purchase: { amount: 15000, currency: "USD" },
    max_aggregate: { amount: 15000, currency: "USD" },
    max_uses: 1,
    valid_from: "2026-08-29T12:00:00.000Z",
    expires_at: "2026-08-30T12:00:00.000Z",
    credential_id: "cred_demo_marta_visa",
  },
  payment_credential: {
    credential_id: "cred_demo_marta_visa",
    display: "Visa •••• 4242",
  },
  status: "ACTIVE",
  terms_hash: "004d96590e21d373d76147da96b499413bd5879f59c3e833920cc1451ca642ee",
  principal_signature: demoSignature,
  created_at: "2026-08-29T11:59:00.000Z",
  activated_at: "2026-08-29T12:00:00.000Z",
  authority_valid: true,
} satisfies Mandate;

export const agentRequestProofFixture = {
  payload: {
    method: "POST",
    route: "/trust/v1/agent-requests/verify",
    body_hash: canonicalCheckoutFixture.sha256,
    agent_id: travelBotFixture.agent_id,
    key_id: travelBotFixture.verification_key.key_id,
    build_fingerprint: travelBotFixture.build_fingerprint,
    nonce: "nonce_travelbot_001",
    issued_at: "2026-08-29T12:03:00.000Z",
    expires_at: "2026-08-29T12:08:00.000Z",
  },
  payload_hash: "543096b36fa4cee02d4ca121c6b061c8485b1a4aa9650e0ba7765d6ad9b81f9b",
  algorithm: "ES256",
  key_id: travelBotFixture.verification_key.key_id,
  signature: "eyJhbGciOiJFUzI1NiIsImtpZCI6ImtleV9kZW1vX3RyYXZlbGJvdF8yMDI2In0.eyJhZ2VudF9pZCI6ImFnZW50X3RyYXZlbGJvdCIsImJvZHlfaGFzaCI6ImQyZjM4NTZiN2JhYzA1MzFiNzFhYzZmZjllMmUyZmQ3Zjk3MGQzOGQzZmNlZjc5YWZkZTA1MmI3N2IwZjA3MWQiLCJidWlsZF9maW5nZXJwcmludCI6IjZiNTJiODZiOGExZDljMDI4MGM5NDkyN2QxMzdiMzIxMWUzZDc5ZWZhZTdjYWJlNTI5YmZiYTY1MWY2ZjQzMjQiLCJleHBpcmVzX2F0IjoiMjAyNi0wOC0yOVQxMjowODowMC4wMDBaIiwiaXNzdWVkX2F0IjoiMjAyNi0wOC0yOVQxMjowMzowMC4wMDBaIiwia2V5X2lkIjoia2V5X2RlbW9fdHJhdmVsYm90XzIwMjYiLCJtZXRob2QiOiJQT1NUIiwibm9uY2UiOiJub25jZV90cmF2ZWxib3RfMDAxIiwicm91dGUiOiIvdHJ1c3QvdjEvYWdlbnQtcmVxdWVzdHMvdmVyaWZ5In0.FcAQdUVmdcXHKNc4WRMa7_zgt3z27k41g0Piknp6PVqlGF_LeEA9ll0swHrSoNTATrs5rdaLpkMQe4tf2vDbEQ",
} satisfies AgentRequestProof;

export const normalizedAuthorizationFixture = {
  principal_id: martaFixture.principal_id,
  agent_id: travelBotFixture.agent_id,
  mandate_id: mandateFixture.terms.mandate_id,
  allowed_merchant_ids: [vuelaYaCapabilitiesFixture.merchant_id],
  checkout_hash: canonicalCheckoutFixture.sha256,
  max_amount: { amount: 15000, currency: "USD" },
  expires_at: mandateFixture.terms.expires_at,
  max_uses: 1,
  proof_type: "AP2",
  proof_reference: "proof_ap2_marta_001",
  proof_hash: "6be44382fe92592b3024679a5254978884770c747b5f9e85a2f40e90b681bca2",
} satisfies NormalizedAuthorization;

export const reservedAuthorizationFixture = {
  authorization_id: "authorization_vy_471_001",
  mandate_id: mandateFixture.terms.mandate_id,
  checkout_id: checkoutTermsFixture.checkout_id,
  checkout_hash: canonicalCheckoutFixture.sha256,
  principal_id: martaFixture.principal_id,
  agent_id: travelBotFixture.agent_id,
  merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
  reserved_amount: { amount: 13700, currency: "USD" },
  status: "RESERVED",
  reserved_at: "2026-08-29T12:03:01.000Z",
  expires_at: "2026-08-29T12:18:01.000Z",
} satisfies ReservedAuthorization;

export const authorizedPaymentFixture = {
  authorization: reservedAuthorizationFixture,
  credential: {
    credential_id: "cred_demo_marta_visa",
    display: "Visa •••• 4242",
  },
  correlation_id: "corr_demo_purchase_001",
} satisfies AuthorizedPayment;

const paymentResultBase = {
  authorization_id: reservedAuthorizationFixture.authorization_id,
  amount: reservedAuthorizationFixture.reserved_amount,
  occurred_at: "2026-08-29T12:04:00.000Z",
} as const;

export const approvedPaymentFixture = {
  ...paymentResultBase,
  status: "APPROVED",
  payment_id: "payment_demo_approved_001",
  provider_reference: "provider_ref_demo_001",
} satisfies PaymentResult;

export const declinedPaymentFixture = {
  ...paymentResultBase,
  status: "DECLINED",
  payment_id: "payment_demo_declined_001",
  decline_code: "do_not_honor",
} satisfies PaymentResult;

export const timeoutPaymentFixture = {
  ...paymentResultBase,
  status: "TIMEOUT",
} satisfies PaymentResult;

export const unknownPaymentFixture = {
  ...paymentResultBase,
  status: "UNKNOWN",
  payment_id: "payment_demo_unknown_001",
} satisfies PaymentResult;

export const orderReceiptFixture = {
  receipt_id: "receipt_vy_471_001",
  order_id: "order_vy_471_001",
  checkout_id: checkoutTermsFixture.checkout_id,
  authorization_id: reservedAuthorizationFixture.authorization_id,
  payment_id: approvedPaymentFixture.payment_id,
  merchant_id: vuelaYaCapabilitiesFixture.merchant_id,
  status: "CONFIRMED",
  items: [flightItem],
  total: { amount: 13700, currency: "USD" },
  fulfillment: flightFulfillment,
  issued_at: "2026-08-29T12:04:01.000Z",
  evidence: {
    event_id: "event_order_confirmed_001",
    correlation_id: authorizedPaymentFixture.correlation_id,
    event_type: "order.confirmed",
    subject_id: "order_vy_471_001",
    payload_hash: "eb4e057f188633602941ded8a3946b10d9e0c18b96fb4d955379b96877ad0f25",
    previous_hash: null,
    event_hash: "7b84873f94ace668444deb276c755422f64eeadf908a37e2579eea97e3d6cc6e",
    recorded_at: "2026-08-29T12:04:01.000Z",
  },
} satisfies OrderReceipt;

export const paymentResultFixtures = [
  approvedPaymentFixture,
  declinedPaymentFixture,
  timeoutPaymentFixture,
  unknownPaymentFixture,
] as const;
