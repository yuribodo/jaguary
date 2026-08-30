# UCP commerce integration

| Metadata | Value |
| --- | --- |
| Status | Normalized demo subset implemented |
| Pinned profile | `2026-08-25` |
| Purpose | Give the shopping platform and merchant a shared commerce contract |
| Primary code | [`backend/src/modules/vuelaya/routes.ts`](../../backend/src/modules/vuelaya/routes.ts) |

[Open the UCP checkout sequence](../diagrams/ucp-checkout-sequence.html).

## What UCP is for

Universal Commerce Protocol (UCP) standardizes discovery, capabilities, checkout, orders, and related commerce operations between a shopping platform and a business. It answers questions such as: what does the merchant support, how is a checkout created, which terms are authoritative, and how is the resulting order retrieved?

UCP does not itself mean the user authorized payment. In Jaguary, UCP carries the merchant-authored commerce object while AP2/Bound carries and enforces authority.

The current official profile advertises services and capabilities at `/.well-known/ucp`, including versioned Checkout and AP2 extension entries. See the [UCP AP2 Mandates extension](https://ucp.dev/specification/payment/extensions/ap2-mandates/) and [UCP Order REST binding](https://ucp.dev/specification/shopping/order/rest/).

## Current VuelaYa subset

| Method | Route | Responsibility |
| --- | --- | --- |
| `GET` | `/.well-known/ucp` | Publish VuelaYa identity, protocol version, capabilities, and endpoint links |
| `GET` | `/merchant/flights` | Search/list typed flight offers |
| `POST` | `/ucp/v1/checkout` | Convert an intent/offer reference into merchant-authored signed checkout terms |
| `GET` | `/ucp/v1/checkout/:id` | Return the stored non-expired checkout |
| `POST` | `/ucp/v1/checkout/:id/complete` | Return an already confirmed receipt only after payment approval |
| `GET` | `/ucp/v1/orders/:id` | Read a sanitized order receipt |

Checkout creation and completion require both `dev.ucp.shopping.checkout` and `dev.ucp.common.payment.ap2_mandate`. Omitting the AP2 capability is treated as a security downgrade and rejected.

## Merchant-authored economics

The agent sends `intent_id`, `agent_id`, `merchant_id`, `offer_id`, quantity, and request time. VuelaYa looks up the observed offer and authors the items, unit prices, total, fulfillment, creation time, and expiry. It canonicalizes `CheckoutTerms` with RFC 8785/JCS, hashes the terms with SHA-256, and signs the same canonical bytes with ES256.

Bound later compares the submitted checkout with the merchant's authoritative stored copy and verifies both hash and signature. A changed price, item, route, merchant, or expiry does not become a new valid checkout merely because the agent sent it.

## Conformance boundary

This repository does not claim full UCP conformance. `MerchantCapabilities` and `NormalizedCheckout` are frozen local contracts that preserve the required demo semantics, but they do not yet reproduce the complete upstream UCP profile/checkout/order schemas, headers, service registry, payment handlers, or conformance suite.

Before claiming conformance, the project must at least:

1. replace or adapt the local profile to the complete versioned upstream schema;
2. expose the official UCP checkout/order wire objects and required headers;
3. implement AP2 mandate placement and verification in the official wire format;
4. pass the official schema and conformance tests for the advertised capabilities;
5. document key discovery, rotation, transport authentication, and production HTTPS behavior.

## Why keep the adapter

The normalized `CommerceProtocolAdapter` boundary lets the deterministic Bound domain remain stable while a fully conformant UCP adapter evolves. TravelBot and Verify depend on typed offers, checkout integrity, and order receipts—not on a specific transport binding.
