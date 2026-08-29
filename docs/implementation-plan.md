# Implementation plan and team workstreams

## Target outcome

The first complete vertical must demonstrate:

```text
Marta → UCP/AP2 mandate → TravelBot → VuelaYa UCP checkout
      → Bound Verify/reserve → Yuno payment → order + receipt

Marta revokes → same valid offer → Bound DENY → Yuno not called
```

Everything else is optional until this circuit is deterministic, rehearsed and observable.

## Suggested team split

Replace role names with actual people during kickoff. One person may own more than one workstream in a small team, but every deliverable must have exactly one directly responsible owner.

| Workstream | Owner profile | Primary deliverables | Depends on |
|---|---|---|---|
| A — Trust Core | Backend/security engineer | mandate model, signatures, Verify, reservations, revocation, replay, ledger | Shared contracts |
| B — Merchant + UCP | Backend/commerce engineer | VuelaYa profile, catalog fixture, checkout/order lifecycle, merchant signing | Shared contracts |
| C — Payments + Yuno | Payments/backend engineer | enrollment, token reference, Yuno adapter, idempotency, webhook/reconciliation | Authorization contract |
| D — Agent + Product UI | Full-stack/agent engineer | Trusted Surface, TravelBot tools, candidate selection, live status, receipts | Merchant and Verify contracts |
| E — Quality + Demo | Product/QA engineer | adversarial matrix, fixtures, observability, demo script, fallback mode | All tracks incrementally |

The Trust Core owner is the integration lead for transaction semantics. The Demo owner is the release lead and can reject a WOW feature that destabilizes P0.

## Shared contracts to freeze first

These types unblock all workstreams and should be reviewed before implementation begins:

```ts
interface CommerceProtocolAdapter {
  discoverProfile(merchant: URL): Promise<MerchantCapabilities>
  createCheckout(input: PurchaseIntent): Promise<NormalizedCheckout>
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

`NormalizedCheckout`, `NormalizedAuthorization`, `Decision`, `ReservedAuthorization`, money units and error codes must be versioned. No workstream may invent a second shape privately.

## Delivery stages

### Stage 0 — access and contract freeze

Suggested timebox: half a day.

Parallel tasks:

- A defines the canonical authorization and state-transition contracts.
- B validates and pins the UCP `2026-08-25` profile/checkout schemas and selects the minimum subset.
- C validates Yuno sandbox credentials, account IDs, enrollment and payment endpoints.
- D sketches the Trusted Surface and agent tool boundary.
- E creates the shared environment checklist and redacts sample secrets.

Exit criteria:

- sandbox/access status is visible for Yuno, Visa and browser tools;
- P0 does not depend on Visa or an external website;
- shared types and endpoint names are approved;
- missing access has an owner and fallback.

### Stage 1 — deterministic skeleton

Suggested timebox: one day.

#### Workstream A

- Implement mandate persistence and `DRAFT → ACTIVE → REVOKED/EXPIRED/CONSUMED`.
- Implement pure `evaluate()` with stable reason codes.
- Add transactionally reserved authorization and unique replay keys.

#### Workstream B

- Publish `/.well-known/ucp` for VuelaYa with Checkout and `dev.ucp.common.payment.ap2_mandate` capabilities.
- Implement deterministic flight fixtures and UCP checkout create/get/update.
- Sign the authoritative checkout and validate totals.

#### Workstream C

- Create Yuno customer/payment-method enrollment spike.
- Store only provider, lifecycle status, masked display metadata and the logical credential reference outside the Yuno adapter.
- Ensure a financial mandate cannot be activated unless the referenced credential is `ACTIVE` and owned by the same principal.
- Build a fake `PaymentExecutor` with the exact future Yuno contract.

#### Workstream D

- Build payment-method enrollment/selection before mandate review and the TravelBot `findOffers`/`requestPurchase` tools.
- Display decision steps from reason codes rather than generated explanations.

#### Workstream E

- Automate happy path plus revoked, over-limit and replay fixtures.
- Add correlation IDs across mandate, checkout, authorization, payment and order.

Exit criteria: a full local purchase works with fake payment, and revocation prevents creation of a pagable authorization.

### Stage 2 — real P0 vertical

Suggested timebox: one to two days.

- B finishes UCP completion and order receipt.
- C swaps fake payment for Yuno sandbox and implements idempotency/reconciliation.
- A binds the AP2 checkout proof to the merchant-signed checkout and seals the audit chain.
- D connects the complete UI and shows `Yuno called: yes/no` from backend evidence.
- E runs the complete adversarial suite after every integration merge.

Exit criteria:

1. one valid mandate produces one Yuno sandbox payment and one order;
2. concurrent/replayed requests produce no second payment;
3. revocation before Verify produces `DENY mandate_revoked` and no Yuno request;
4. changed price or checkout signature produces `DENY checkout_integrity_failure`;
5. no log or browser payload contains PAN, CVV or reusable token.

### Stage 3 — demo hardening

Suggested timebox: one day.

- Add a resettable deterministic demo dataset.
- Add timeout simulation and payment reconciliation with the same idempotency key.
- Record audit timeline and receipt hashes.
- Rehearse offline/degraded mode using VuelaYa and fake-Yuno response fixtures.
- Freeze UI copy and capture a backup video only after the live path passes.

Exit criteria: three consecutive rehearsals complete without manual database edits.

### Stage 4 — WOW tracks, strictly gated

Run only after Stage 3 passes. These spikes can happen in parallel and remain behind feature flags.

#### 4A — Firecrawl live discovery

Owner: D, reviewed by A.

- Search/scrape/interact through `DiscoveryPort`.
- Return candidate URL, price, provenance and live-view URL.
- End at `requestPurchase`; never expose a payment tool or secret to the browser.

#### 4B — Visa TAP recognition

Owner: B or security engineer.

- Produce and verify TAP-shaped HTTP message signatures in a controlled merchant.
- Demonstrate recognized-agent versus anonymous-bot behavior.
- Do not claim Visa approval/certification unless real onboarding is complete.

#### 4C — Visa Intelligent Commerce credential

Owner: C.

- Confirm Visa sandbox access and Agent Provider requirements.
- Validate Payment Instruction, credential retrieval and guest-checkout constraints.
- Ask Yuno whether VIC tokens are accepted as externally provided network tokens and which merchant/account scope applies.
- Keep this route separate until interoperability is proven end to end.

#### 4D — ACP/x402 adapters

Owner: B/C, future only.

- ACP maps its native delegated proof to `NormalizedAuthorization`; do not force AP2.
- x402 is restricted to paid APIs/tools and its own budget class; it is not the flight payment rail.

## Merge and integration order

1. Shared schemas and fixtures.
2. Trust Core and VuelaYa independently against contract tests.
3. Fake payment vertical.
4. Yuno sandbox adapter.
5. Trusted Surface and TravelBot orchestration.
6. Adversarial/reconciliation suite.
7. WOW adapters behind disabled-by-default flags.

Every merge into the demo branch must keep the deterministic VuelaYa fallback runnable.

## Definition of Done by workstream

### A — Trust Core

- Pure policy tests cover all decision codes.
- Database tests prove one-use and aggregate-limit concurrency invariants.
- Revocation, expiry, nonce and checkout signature are fail-closed.

### B — Merchant + UCP

- Profile and responses validate against the selected UCP release schemas.
- Checkout total and merchant authorization are deterministic and signed.
- Completion is idempotent and produces one order.

### C — Payments + Yuno

- Credential is enrolled without passing raw data through agent code.
- Payment is accepted only with a valid `authorization_id`.
- Timeout, webhook and reconciliation reuse one idempotency key.
- Secrets and tokens are absent from logs, receipts and frontend payloads.

### D — Agent + Product UI

- Agent tools cannot call Yuno or mutate a mandate.
- User sees agent, merchant, amount, scope and decision reasons.
- Revocation is available from the mandate detail view.

### E — Quality + Demo

- Happy, revoked, over-limit, expired, wrong-agent, tampered-checkout and replay cases are one-command scenarios.
- Dashboard or structured logs prove whether Yuno was called.
- Demo script includes recovery for external service failure.

## Integration documentation checklist

The canonical links and scope notes live in [`payment-methods-and-purchase-routes.md`](payment-methods-and-purchase-routes.md). Owners should pin protocol/schema versions in code and record any vendor-specific sandbox prerequisite in the project issue tracker. A marketing page is not sufficient evidence for an API contract; implementation decisions require official specification or API documentation.
