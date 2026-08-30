# ADR-002 — Separate commerce, authority, enforcement, and payment

- Status: Proposed
- Date: 2026-08-29
- Scope: Bound MVP and multi-protocol evolution
- Related: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-003](ADR-003-agent-identity-assurance.md), [ADR-004](ADR-004-credential-enrollment-and-external-checkout.md)

## Context

An agent purchase combines concerns that may look identical in the interface but have different actors, evidence, and lifecycles:

- commerce interoperability: capability discovery, checkout, order, and fulfillment;
- merchant recognition of the agent;
- proof that a person delegated an economic action;
- deterministic enforcement of that authority against current state;
- payment-credential resolution;
- financial processing, routing, and settlement.

Treating AP2 as a catalog and checkout protocol, or UCP as a payment rail, would couple unrelated responsibilities. Likewise, exposing the Yuno Agent Toolkit, a network token, or a wallet directly to the shopping agent would create a path around Bound.

The ecosystem does not converge on one protocol. UCP has a native AP2 extension; ACP has its own delegated-payment artifacts; Visa TAP recognizes agents over existing HTTP; Visa Intelligent Commerce provides Visa credentials and network controls; and x402 supports HTTP-native payments for APIs and digital resources.

## Decision

Bound will use a multi-protocol architecture with normalized internal models. No external protocol becomes the product's domain model.

### Layers

| Layer | Decision |
| --- | --- |
| Commerce | UCP is the P0 adapter. ACP and legacy-browser adapters may follow. |
| Agent recognition | Agent signatures are mandatory; Visa TAP may support legacy merchants later. |
| Authorization proof | AP2 is the P0 proof. Dedicated adapters may normalize Visa Payment Instructions and ACP allowances. |
| Enforcement | Bound Verify is the only function that produces `ALLOW`, `ESCALATE`, or `DENY`. |
| Credential | Yuno Vault is the P0 provider. Visa VIC is gated on access and proven interoperability. |
| Payment execution | Yuno is the P0 server-side executor after reservation. Other executors do not alter Verify. |
| Rails | Visa, Mastercard, PIX, wallets, and PSPs remain below Yuno or the selected executor. |

[ADR-004](ADR-004-credential-enrollment-and-external-checkout.md) defines mandatory enrollment, the boundary between sandbox payment and real external purchase, and the Visa VIC and Mastercard Agent Pay gates.

### P0 path

```text
TravelBot
  ↓ UCP discovery + checkout
VuelaYa
  ↓ merchant-signed checkout + AP2 extension
Bound Verify
  ↓ ALLOW + reserved authorization
Yuno Vault/Payments
  ↓
provider / network / issuer
```

VuelaYa publishes `/.well-known/ucp`, pins the `2026-08-25` UCP snapshot, and implements the Catalog, Checkout, and Order subset required by the vertical. Capability intersection negotiates `dev.ucp.common.payment.ap2_mandate` as an extension of `dev.ucp.shopping.checkout`. A protected checkout must never silently downgrade to a mandate-free flow.

### Internal contracts

```ts
interface CommerceProtocolAdapter {
  discoverProfile(merchant: URL): Promise<MerchantCapabilities>
  createCheckout(intent: PurchaseIntent): Promise<NormalizedCheckout>
  completeCheckout(input: AuthorizedCheckout): Promise<OrderReceipt>
}

interface AuthorizationProofAdapter {
  verify(proof: unknown, checkout: NormalizedCheckout): Promise<NormalizedAuthorization>
}

interface PaymentCredentialAdapter {
  resolve(reference: string, authorization: ReservedAuthorization): Promise<PaymentInstrument>
}

interface PaymentExecutor {
  pay(input: AuthorizedPayment, idempotencyKey: string): Promise<PaymentResult>
}
```

`NormalizedCheckout` preserves the merchant, items, fulfillment, amount, currency, expiration, authoritative totals, checkout hash, and protocol metadata. `NormalizedAuthorization` preserves principal, agent, merchant constraints, checkout binding, scope, amount, expiration, usage, and proof provenance.

Adapters validate schemas and cryptography before normalization. Normalization must never weaken a constraint, permissively fill missing authority, or convert an unknown rule into `ALLOW`.

### Visa legacy route

Visa TAP and Visa Intelligent Commerce complement rather than replace AP2 and Yuno in P0:

- TAP provides signed agent recognition and linked payment and consumer containers over existing HTTP;
- VIC provisions agent-specific Visa credentials, authenticates Payment Instructions, and applies network controls;
- Bound still enforces normalized policy before credential resolution;
- VIC availability, Agent Provider onboarding, and token interoperability with Yuno remain explicit spike gates.

If a VIC credential is proven compatible with Yuno's external network-token flow, Yuno may remain the executor. Until then, VIC is a separate credential and execution route for legacy Visa checkout. Marketing compatibility is not sufficient evidence of interoperability.

### ACP and x402

An ACP adapter will validate ACP's delegated proof and map it to `NormalizedAuthorization`; it will not wrap every ACP transaction in AP2 without a protocol requirement.

x402 belongs to machine-to-machine API or tool payments. If implemented, it will use a separate budget category and credential adapter. It is not the primary consumer-flight rail and does not replace Yuno.

## Alternatives considered

- **AP2 as the only protocol:** rejected because AP2 leaves catalog, checkout APIs, and the commerce lifecycle to a commerce protocol.
- **Visa as the only authority and credential system:** rejected because it would tie Bound to one network and its onboarding availability.
- **Expose Yuno Agent Toolkit directly to TravelBot:** rejected because it would bypass deterministic verification and credential isolation.
- **One universal proof envelope:** rejected because re-signing every proof as AP2 can hide semantic differences and create contradictory truth.
- **Browser automation as P0 checkout:** rejected because it is brittle, blockable, and cannot safely receive raw payment credentials.

## Consequences

### Positive

- Bound is not tied to Google, Visa, OpenAI, or one payment rail.
- UCP and AP2 provide the shortest standards-based path for the deterministic demo.
- Visa can extend reach to existing web infrastructure without contaminating P0.
- Yuno remains the primary orchestration and payment integration for the challenge.
- Protocol-specific cryptography stays isolated from policy and transaction state.

### Negative

- Normalized contracts require careful semantic mapping and versioning.
- Every adapter needs conformance, negative, and downgrade tests.
- Visa and ACP routes may duplicate AP2 controls, so precedence must be explicit.
- Some provider combinations require commercial onboarding, not only code.

## Acceptance criteria

1. P0 completes with UCP, AP2, Bound, and Yuno without a Visa dependency.
2. Bound Verify receives only normalized, schema-valid checkout and proof inputs.
3. A proof adapter cannot create broader authority than its source artifact.
4. Credential resolution happens only after a `RESERVED` authorization.
5. Visa, ACP, and x402 adapters can be disabled without changing P0.
6. A legacy browser never receives Yuno secrets, reusable vaulted tokens, or Bound signing keys.
7. Unproven vendor-token interoperability is documented as a spike, not a supported path.

## References

- [UCP overview](https://ucp.dev/specification/overview/)
- [UCP Checkout](https://ucp.dev/specification/shopping/checkout/)
- [UCP AP2 Mandates extension](https://ucp.dev/specification/payment/extensions/ap2-mandates/)
- [AP2 specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)
- [Yuno payment-method enrollment](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods)
- [Yuno network tokens](https://docs.y.uno/docs/security-and-compliance/network-tokens)
- [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/)
- [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce/overview)
- [ACP specification](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- [x402 documentation](https://docs.cdp.coinbase.com/x402/welcome)

## Reference visual

See the responsibility stack and adapter routes in [`../diagrams/bound-protocol-model.html`](../diagrams/bound-protocol-model.html), and the source-of-funds explanation in [`../payment-methods-and-purchase-routes.md`](../payment-methods-and-purchase-routes.md).
