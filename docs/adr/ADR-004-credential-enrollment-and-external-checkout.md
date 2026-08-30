# ADR-004 — Mandatory credential enrollment and external checkout

- Status: Accepted
- Date: 2026-08-29
- Scope: Bound MVP, payment onboarding, and evolution toward real sites
- Related: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-002](ADR-002-commerce-protocol-layering.md), [ADR-003](ADR-003-agent-identity-assurance.md)

## Context

Two product outcomes must not be presented as equivalent:

1. completing a purchase at the controlled VuelaYa merchant and executing payment in the Yuno sandbox;
2. completing a purchase on an external production site whose merchant has its own acquirer and payment provider.

Yuno Vault and Payments solve the first path when VuelaYa is the merchant of record. A credential vaulted in Bound's Yuno account does not automatically become a card that can be used at another merchant's checkout.

AP2 proves delegated authority, while UCP standardizes commerce and checkout between integrated participants. Google Pay can execute checkout on compatible merchants and surfaces. None of these components independently gives a shopping agent a portable credential for arbitrary legacy sites.

Visa Intelligent Commerce and Mastercard Agent Pay describe agent-specific or restricted credentials and network controls. Both require onboarding. A generic Visa Developer project and its mocked sandbox data do not imply approval for Visa Intelligent Commerce or authorize a production purchase.

## Decision

### Mandatory enrollment

A financial mandate cannot become active without an `ACTIVE` credential owned by the same principal.

Enrollment occurs only on a provider-secured surface such as hosted fields, an SDK, iframe, redirect, or equivalent flow. Bound, the Trusted Surface, and TravelBot never capture or persist full PAN, CVV, or a reusable provider secret.

Outside the protected adapter, Bound stores only a logical reference and sanitized metadata:

```ts
type PaymentCredentialReference = {
  credentialId: string
  principalId: string
  provider: "YUNO" | "VISA_VIC" | "MASTERCARD_AGENT_PAY"
  display: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED"
}
```

Public contracts may use `snake_case`; this example describes the intended domain model. Schema evolution is additive and versioned in the payments workstream.

Planned surfaces are:

```text
POST   /v1/payment-methods/enrollment-session
GET    /v1/payment-methods
DELETE /v1/payment-methods/:id
POST   /v1/mandates
```

The enrollment endpoint creates only a provider session. Provider confirmation activates the reference. Removal or revocation blocks new mandates and reservations without deleting historical evidence.

### Guaranteed MVP path

The release gate remains:

```text
Yuno enrollment
  → ACTIVE logical credential
  → AP2 mandate
  → signed VuelaYa UCP checkout
  → Bound ALLOW + single-use reservation
  → Yuno sandbox payment
  → VuelaYa order + receipt
```

This path demonstrates authorization, credential isolation, provider execution, and audit. It is not described as a real flight purchase or an arbitrary-site purchase.

### External-site purchase

Legacy production checkout is a separate, gated route:

```text
isolated browser executor
  → external merchant checkout and final price
  → checkout snapshot/hash
  → Bound Verify
  → ALLOW + single-use reservation
  → Payment Instruction and restricted network credential
  → secure guest-checkout completion
  → HITL for 3DS, Passkey, or CAPTCHA when required
  → merchant confirmation + commerce signal + receipt
```

Rules for this route:

- the LLM and discovery process never receive the credential;
- the checkout executor receives a bounded capability only after `ALLOW`;
- the reservation binds merchant, amount, currency, checkout hash, and expiration;
- changed price or terms require a new checkout and verification;
- 3DS, Passkey, OTP, or explicit-confirmation challenges pause for human involvement;
- timeout or ambiguous navigation remains `UNKNOWN` until reconciliation;
- CAPTCHA, bot blocking, login, site terms, and regional availability may prevent execution;
- raw PAN or CVV automation is never a fallback.

Visa TAP may help the merchant recognize the agent but does not replace a credential. Visa VIC is the first candidate for the Visa route. Mastercard Agent Pay is a future adapter and may be investigated through Yuno, which has been announced as an enabling partner in Latin America. Token interoperability between VIC and Yuno is not claimed until technically and commercially validated.

## Access status on 2026-08-29

- A sandbox project exists in Visa Developer.
- Visa Intelligent Commerce reports `Product Access Required`; product-specific access still requires approval.
- The Visa sandbox uses mocked data and does not authorize production-site purchases.
- P0 has no Visa or Mastercard dependency.
- The real-site route moves from `gated experiment` to supported only after credential, onboarding, and end-to-end validation.

## Alternatives rejected

- **Store card data directly in Bound:** rejected because it unnecessarily expands PCI scope and exposes reusable payment material.
- **Give a card or token to TravelBot:** rejected because web content or model behavior could bypass mandates, revocation, and limits.
- **Treat Yuno as a universal card:** rejected because a vaulted reference belongs to an integrated merchant and provider context.
- **Require external purchase before network onboarding:** rejected because access, strong authentication, bot protection, and production availability are external risks. VuelaYa and Yuno remain the deterministic fallback.

## Consequences

- The Trusted Surface must support enrollment and payment-method management before mandate activation.
- BE-09 first implements Yuno enrollment and payment for VuelaYa.
- A future VIC or Agent Pay adapter can resolve external-checkout credentials without changing Bound Verify.
- The demo clearly distinguishes sandbox payment, controlled-merchant order, and real external purchase.
- Production requires separate certification and onboarding; sandbox approval is insufficient.

## Acceptance criteria

1. A financial mandate without an active credential for the same principal cannot be activated.
2. No public payload, log, or fixture contains PAN, CVV, private keys, or reusable tokens.
3. Credentials are resolved only after confirmed `RESERVED` authorization.
4. Credential revocation blocks new reservations.
5. P0 completes one Yuno sandbox operation and one VuelaYa order.
6. The external route remains disabled by default until onboarding and end-to-end testing.
7. The UI unambiguously identifies sandbox, controlled-merchant, and real-purchase outcomes.
