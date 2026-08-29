# Backend MVP delivery plan

GitHub tracking: [Backend MVP project](https://github.com/users/yuribodo/projects/2) · [Backend MVP milestone](https://github.com/yuribodo/jaguary/milestone/1) · [tracking epic #1](https://github.com/yuribodo/jaguary/issues/1)

## Outcome

The backend MVP is complete when the team can run this deterministic circuit end to end:

```text
Marta creates and signs a mandate
  → TravelBot selects a VuelaYa offer
  → VuelaYa creates a signed UCP checkout
  → Bound verifies and reserves authority atomically
  → Yuno sandbox executes the payment
  → VuelaYa creates one order
  → Bound returns a receipt and audit trail

Marta revokes the same mandate
  → TravelBot requests another valid purchase
  → Bound returns DENY mandate_revoked
  → no Yuno request is created
```

P0 must remain runnable with deterministic fixtures and a fake payment executor. External web discovery, browser automation, Visa integrations, ACP and x402 are outside the release gate.

## Engineering principles

1. **Fail closed:** missing, malformed or unknown proof and policy data produces `DENY`.
2. **One transactional authority source:** PostgreSQL owns mandate state, revocation, nonce, reservations and usage.
3. **No payment bypass:** only a reserved `authorization_id` can reach a payment executor.
4. **No credential exposure:** agents, merchants, logs and frontend payloads never receive PAN, CVV or reusable Yuno tokens.
5. **Deterministic decisions:** Verify performs no LLM or network call and returns stable reason codes.
6. **Idempotent money movement:** all payment attempts for one authorization reuse one key.
7. **Observable proof:** every business transition writes a correlated audit event.

## Target backend modules

The MVP remains one Fastify deployable with internal module boundaries:

```text
backend/src/
  contracts/       versioned domain and HTTP schemas
  db/              PostgreSQL client, migrations and repositories
  identity/        agent keys and signature verification
  mandates/        AP2-shaped mandate lifecycle
  merchant/        VuelaYa UCP profile, offers, checkout and order
  verify/          pure policy engine and transactional reservation
  payments/        PaymentExecutor, fake adapter and Yuno adapter
  ledger/          append-only audit events and receipts
  scenarios/       deterministic demo reset and adversarial fixtures
```

Modules communicate through typed ports. They do not call one another through HTTP inside the monolith.

## Contracts to freeze first

The first merge freezes and versions:

- money as integer minor units plus ISO currency;
- `NormalizedCheckout` and its canonical hash input;
- `NormalizedAuthorization` and AP2 proof envelope;
- `Decision = ALLOW | DENY | ESCALATE` and stable reason codes;
- mandate and authorization state machines;
- `CommerceProtocolAdapter`, `AuthorizationProofAdapter` and `PaymentExecutor`;
- error envelope, correlation ID and `Idempotency-Key` behavior;
- UTC/RFC 3339 timestamps and signed-payload canonicalization.

No workstream creates private competing representations for these concepts.

## Delivery phases

### Phase 0 — foundation and contracts

Goal: unblock parallel development without creating incompatible domain shapes.

- Freeze shared contracts, schemas, errors and endpoint conventions.
- Add PostgreSQL, migrations, test database and repository transaction boundary.
- Add configuration validation, redacted structured logging and API documentation.

Exit: CI can migrate a clean database and contract tests pass without external services.

### Phase 1 — deterministic local vertical

Goal: complete the entire purchase with VuelaYa fixtures and fake payment.

- Register TravelBot identity and verify signed requests.
- Seed a sanitized active logical payment credential owned by Marta; mandate activation fails when the reference is missing, inactive or owned by another principal.
- Implement mandate creation, activation, expiry, consumption and revocation.
- Publish the minimum VuelaYa UCP profile and deterministic flight fixtures.
- Create and sign authoritative checkouts.
- Implement the pure policy engine with stable reason codes.
- Reserve usage atomically and block replay or concurrent double spend.
- Execute through a fake `PaymentExecutor` with the final Yuno-facing contract.

Exit: happy path creates one fake payment and one order; revoked, over-limit, expired, wrong-agent, tampered-checkout and replay paths create no payment.

### Phase 2 — Yuno and evidence

Goal: replace fake execution with Yuno sandbox without changing domain contracts.

- Enroll a sandbox payment method through a Yuno-controlled secure surface and retain only an active logical credential reference outside the adapter.
- Implement the server-side Yuno client, normalized errors and idempotency.
- Model `RESERVED → PAYMENT_PENDING → CONSUMED | FAILED` and reconcile unknown outcomes.
- Produce correlated append-only audit events, receipt hashes and proof that Yuno was or was not called.

Exit: one authorized request creates one Yuno sandbox payment and one order; timeout/retry cannot create a second charge.

### Phase 3 — release hardening

Goal: make the demo reproducible and safe to integrate with the frontend.

- Add one-command reset and seed for Marta, TravelBot, mandates, offers and credentials.
- Add the complete adversarial and concurrency suite.
- Publish API examples and a machine-readable contract for frontend integration.
- Add a degraded demo mode using deterministic fixtures when Yuno is unavailable.
- Run three consecutive end-to-end rehearsals without manual database edits.

Exit: all release-gate scenarios pass and logs contain no sensitive credentials.

## Backlog and ownership

| ID | Deliverable | Workstream | Depends on |
| --- | --- | --- | --- |
| [BE-00](https://github.com/yuribodo/jaguary/issues/1) | Backend MVP tracking epic | Integration | — |
| [BE-01](https://github.com/yuribodo/jaguary/issues/2) | Freeze domain contracts and HTTP conventions | Trust Core | — |
| [BE-02](https://github.com/yuribodo/jaguary/issues/3) | PostgreSQL, migrations and transaction test harness | Platform | BE-01 |
| [BE-03](https://github.com/yuribodo/jaguary/issues/4) | Agent identity registry and signature verification | Trust Core | BE-01, BE-02 |
| [BE-04](https://github.com/yuribodo/jaguary/issues/5) | AP2-shaped mandate lifecycle and revocation API | Trust Core | BE-01, BE-02 |
| [BE-05](https://github.com/yuribodo/jaguary/issues/6) | VuelaYa UCP profile, offers and signed checkout | Merchant + UCP | BE-01 |
| [BE-06](https://github.com/yuribodo/jaguary/issues/7) | Pure Bound Verify policy engine | Trust Core | BE-01, BE-03, BE-04, BE-05 |
| [BE-07](https://github.com/yuribodo/jaguary/issues/8) | Atomic authorization reservation, usage and replay protection | Trust Core | BE-02, BE-06 |
| [BE-08](https://github.com/yuribodo/jaguary/issues/9) | Payment port and deterministic fake executor | Payments | BE-01, BE-07 |
| [BE-09](https://github.com/yuribodo/jaguary/issues/10) | Yuno sandbox credential and payment adapter | Payments | BE-08 |
| [BE-10](https://github.com/yuribodo/jaguary/issues/11) | Payment state machine, idempotency and reconciliation | Payments | BE-02, BE-09 |
| [BE-11](https://github.com/yuribodo/jaguary/issues/12) | Audit ledger, evidence and receipts | Trust Core | BE-02, BE-07, BE-10 |
| [BE-12](https://github.com/yuribodo/jaguary/issues/13) | End-to-end scenarios, observability and demo reset | Quality | BE-03 through BE-11 |

The critical path is:

```text
BE-01 → BE-02 → BE-04 → BE-06 → BE-07 → BE-08 → BE-09 → BE-10 → BE-12
```

BE-03 and BE-05 can proceed in parallel after contracts freeze. BE-11 can begin with the database event contract and integrate payment events after BE-10.

## Initial API surface

```text
POST   /agents
GET    /agents/:id

POST   /mandates
POST   /mandates/:id/activate
POST   /mandates/:id/revoke
GET    /mandates/:id

GET    /.well-known/ucp
GET    /merchant/flights
POST   /merchant/checkouts
GET    /merchant/checkouts/:id

POST   /verify
POST   /authorizations/:id/pay
GET    /authorizations/:id

GET    /receipts/:id
GET    /audit/:correlationId

POST   /demo/reset       development and test only
```

Endpoint names may be refined in BE-01, but the authority and payment boundaries must remain unchanged.

## MVP release gate

All conditions below are mandatory:

- [ ] a valid mandate and checkout produce exactly one order and one sandbox payment;
- [ ] revocation is observed on the next verification and Yuno is not called;
- [ ] two concurrent verifies for a single-use mandate reserve at most once;
- [ ] replaying verify or pay cannot create another payment;
- [ ] tampering with amount, currency, items or merchant invalidates the checkout;
- [ ] an expired mandate or wrong agent fails closed with a stable reason code;
- [ ] a Yuno timeout remains `PAYMENT_PENDING` until reconciliation with the same key;
- [ ] frontend and merchant payloads contain only logical or masked credential references;
- [ ] structured logs correlate mandate, checkout, authorization, payment and order;
- [ ] deterministic fallback works without external web discovery or Visa access;
- [ ] three consecutive demo rehearsals pass without manual state repair.

## Deliberately deferred

- Firecrawl or Browserbase live discovery;
- Visa Trusted Agent Protocol and Visa Intelligent Commerce;
- ACP and x402 adapters;
- generalized multi-merchant UCP conformance;
- split payments, refunds and production PCI/KMS hardening;
- microservices or independent serverless functions.

These can be tracked after the P0 project reaches the release gate.
