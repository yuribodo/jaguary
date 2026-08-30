# Known implementation gaps

| Metadata | Value |
| --- | --- |
| Status | Current audit findings; no runtime behavior changed |
| Last verified | 2026-08-30 |
| Scope | Production correctness, interoperability, reliability, and documentation claims |

This register distinguishes implemented safeguards from production or interoperability work that is still missing. Severity describes impact if the current repository is deployed or presented as a complete implementation; it is not a delivery-priority label.

## High severity

### Yuno configuration never reaches the runtime executor

`loadEnv` validates and returns `env.yuno`, and a tested `YunoPaymentExecutor` exists, but [`backend/src/server.ts`](../../backend/src/server.ts) never constructs or passes it to `buildApp`. [`backend/src/build-app.ts`](../../backend/src/build-app.ts) therefore installs an always-approved `FakePaymentExecutor` whenever no executor is injected.

**Impact:** setting `YUNO_ENABLED=true` does not cause the application entry point to call Yuno. A demo can look economically successful while no provider payment occurred.

**Required work:** compose `YunoPaymentExecutor` only when enabled, implement a real credential resolver, fail closed outside explicit demo mode, add a production composition test, and finish webhook/GET reconciliation for unknown or timed-out results.

### Authority keys and authoritative checkouts are process-local

The default [`EphemeralEs256Signer`](../../backend/src/modules/vuelaya/signer.ts) generates a new key at startup. The same instance signs merchant checkouts and mandates. [`VuelaYaMerchant`](../../backend/src/modules/vuelaya/merchant.ts) stores authoritative checkouts in a private `Map`, while Verify requires an exact lookup from that map.

**Impact:** a restart changes the verification key and loses checkout state. Existing signed mandates/checkouts can no longer verify. In a multi-instance deployment, a checkout created by instance A can be denied by instance B.

**Required work:** use durable KMS/HSM-backed keys with stable `kid`, published discovery and rotation; persist authoritative checkouts in PostgreSQL; and test restart plus cross-instance verification.

### The advertised UCP/AP2 capabilities exceed the implemented wire protocol

The VuelaYa profile advertises `dev.ucp.shopping.checkout` and `dev.ucp.common.payment.ap2_mandate`, but the routes use a custom `UCP-Capabilities` header and local `MerchantCapabilities`, `NormalizedCheckout`, and `NormalizedAuthorization` schemas. They do not carry the complete official UCP profile/service registry or AP2 Checkout/Payment Mandates in SD-JWT+kb form.

**Impact:** an external UCP client can reasonably interpret discovery as a conformance claim and then fail to interoperate. The security semantics inside Bound are useful, but the public protocol claim is stronger than the implementation.

**Required work:** either advertise a clearly local/experimental capability namespace now, or implement the pinned upstream schemas, `UCP-Agent` negotiation, official mandate placement, key discovery, verifier roles, and conformance vectors before advertising the standard capabilities.

### Pending provider payments have no runtime reconciliation path

The payment state machine correctly preserves `TIMEOUT` and `UNKNOWN` as `PAYMENT_PENDING`, and the store has reconciliation primitives. The application entry point exposes no Yuno webhook consumer, polling worker, or provider lookup composition.

**Impact:** once a real provider is wired, an interrupted request can remain pending indefinitely and cannot safely converge to approved or declined state.

**Required work:** authenticate Yuno webhooks, add provider GET reconciliation with the original idempotency key/payment ID, reject state regression, and operate retries/alerts.

## Medium severity

### Multi-passenger flight searches are not party-size quotes

[`GoogleFlightsSearchProvider`](../../backend/src/modules/vuelaya/google-flights.ts) always sends `adults=1`, treats the returned price as a unit price, and VuelaYa later multiplies it by `passenger_count`.

**Impact:** the arithmetic is deterministic, but availability and fare buckets for one passenger may not be available for the complete party. The resulting checkout can claim a total that was never quoted by the provider for that passenger count.

**Required work:** query the actual passenger count and confirm whether the provider price is total or per traveler; normalize that semantic explicitly; and add two-to-nine-passenger contract tests.

### Flight timestamps encode local wall time as UTC

Google Flights returns airport-local values without an offset. The adapter preserves explicit `departure_local`/`arrival_local` fields but also creates legacy timestamps by appending `Z`.

**Impact:** downstream code can misinterpret those fields as real UTC instants, affecting duration, ordering, policy, or audit interpretation across time zones and daylight-saving changes.

**Required work:** resolve airport time zones and store an actual offset/instant, or change the contract so local wall times cannot be mistaken for UTC.

### Catalog and offer retention are process-local and only partly bounded

Search entries are capped and expire, but the remembered-offer map has no eviction. Both are local to one process.

**Impact:** long-lived/high-cardinality processes can grow memory; restarts lose offer lookup; instances have inconsistent catalogs. Flexible-month searches can also fan out into many provider calls when no day has results.

**Required work:** add bounded expiry for offers, a shared cache or durable quote store where checkout correctness needs it, request-budget protection, and metrics for provider calls/cache hit rate.

### Agent Passport signing keys rotate on every restart

[`BoundAgentPassportService.create`](../../backend/src/modules/trust/passport.ts) generates a fresh key and random `kid` in memory. Passports are short-lived, but a restart immediately invalidates all unexpired tokens and replaces the JWKS.

**Impact:** consumers see avoidable verification failures during deploys and cannot overlap old/new keys for safe rotation.

**Required work:** load a durable signing key, publish an overlapping JWKS key set, and define rotation/revocation operations.

## Lower-severity hardening

- The SerpApi adapter marks provider failures as retryable but performs no bounded retry/backoff itself.
- In-memory trust-route rate-limit buckets have no global expiry sweep and are not shared across instances.
- The OpenAI runtime retries one invalid turn, but non-rate-limit provider 4xx and unexpected tool/runtime failures can collapse into the same invalid-output fallback, reducing operator diagnosis.
- Full UCP/AP2, Yuno, Didit, and Google Flights integration tests depend mostly on mocked provider responses; real sandbox smoke checks remain operational gates rather than CI conformance tests.

## Recommended order

1. Prevent fake payments outside explicit demo/test mode and wire the selected executor.
2. Persist merchant checkout state and production signing keys.
3. Decide whether to narrow the UCP/AP2 claim or complete conformance.
4. Add payment reconciliation before any real-money pilot.
5. Correct party-size quote and time-zone semantics before selling multi-passenger travel.
6. Add shared cache/rate limiting, key rotation, and sandbox smoke coverage.
