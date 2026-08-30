# ADR-001 — Transactional architecture for the Bound MVP

- Status: Proposed
- Date: 2026-08-29
- Scope: Yuno × Nauta NextWave 2026 hackathon
- Origin: `Bound — Product Requirements.pdf`, version 0.1

## Context

Bound must answer one question verifiably: “may this agent, representing this person, execute this exact purchase now?” The answer precedes payment and must remain independent of the mechanism Yuno uses to process it.

Four requirements dominate the MVP architecture:

1. financial decisions are deterministic and do not depend on an LLM;
2. revocation, aggregate limits, frequency, nonces, and replay protection use the latest state;
3. concurrent authorization cannot exceed limits or create duplicate charges;
4. the agent never receives PAN, CVV, or a Yuno `vaulted_token`.

The demo presents an autonomous flight purchase. Inventory, merchant, and prices may be simulated; agent signatures, mandate state, revocation, verification, Yuno integration, and the audit trail must be real within sandbox constraints.

## Decision drivers

- Deliver a working vertical within hackathon time.
- Fail closed on ambiguous state, signatures, or payment responses.
- Make trial-by-fire cases repeatable and easy to explain.
- Avoid distributed concurrency where local atomicity solves the problem.
- Preserve clear ports for AP2, persistence, signing, and Yuno.
- Maintain a production evolution path without claiming that the MVP is PCI compliant.

## Decision

Implement Bound as a transactional modular monolith in TypeScript, with an HTTP API, a pure authorization core, PostgreSQL as the source of truth, and an isolated Yuno adapter behind reserved authorization.

The initial deployment has two artifacts:

- `bound-web`: Trusted Surface and merchant and audit views;
- `bound-api`: one process containing `identity`, `mandates`, `checkouts`, `verify`, `payments`, and `ledger`.

The code may live in a monorepo, but `bound-api` remains one deployable for the MVP. Module boundaries are internal interfaces, not network calls.

### Reference stack

- TypeScript in the frontend and backend.
- Next.js for the Trusted Surface and demo views.
- Fastify for the HTTP API.
- PostgreSQL for transaction state, nonces, reservations, and audit.
- `jose` for ES256 JWS and JWT, and `zod` for schema validation.
- The VuelaYa demo merchant publishing `/.well-known/ucp` and the UCP Catalog, Checkout, and Order subset required by P0.
- Firecrawl Search, Scrape, and Interact behind `DiscoveryPort` for the P2 live browser.
- A direct Yuno HTTP client behind `YunoPaymentPort`; TravelBot never receives the Agent Toolkit.
- `SignerPort` with a local development key during the hackathon and KMS or HSM in production.

Exact versions belong in the project lockfile, not this ADR.

### Boundaries and modules

| Module | Responsibility | Must not |
| --- | --- | --- |
| Trusted Surface | Display structured policy and capture human consent | Authorize silently or expose payment secrets |
| Identity | Register public keys and validate agent signature and state | Accept identity declarations without cryptographic proof |
| Mandates | Create, sign, read, expire, and revoke AP2 mandates | Change an already signed mandate |
| Discovery | Find offers and optionally operate a live browser session | Authorize, sign checkout, or possess payment tools or credentials |
| Checkouts | Validate merchant signatures and calculate canonical hashes | Trust prices or items supplied only by the agent |
| Verify | Apply pure rules and return `ALLOW`, `ESCALATE`, or `DENY` | Call an LLM or Yuno while evaluating |
| Authorization Store | Serialize nonces, limits, reservations, and consumption | Use an eventually consistent cache as authority |
| Yuno Adapter | Resolve internal references, invoke Yuno, and normalize results | Return `vaulted_token` to the agent or merchant |
| Ledger | Record append-only, hash-chained events | Claim to be a blockchain or external immutability proof |

### Authorization path

1. The Trusted Surface turns intent into a structured proposal. An LLM may assist only with interpretation.
2. The person reviews every deterministic field and confirms. The backend signs and persists AP2 mandates.
3. The agent receives the proof, discovers VuelaYa's UCP capabilities in P0 or finds an offer through `DiscoveryPort` in P2, and sends only intent to the merchant.
4. The merchant creates a closed UCP checkout with its ID, items, amount, currency, relevant metadata, and the cryptographic authorization required by the negotiated AP2 extension.
5. `POST /verify` validates schemas, agent signature, mandate binding, checkout signature and hash, time window, revocation, scope, limits, frequency, and replay.
6. On `ALLOW`, the same PostgreSQL transaction records the nonce and creates a `RESERVED` authorization. Limits count `RESERVED`, `PAYMENT_PENDING`, and `CONSUMED` authorization.
7. `POST /authorizations/:id/pay` atomically moves the authorization to `PAYMENT_PENDING` and calls Yuno outside the database transaction with a stable idempotency identity.
8. Confirmed success moves the authorization to `CONSUMED` and seals receipts. Terminal failure moves it to `FAILED` and releases the reservation. An unknown response remains `PAYMENT_PENDING` until reconciliation.
9. Every transition writes its audit event in the same commit as the business-state change.

`ESCALATE` does not create payable authorization. “Approve once” creates a short-lived, single-use mandate bound to the checkout and runs verification again.

### Discovery and the live browser

Discovery is replaceable and is not a Bound domain dependency:

```ts
interface DiscoveryPort {
  findOffers(query: OfferQuery): Promise<OfferCandidate[]>
}
```

P0 reads VuelaYa's UCP profile and controlled catalog. P2 may use Firecrawl to return structured candidates, source URLs, provenance, and `liveViewUrl`. A browser may navigate and fill a merchant interface, but its final action is `requestPurchase(candidate)`, which creates intent and forces the merchant to produce signed checkout terms.

The browser runtime never receives Yuno secrets, resolvable credentials, signing keys, database write access, `YunoPaymentPort`, a `pay()` tool, or authority to turn page content into approved policy. Web text, DOM, and instructions are untrusted data. The adapter applies strict schemas, demo-domain allowlists, step and time limits, session cleanup, and source evidence.

Browserbase and Stagehand are the primary fallback if Firecrawl is not stable enough. Parallel remains a future search and extraction option. Swapping discovery adapters does not change Bound, AP2, merchant checkout, or Yuno.

### Yuno integration and Agent Toolkit

Exposing the Yuno Agent Toolkit directly to TravelBot would create a payment route outside the gate. Only the server-side Yuno Adapter owns Yuno credentials and invokes Payments after receiving reserved authorization. If used, the toolkit remains inside that module with action filtering and no shopping-agent access.

### Deterministic function

The core has no I/O:

```ts
evaluate({
  agent,
  mandate,
  checkout,
  now,
  usage,
  nonceStatus,
}): Decision
```

All input is loaded and normalized first. Rules run in stable order and return explicit codes such as `invalid_agent_signature`, `mandate_revoked`, `checkout_integrity_failure`, `aggregate_limit_exceeded`, and `replay_detected`. Missing, invalid, or unknown rules produce `DENY`, never permissive coercion.

### Concurrency, replay, and idempotency

- Nonces are unique per agent or mandate according to the adopted AP2 envelope.
- Mandates are locked during reservation with `SELECT … FOR UPDATE` or equivalent compare-and-swap.
- Any change to a signed checkout invalidates its canonical hash.
- Each authorization can perform only one valid payment transition at a time.
- Yuno retries use the same persisted idempotency identity.
- No database transaction remains open during an external Yuno call.
- A Yuno timeout is unknown state, not failure; the authorization remains `PAYMENT_PENDING` until reconciliation.

### Credentials and keys

The database stores a logical `credential_id` and a protected mapping to the Yuno token. Public APIs, logs, and receipts use only the logical reference and masked data. Only the Yuno adapter may resolve the token.

Hackathon secrets may come from environment variables protected by the platform secret store. Production requires envelope encryption for mappings and KMS or HSM for signing keys. The MVP is not presented as a complete PCI implementation.

### Audit

`AuditEvent` is append-only and contains a canonical payload, `previous_hash`, and `event_hash`. Chains are scoped per transaction or authorization to avoid a global lock. This detects later changes within a chain but cannot stop a fully privileged operator from rewriting the database and hashes. Production requires periodic export to immutable storage or external signatures.

## Additional state model

```text
Authorization.status = RESERVED | PAYMENT_PENDING | CONSUMED | FAILED | CANCELLED
Authorization.reserved_amount
Authorization.expires_at
Authorization.yuno_idempotency_key

Mandate.reserved_uses
Mandate.reserved_spend
```

Reserved mandate fields could be derived from active authorizations, but materializing them in the same transaction makes MVP invariants explicit.

## APIs and contracts

- Every mutable endpoint accepts `Idempotency-Key`.
- `POST /verify` returns `decision`, `reasons[]`, `policy_version`, `evidence_hash`, and `authorization_id` only when reserved.
- `POST /authorizations/:id/pay` requires the same merchant and checkout that were verified.
- Dates use RFC 3339 UTC; money uses integer minor units with an explicit currency.
- Signed payloads use defined, versioned canonical serialization.
- Structured logs contain IDs and hashes, never tokens or raw card data.

## Alternatives considered

- **Microservices and event streaming from day one:** rejected because distributed consistency would be introduced exactly where revocation, replay, and limits need atomicity.
- **Independent serverless functions per endpoint:** not selected because cold starts, observability, and concurrency coordination add demo risk without domain value.
- **LLM or probabilistic-score evaluation:** rejected because it cannot provide repeatability, stable reason codes, or fail-closed behavior.
- **Keep SQL open during a Yuno call:** rejected because long locks and uncertain external outcomes harm availability.
- **Consume authority permanently at `ALLOW`:** not selected because terminal payment failure would waste the mandate; reservation can safely release capacity.
- **Blockchain audit:** rejected because an append-only hash chain meets MVP evidence needs with much less complexity.
- **Parallel or Exa as primary discovery:** deferred because search and extraction alone do not provide the visible browser interaction intended for P2.
- **Browserbase or Stagehand as the primary runtime:** retained as a technical fallback.

## Consequences

### Positive

- Revocation and limits use one consistent source.
- Concurrency, split-payment, and replay behavior have testable invariants.
- The critical path is straightforward to instrument and demonstrate.
- Live browsing adds demo impact without becoming a payment requirement.
- AP2 and Yuno remain behind replaceable ports.
- Ledger evidence and decision codes make every payment explainable.

### Negative and risks

- The API process is a single failure domain for the MVP.
- PostgreSQL is critical and requires migrations and backups.
- Abandoned reservations and unknown payments require reconciliation.
- Local keys and the hackathon hash chain are weaker than KMS, HSM, and WORM storage.
- The AP2 implementation may cover only the vertical's subset and must not claim full conformance.
- Real sites can change, block automation, or inject instructions, so P0 does not depend on them.

## Acceptance criteria

1. Two concurrent verification requests for a single-use mandate create at most one `RESERVED` authorization.
2. Repeated nonces, authorizations, or idempotency keys do not create a new charge.
3. A revoked mandate produces `DENY mandate_revoked` on the next confirmed read.
4. A modified signed checkout produces `DENY checkout_integrity_failure`.
5. A key different from the registered agent key produces `DENY invalid_agent_signature`.
6. Split attempts count both reservations and consumed spend.
7. Logs, responses, and events never contain PAN, CVV, or `vaulted_token`.
8. Every authorization and payment transition has a valid hash-chained audit event.
9. Yuno timeout neither releases the reservation nor retries with a new key.
10. The PRD's A–H cases pass deterministically.
11. Malicious page content cannot call Yuno, change a mandate, or sign a checkout.
12. The complete demo runs through VuelaYa when Firecrawl is unavailable.

## Delivery priority

| Priority | Deliverable | Cut line |
| --- | --- | --- |
| P0 | UCP → AP2 → Verify → revocation → Yuno → receipt through VuelaYa | Mandatory and independent of the external web |
| P1 | Agent Passport, HITL, and adversarial matrix | After all P0 invariants pass |
| P2 | TravelBot selecting a controlled merchant offer | Real agent, controlled environment |
| P2 WOW | Firecrawl Interact and live view behind `DiscoveryPort` | Only if it does not weaken P0 |
| P3 | Parallel or Exa for broader search and provenance | Optional |
| P4 | Arbitrary human-site checkout | Outside the hackathon |

## Evolution plan

Extract services only after proven operational need. Yuno reconciliation through a worker and outbox is the first candidate. Identity and Verify remain together while decisions depend on transactional mandate, revocation, nonce, and usage reads. Production also needs KMS or HSM, a secret manager, rate limiting, immutable audit storage, signed Yuno webhooks, and a formal retention policy.

[ADR-002](ADR-002-commerce-protocol-layering.md) records the separation between UCP, AP2, Visa TAP and VIC, Bound, Yuno, and payment rails. The workstream plan is in [`../implementation-plan.md`](../implementation-plan.md).

## Reference visual

See the approved path and trust boundaries in [`../diagrams/bound-technical-architecture.html`](../diagrams/bound-technical-architecture.html), and the multi-protocol model in [`../diagrams/bound-protocol-model.html`](../diagrams/bound-protocol-model.html).
