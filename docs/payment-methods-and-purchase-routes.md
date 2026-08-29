# Payment methods, credentials and purchase routes

## Short answer

The agent does not own the user's money and does not receive a general-purpose payment tool. The money continues to come from a card, bank account or wallet selected by the user. The credential remains inside a credential provider or vault; the agent can only submit a purchase request that must pass Bound.

```text
Marta's payment method
        ↓ tokenization
Yuno Vault or network credential provider
        ↓ opaque reference
Bound server-side payment adapter
        ↑ authorization_id after ALLOW
TravelBot purchase request
```

The agent never receives PAN, CVV, a Yuno private key or a reusable `vaulted_token`.

## Enrollment is mandatory

A principal must enroll an active payment method before a financial mandate can be activated. Enrollment is performed on a provider-controlled secure surface. Bound stores only a logical credential reference, provider, sanitized display metadata and lifecycle status; it never implements its own card-entry form.

The mandate and credential must belong to the same principal. A `PENDING`, `SUSPENDED`, `REVOKED` or `EXPIRED` credential cannot activate a new mandate or create a new payable reservation. Historical evidence remains available after revocation.

See [ADR-004](adr/ADR-004-credential-enrollment-and-external-checkout.md) for the accepted enrollment and external-checkout decision.

## Responsibility by layer

| Layer | Primary technology | Question it answers | Does not do |
|---|---|---|---|
| Commerce interoperability | UCP; later ACP or legacy browser adapter | How do agent and merchant discover capabilities and perform checkout/order operations? | Authorize the human's money |
| Agent recognition | Agent signature; Visa TAP for legacy HTTP | Is this request coming from a recognized commerce agent? | Prove the complete user mandate |
| Delegated authority | AP2; later Visa Payment Instruction or ACP proof | Did the human authorize this agent and this economic action? | Move money |
| Enforcement | Bound Verify | Does the action satisfy scope, amount, expiry, revocation, usage and replay rules now? | Store card data or act as PSP |
| Credential and orchestration | Yuno Vault and Payments; later Visa VIC credential adapter | Which protected credential can be used, and how is the payment routed? | Decide the user's intent |
| Payment rail | Visa, Mastercard, PIX, wallet or provider selected by Yuno | Where does authorization and settlement occur? | Define the agent's mandate |

See the visual model in [`diagrams/bound-protocol-model.html`](diagrams/bound-protocol-model.html).

## Route A — agent-native merchant (P0)

VuelaYa is the Merchant of Record and implements the minimum UCP surface needed for the demo.

```text
1. Marta enrolls a payment method using Yuno's secure surface.
2. Yuno stores it and returns an opaque vaulted reference.
3. Marta approves an AP2 mandate in the Bound Trusted Surface.
4. TravelBot fetches VuelaYa's /.well-known/ucp profile.
5. Both sides negotiate Checkout + AP2 Mandates capabilities.
6. TravelBot creates a UCP checkout for the selected flight.
7. VuelaYa returns the authoritative checkout and merchant signature.
8. Bound verifies the AP2 proof, policy state and checkout integrity.
9. ALLOW creates a reserved, single-use authorization_id.
10. Only the server-side Yuno adapter resolves the credential and creates payment.
11. Bound seals the decision, payment result and order receipt.
```

The current UCP specification publishes machine-readable capabilities at `/.well-known/ucp`, negotiates the intersection supported by business and platform, and exposes checkout payment handlers. Its AP2 extension locks the checkout session into a protected flow: the business signs checkout terms and the platform must provide a signed mandate when completing it.

### Minimum VuelaYa contract

```text
GET  /.well-known/ucp
POST /ucp/v1/checkout
GET  /ucp/v1/checkout/{id}
PUT  /ucp/v1/checkout/{id}
POST /ucp/v1/checkout/{id}/complete
GET  /ucp/v1/orders/{id}
```

Only the subset needed for the flight vertical is implemented. The demo must not claim full UCP conformance until the official conformance suite passes.

The implementation should pin the current `2026-08-25` UCP snapshot and advertise at least `dev.ucp.shopping.checkout` plus `dev.ucp.common.payment.ap2_mandate`, with the AP2 capability extending checkout. A `dev.bound.yuno` payment handler may be advertised as our experimental adapter, but must not be described as an official Yuno UCP handler.

## Route B — legacy web checkout with Visa (experiment)

Visa provides two complementary capabilities.

### Visa Trusted Agent Protocol (TAP)

TAP adds signed HTTP messages that allow a merchant or site-protection provider to distinguish an approved commerce agent from an anonymous bot. It also defines linked consumer identity and payment containers. This helps with merchant recognition over existing web infrastructure; it does not, by itself, create a universal payment credential.

### Visa Intelligent Commerce (VIC)

VIC provisions agent-specific Visa tokens, authenticates Payment Instructions and applies network controls. Visa currently describes an initial guest-checkout/key-entry flow in which the restricted credential is used for form fill and VisaNet validates merchant and amount constraints.

```text
TravelBot + browser
        ↓ TAP signed request
Legacy Visa merchant
        ↓ checkout amount and merchant
Bound Verify
        ↓ ALLOW
Visa Intelligent Commerce
        ↓ agent-specific restricted credential
Secure checkout fill
        ↓
Merchant acquirer → VisaNet → issuer
```

This route gets closer to purchasing on existing sites, but does not mean “every website”: the site may block automation, ignore TAP, require login/CAPTCHA/3DS or operate outside the available Visa program. The Agent Provider must also satisfy Visa onboarding requirements.

VIC is described by Visa as still being developed and deployed, with availability varying by market. Treat it as a gated spike until product access, Agent Provider onboarding and credentials are confirmed. As of 2026-08-29, a generic Visa Developer sandbox project exists, but VIC displays `Product Access Required`. Sandbox data is mock data and cannot execute a production purchase.

### Mastercard Agent Pay

Mastercard Agent Pay is a second future credential/network adapter. It registers agents and uses agentic network tokens with authenticated intent. It is partner-led rather than a confirmed self-service dependency for this project. Yuno has been announced as an enabling partner for Agent Pay in Latin America, so access and supported checkout shapes should be investigated through the Yuno hackathon channel. Until an API contract, sandbox and onboarding are confirmed, it remains a gated spike rather than a supported route.

### Google AP2, UCP and Google Pay

AP2 supplies verifiable delegated authority; UCP supplies commerce interoperability for integrated merchants. Google Pay can execute checkout only on compatible merchant or Google surfaces. These components do not expose a user's saved card as a portable credential for an arbitrary browser agent. Bound adopts AP2/UCP without treating Google as the credential provider for legacy external checkout.

## How Visa and AP2 coexist

AP2 is network-agnostic evidence of delegated authority. TAP is merchant-facing agent recognition. VIC is a Visa credential and network-control product. A transaction can use them together, but Bound must avoid creating two contradictory sources of policy truth.

Recommended normalization:

```ts
type NormalizedAuthorization = {
  principalId: string
  agentId: string
  merchantId?: string
  checkoutHash: string
  amount: { value: number; currency: string }
  expiresAt: string
  maxUses: number
  proofType: "AP2" | "VISA_INSTRUCTION" | "ACP_ALLOWANCE"
  proofReference: string
}
```

For the UCP route, AP2 is the native proof. For a Visa legacy route, a Visa Payment Instruction may be an additional credential-provider/network control or, in a future adapter, the proof normalized by Bound. Bound should not silently wrap every external proof in AP2.

## Yuno and Visa network tokens

Yuno supports vaulted tokens, network tokens provisioned by Yuno and externally provided network tokens. It can also authenticate network tokens using card-network passkeys. That makes Yuno a strong primary orchestration layer for the demo.

However, documentation that both products support network tokens is not proof that a Visa Intelligent Commerce token can be passed directly to Yuno. That specific credential format, cryptogram lifecycle, merchant scope and commercial enablement must be validated with Yuno and Visa before implementation.

Decision for now:

- P0: Yuno enrolls/resolves the credential and executes the payment for VuelaYa.
- P1 spike: confirm whether Yuno can accept the credential returned by VIC and under which account/merchant scope.
- If incompatible: VIC remains a separate `CredentialProviderAdapter` for the legacy Visa route; it does not replace the P0 Yuno route.

## Where the agent can buy

| Merchant route | Discovery | Checkout | Payment | Status |
|---|---|---|---|---|
| UCP merchant + AP2 + compatible handler | Structured | UCP | Bound → Yuno | P0 |
| Direct merchant API | Structured/custom adapter | Merchant API | Bound → Yuno | Controlled fallback |
| Legacy site + browser | Live web | Browser automation | Not allowed with raw credentials | Discovery P2 |
| Legacy site + TAP + VIC | Live web + signed agent | Guest checkout | Restricted Visa credential | Gated experiment |
| Legacy site + Mastercard Agent Pay | Live web + registered agent | Existing checkout form | Restricted agentic network token | Gated experiment |
| Google/UCP eligible merchant | Structured | UCP / compatible Google surface | Google Pay on supported surface | External ecosystem, not a portable credential API |
| ACP merchant | ACP | ACP checkout | ACP proof/payment adapter | Future |
| Paid API/tool | HTTP/MCP | `402 Payment Required` | x402 wallet/facilitator | Future, not consumer-flight P0 |

## Non-negotiable security rules

1. The shopping agent receives `requestPurchase`, never an unrestricted `pay` tool.
2. Only a deterministic Bound decision can create a pagable authorization.
3. The credential is resolved after `ALLOW`, server-side or inside an isolated credential provider.
4. Revocation is checked against the latest transactional state immediately before reservation.
5. Merchant, checkout hash, amount, currency and idempotency key are bound to the authorization.
6. Browser content is untrusted and cannot change a mandate or create a payment credential.
7. A Yuno/Visa timeout remains an unknown payment state until reconciled with the same idempotency key.
8. A financial mandate cannot be activated without an `ACTIVE` credential owned by the same principal.
9. A sandbox payment, controlled-merchant order and real external purchase are labeled as different outcomes.

## Official integration documentation

### P0

- UCP: [Specification overview](https://ucp.dev/specification/overview/), [Checkout capability](https://ucp.dev/specification/shopping/checkout/), [AP2 Mandates extension](https://ucp.dev/specification/payment/extensions/ap2-mandates/), [official repository and samples](https://github.com/Universal-Commerce-Protocol/ucp)
- AP2: [Protocol specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md), [official repository and scenarios](https://github.com/google-agentic-commerce/AP2)
- Yuno: [Enroll payment methods](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods), [create a payment](https://docs.y.uno/docs/how-yuno-works/step-2-your-first-payment), [token concepts](https://docs.y.uno/docs/basic-concepts/tokens), [network tokens](https://docs.y.uno/docs/security-and-compliance/network-tokens), [connections and routing](https://docs.y.uno/reference/organizations/connections-routing-overview)

### Gated spikes and optional adapters

- Visa: [Trusted Agent Protocol specification](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/), [TAP getting started](https://developer.visa.com/capabilities/trusted-agent-protocol/docs-getting-started), [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce/overview)
- Browser: [Firecrawl Interact and live view](https://docs.firecrawl.dev/features/interact), [Browserbase agent use cases](https://docs.browserbase.com/use-cases/agents)
- ACP: [official specification repository](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- x402: [official introduction](https://docs.cdp.coinbase.com/x402/welcome), [protocol specification](https://github.com/x402-foundation/x402)
- Yuno agent surface: [Agent Toolkit](https://docs.y.uno/docs/ai-capabilities/agent-toolkit). If used, it remains inside the server-side Yuno adapter and is never exposed to TravelBot.
