# System architecture

| Metadata | Value |
| --- | --- |
| Status | Current implementation |
| Last verified | 2026-08-30 |
| Deployables | `bound-web`, `bound-api`, PostgreSQL |
| Primary code anchor | [`backend/src/build-app.ts`](../../backend/src/build-app.ts) |

[Open the architecture diagram](../diagrams/system-context.html).

## Why the system exists

Shopping agents are good at interpreting intent and navigating choices, but economic effects require deterministic control. Bound creates that control point. It turns a proposed purchase into a verified, reserved authorization before any provider receives a payment instruction.

## Runtime shape

`bound-web` is a Next.js Trusted Surface. It calls only public Bound APIs and renders durable conversation, trust, approval, and receipt state. It never receives the OpenAI key, agent private key, Didit secret, payment credential, or provider token.

`bound-api` is a Fastify modular monolith. Internal module boundaries are TypeScript ports and services rather than network calls. Keeping identity, mandates, Verify, reservations, payment transitions, and audit close to one PostgreSQL transaction boundary is deliberate: replay protection, revocation, usage limits, and concurrency must agree on one source of truth.

PostgreSQL stores durable conversations, intent snapshots, tool executions, encrypted approval interruptions, identity/trust state, mandates, nonces, authorizations, payment attempts, receipts, and audit events.

The registered agent owner and the shopping customer are different roles. TravelBot's `agents.principal_id` is its operator/trust binding; the authenticated session principal owns the conversation and is the principal on customer authority. Verify requires one agent across the proof, mandate, and authorization, and one customer across the mandate and authorization, but does not incorrectly require the agent operator to be that customer.

The [database model](database-model.md) maps all 25 tables and expands the transactional authority spine down to its selected columns and foreign keys.

## Request path

1. The browser sends a message with its opaque session, CSRF token, idempotency key, and correlation ID; the API derives the conversation owner from that session.
2. TravelBot claims the turn in PostgreSQL before calling OpenAI.
3. The model returns strict structured intent and may call only tools legal for the persisted state.
4. Application code searches Google Flights through SerpApi, normalizes short-lived offers, chooses deterministically, and asks VuelaYa for merchant-authored checkout terms.
5. The browser explicitly confirms the exact merchant, checkout hash, amount, currency, and mandate.
6. Application code activates the authority, signs the agent request, and invokes Bound Verify.
7. Verify loads current identity, trust, mandate, checkout, usage, and nonce state and applies pure ordered rules.
8. Only `ALLOW` creates a reserved authorization. Payment claims it in a short transaction, calls the executor outside the transaction, then persists the normalized result.
9. An approved result creates the order/receipt and consumes the authorization atomically. Every business transition appends audit evidence.

## Trust boundaries

- OpenAI can interpret text and suggest a tool call; it cannot commit authority or payment state.
- Didit can provide operator identity or biometric evidence; it cannot decide a purchase.
- VuelaYa can author checkout economics; it cannot claim that the principal approved them.
- The browser can request and confirm; it cannot provide authoritative price, signature, payment amount, or credential material.
- The payment executor can execute only the persisted authorization passed by `PaymentService`.

## Failure behavior

The system fails closed for unknown agent state, stale or invalid signatures, inactive mandates, mismatched checkout bindings, exceeded limits, replay, missing required trust, and stale approval state. OpenAI or Didit unavailability never turns unknown state into valid authority. Payment timeout/unknown remains `PAYMENT_PENDING` for reconciliation with the same provider idempotency key.

## Code map

| Concern | Code |
| --- | --- |
| Composition root | [`backend/src/build-app.ts`](../../backend/src/build-app.ts) |
| Public frontend client | [`frontend/src/lib/bound-api.ts`](../../frontend/src/lib/bound-api.ts) |
| TravelBot orchestration | [`backend/src/modules/travelbot/service.ts`](../../backend/src/modules/travelbot/service.ts) |
| Google Flights search adapter | [`backend/src/modules/vuelaya/google-flights.ts`](../../backend/src/modules/vuelaya/google-flights.ts) |
| Merchant and checkout signing | [`backend/src/modules/vuelaya/merchant.ts`](../../backend/src/modules/vuelaya/merchant.ts) |
| Deterministic policy | [`backend/src/modules/verify/policy.ts`](../../backend/src/modules/verify/policy.ts) |
| Transactional reservation | [`backend/src/modules/verify/store.ts`](../../backend/src/modules/verify/store.ts) |
| Payment state machine | [`backend/src/modules/payments/service.ts`](../../backend/src/modules/payments/service.ts) |
| Audit and receipts | [`backend/src/modules/ledger/`](../../backend/src/modules/ledger/) |
