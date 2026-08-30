# AP2 and Bound authorization

| Metadata | Value |
| --- | --- |
| Status | AP2-aligned normalized subset implemented |
| Purpose | Prove and enforce that an agent may perform an exact economic action |
| Primary code | [`backend/src/modules/verify/orchestrator.ts`](../../backend/src/modules/verify/orchestrator.ts) |

[Open the AP2/Bound authorization sequence](../diagrams/ap2-bound-sequence.html).

## What AP2 is for

Agent Payments Protocol (AP2) uses signed mandates to connect human intent, an agent, a merchant checkout, and payment evidence. UCP answers “how do the parties perform commerce?” AP2 answers “what cryptographic authority allows this agent to complete this checkout and payment?”

The upstream AP2 specification distinguishes Checkout and Payment Mandates and requires deterministic verification even when a shopping agent is LLM-driven. See the [AP2 specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md) and the [UCP AP2 extension](https://ucp.dev/specification/payment/extensions/ap2-mandates/).

## Bound's current authority model

An active mandate binds:

- principal and agent;
- allowed merchant IDs/categories;
- flight route and cabin;
- per-purchase and aggregate money limits;
- maximum uses and validity window;
- a logical payment credential reference;
- canonical terms hash and ES256 principal signature.

The TravelBot purchase path additionally creates a `NormalizedAuthorization` with `proof_type: "AP2"`, the exact `checkout_hash`, allowed merchant, amount ceiling, expiry, uses, and a stable proof hash. The agent signs the complete Verify request envelope, which also binds method, route, body hash, key, build fingerprint, time window, and nonce.

## Authorization sequence

1. VuelaYa creates and signs an exact checkout.
2. Bound prepares a one-use mandate scoped to that merchant, route, cabin, budget, validity, and credential reference.
3. The Trusted Surface shows the selected offer and requires explicit confirmation bound to merchant, checkout hash, amount, currency, and mandate.
4. Application code activates the mandate. If configured, biometric consent must be verified and consumed in the activation transaction.
5. TravelBot rebuilds the authoritative checkout and rejects any stale binding.
6. Bound Verify authenticates the signed agent request and loads current agent, trust, mandate, checkout, usage, and nonce state.
7. Pure ordered policy returns `ALLOW`, `DENY`, or `ESCALATE` with stable reason codes.
8. Only `ALLOW` atomically consumes the nonce and creates a `RESERVED` authorization. `DENY` and `ESCALATE` create no payable authorization.
9. `PaymentService` claims that reservation, calls the executor with a stable provider idempotency key, and persists the result.
10. Approval consumes the authorization and creates the receipt; a timeout/unknown result stays pending; terminal decline fails and releases the appropriate state.

## Rules enforced by Verify

The policy checks agent status/signature, request time, trust requirements, mandate status/signature/validity, agent and principal binding, merchant scope, route/cabin scope, checkout signature/hash, amount/currency, aggregate and usage limits, human escalation, and replay. Unknown or malformed evidence fails closed.

## AP2 versus Bound

AP2 is the interoperable mandate/evidence protocol. Bound is the policy enforcement and transactional reservation implementation. Bound adds operational controls that remain necessary around a wire protocol: current revocation reads, concurrency locks, nonce uniqueness, idempotency, payment state transitions, and correlated audit events.

## Conformance boundary

The code currently implements AP2 semantics through local Zod contracts and ES256/JCS proofs. It does not yet issue and verify the complete upstream `dc+sd-jwt`/SD-JWT+kb Checkout and Payment Mandates in their official UCP placements. Therefore the accurate claim is “AP2-aligned normalized subset,” not “full AP2 implementation.”

Closing that gap requires version-pinned upstream schemas, mandate `vct` handling, selective disclosure/key binding, official checkout/payment mandate placement, verifier-role tests, receipt artifacts, key discovery/rotation, and conformance vectors.

## AP2 is not “P2”

AP2 is a protocol name. Some historical planning files also use `P2` as a delivery priority for the TravelBot/merchant-mock milestone. Those are unrelated concepts.
