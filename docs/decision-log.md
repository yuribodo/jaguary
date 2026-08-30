# Jaguary Decision Log

> This is the fastest way to understand why Jaguary works the way it does. It records the decisions, discoveries, corrections, and tradeoffs that shaped the current product.

| Metadata | Value |
| --- | --- |
| Status | Historical project record through the current state |
| Period covered | 2026-08-29 to 2026-08-30 |
| Last reviewed | 2026-08-30 |
| Scope | Product, architecture, security, integrations, experience, and operations |

## Purpose

This log records how Jaguary evolved, which decisions guided the implementation, what the team learned while building it, and which improvements or corrections followed from those discoveries.

It complements, but does not replace:

- the [ADRs](adr/), which explain durable architecture decisions in depth;
- the [technical documentation](technical/README.md), which describes the code's current behavior;
- the [known implementation gaps](technical/known-gaps.md), which prioritize the work still required for production;
- implementation plans and spikes, which record intent or investigation but do not guarantee delivered behavior.

This history was reconstructed from Git, code, tests, migrations, and existing documentation. When initial intent and final behavior differ, this log gives precedence to implemented behavior and records the change in direction.

## Evolution at a glance

The project began with a simple question: **how can an agent make a purchase without turning the LLM into the authority over money?** The answer became Jaguary's central principle:

```text
HUMAN → MANDATE → AGENT → CHECKOUT → BOUND VERIFY → PAYMENT → RECEIPT
```

The work then evolved in five movements:

1. separate probabilistic interpretation from deterministic economic decisions;
2. build a transactional backbone for identity, mandates, authorization, payment, and audit;
3. connect that backbone to a real conversational flight-search experience;
4. add authentication, external trust, biometric consent, and durable autonomy;
5. distinguish the platform operating TravelBot from the customer delegating a purchase.

## Timeline of decisions, discoveries, and improvements

### 1. Define the problem and the authority boundary

**When:** 2026-08-29 · **Primary commits:** `c4a0825`, `47c3316`

**Context.** The product needed to answer, verifiably, whether an agent acting for a person could execute an exact purchase at that moment. Combining intent interpretation, checkout, authorization, and payment in one automation would make that authority ambiguous.

**Decision.** Bound became the exclusive economic decision point. The LLM may interpret language and propose actions, but it cannot create an `ALLOW`, move money, define prices, choose credentials, or alter authority.

**Discovery and outcome.** Commerce, proof of authority, enforcement, and payment are separate problems. The project adopted a multi-protocol architecture with normalized contracts and a transactional modular monolith, documented in [ADR-001](adr/ADR-001-bound-mvp-architecture.md) and [ADR-002](adr/ADR-002-commerce-protocol-layering.md).

### 2. Choose a simple, transactional, and explainable architecture

**When:** 2026-08-29 · **Primary commits:** `61f4896`, `2ad2400`, `461fb8a`

**Decision.** Organize the repository as a `pnpm` workspace with two deployables—Next.js and Fastify—and PostgreSQL as the source of truth. Revocation, nonces, replay protection, aggregate limits, reservations, and consumption must agree within one transaction boundary.

**Outcome.** The architecture remained a modular monolith with external integrations behind narrow ports. Health checks, environment configuration, linting, TypeScript, tests, and visual directions were included from the start.

### 3. Define contracts before implementations

**When:** 2026-08-29 · **Primary commit:** `b753d30`

**Decision.** Freeze the v1 contracts for commerce, identity, mandates, authorization, payments, receipts, errors, and HTTP conventions before implementing integrations.

**Discovery and outcome.** Explicit contracts prevent sensitive or non-authoritative values from crossing boundaries for convenience. Zod schemas, deterministic fixtures, correlation IDs, idempotency keys, standardized errors, canonicalization, contract tests, and Postman validation now keep adapters replaceable and reject unknown input before it reaches the economic path.

### 4. Keep merchant control over authoritative economic terms

**When:** 2026-08-29 · **Primary commit:** `7956ede`

**Decision.** Create the VuelaYa demo merchant with a deterministic catalog, capability discovery, and signed checkout. The merchant—not the conversation, browser, or model—is the source of items, quantity, currency, total, expiration, and fulfillment.

**Outcome.** Checkout produces a canonical hash and verifiable signature, and Bound compares proposals with authoritative checkout terms. This is a normalized subset inspired by UCP, not complete UCP interoperability.

### 5. Use PostgreSQL as the authority backbone

**When:** 2026-08-29 · **Primary commit:** `a8de39c`

**Decision.** Persist economic and audit state in PostgreSQL through Drizzle, with versioned migrations and a separate integration-test database.

**Discovery and outcome.** Policy unit tests do not prove concurrency safety. Real transactions are required to exercise replay protection, double-spend prevention, limit consumption, and payment transitions. PostgreSQL therefore became the project's authority backbone, not merely application storage.

### 6. Make mandates immutable, identity cryptographic, and Verify pure

**When:** 2026-08-29 · **Primary commits:** `5bc39bb`, `eaedeca`, `b56db7f`

**Decisions.** Active mandates are signed and bounded; changing an economic condition requires a new mandate. Every financial request must prove possession of the agent's registered key. Bound Verify runs pure, ordered rules and returns only `ALLOW`, `ESCALATE`, or `DENY`.

**Discovery and outcome.** Declared identity is not proven identity, and key possession is not external certification of the operator or build. [ADR-003](adr/ADR-003-agent-identity-assurance.md) records that distinction. Verify remains reproducible and makes no LLM, identity-provider, or payment-provider calls.

### 7. Reserve atomically and protect against replay

**When:** 2026-08-29 · **Primary commit:** `24ff6ba`

**Decision.** An `ALLOW` creates an economic effect only when the same transaction records the nonce and creates a `RESERVED` authorization.

**Discovery and outcome.** Verifying first and reserving later creates a race. Limits now include reservations and pending payments, while the transaction rereads and locks nonces, revocation state, and identity snapshots. The store converts a pure policy result into a protected single-use capability.

### 8. Make payment durable, idempotent, and auditable

**When:** 2026-08-29 · **Primary commits:** `d76c291`, `12ccfc5`, `0d77e6f`, `fe24a75`

**Decision.** Isolate payment behind `PaymentExecutor` and maintain a durable state machine. Provider calls happen outside SQL transactions, with short state transitions before and after each call.

**Discovery and outcome.** A timeout is neither failure nor success. `authorization_id` is the stable idempotency identity; ambiguous responses remain `PAYMENT_PENDING`; success creates a correlated order and receipt; terminal failure releases the reservation; and business events enter a hash-chained append-only ledger. The ledger is local tamper evidence, not a blockchain or external proof of immutability.

### 9. Integrate Yuno honestly, with a deterministic fallback

**When:** 2026-08-29 · **Primary commits:** `099e179`, `3de1f96`

**Investigation.** The team evaluated Yuno's sandbox and credential model before making it a runtime requirement. A credential vaulted in Yuno is not a universal card, and sandbox access, commercial onboarding, and network-product access are distinct.

**Decision and outcome.** Implement and test `YunoPaymentExecutor`, retain an explicit deterministic fake executor for the demo, and keep enrollment on the provider's secure surface. PAN, CVV, and reusable tokens never reach TravelBot or public contracts. [ADR-004](adr/ADR-004-credential-enrollment-and-external-checkout.md) has the full reasoning. The current composition root still installs the fake executor even when Yuno variables exist, so the real integration remains an open high-severity gap.

### 10. Build a Trusted Surface and evolve chat

**When:** 2026-08-29 · **Primary commits:** `3935361`, `e7889f7`, `a7391e5`, `fc1d99d`

**Decision.** Make authority visible and understandable rather than hiding mandates, limits, confirmation, or evidence behind a “magical” chat.

**Outcome.** The Trusted Surface, conversation and confirmation components, landing page, account navigation, purchases, payment methods, and merchant pages turn the frontend into an authority narrative. Users can distinguish proposals, approvals, executions, blocks, and receipts.

### 11. Use OpenAI for TravelBot while keeping state under application control

**When:** 2026-08-29 · **Primary commit:** `d1e8e5c`

**Decision.** Use the OpenAI Agents SDK behind a dedicated port, with structured output, strict tools, disabled parallel tool calls, and PostgreSQL-backed conversation persistence.

**Discovery and outcome.** Structured output remains untrusted input, SDK `needsApproval` is not sufficient consent, and provider IDs are correlation data rather than workflow truth. The application owns the state machine, legal-tool calculation, replayable SSE events, and encrypted approval binding. The model does not select idempotency keys or invoke payment. [ADR-005](adr/ADR-005-travelbot-agents-runtime.md) formalizes this split.

### 12. Make chat contextual and English, add real search, and simplify approval

**When:** 2026-08-29 · **Primary commits:** `3659ea4`, `3bd26bc`, `a6e5fab`, `bff6bb7`, `b6d9e9b`, `01db31d`

**Improvements.** Chat began recomputing missing fields from trip context. Google Flights search through SerpApi added validation, normalization, deduplication, and a short cache. The application deterministically picks the lowest compatible total, then earliest departure, then stable ID. The user confirms the exact purchase in one step, with details and an official source.

**Discovery and limits.** More confirmation screens do not necessarily improve safety; consent must be explicit and bound to exact terms. Multi-passenger totals still multiply a single-adult quote, and local timestamps need stronger time-zone semantics.

### 13. Add login, external trust, Agent Passport, and biometric consent

**When:** 2026-08-30 · **Primary commits:** `c3fca32`, `f7eda24`

**Decisions.** Add demo and Google OIDC sessions, integrate Didit behind a vendor-neutral port, normalize external responses as evidence rather than `ALLOW`, issue short-lived ES256 Agent Passports, and require biometric consent before mandate activation when policy requires external trust.

**Discovery and outcome.** Authenticating a person, attesting an operator or agent, and consenting to a purchase are separate acts. The system fails closed without required attestation, avoids storing raw provider payloads or PII, and binds biometric evidence to the correct mandate and customer.

### 14. Deploy and fix build portability

**When:** 2026-08-30 · **Primary commits:** `2c7d9f8`, `eff5913`, `e8c037d`, `928b085`

**Decision.** Prepare both deployables for Vercel with Neon PostgreSQL while keeping deployment instructions separate from local execution.

**Discovery and outcome.** Production exposed implicit dependencies on global `fetch` types and environment differences. Separating the composition root, isolating the flight-provider fetch contract, and explicitly including web-platform types made builds portable and deployment operationally documented.

### 15. Integrate the workspace and personalize sessions and conversations

**When:** 2026-08-30 · **Primary commits:** `9604152`, `a735244`, `541dae0`

**Improvements.** Dashboard, agents, merchants, opportunities, payments, purchases, and audit joined one workspace. Conversations gained titles, listing, deletion, and per-user continuity, and the landing page began reflecting the active session.

**Discovery and outcome.** Persistence alone is insufficient: every public read and mutation must be owner-scoped. The backend now derives the customer from the opaque session rather than trusting a browser-supplied `principal_id`.

### 16. Add autonomous fare monitoring with pre-authorized authority

**When:** 2026-08-30 · **Primary commit:** `b7b130e`

**Problem.** A synchronous search ends without a result when no flight fits the budget. Waiting to request approval until a later offer appears prevents genuine autonomy.

**Decision and outcome.** A durable travel watch uses a pre-approved, single-use conditional mandate bounded by route, date window, cabin, passengers, merchant, currency, and budget. Activation requires liveness, while every future purchase still passes Verify. Persisted watches, recoverable leases, stable idempotency identities, backoff, and cancellation-by-revocation survive restarts without duplicating authority or purchases. [ADR-006](adr/ADR-006-durable-autonomous-travel-watch.md) records the decision.

### 17. Refine trust, purchasing, voice, and real-data integration

**When:** 2026-08-30 · **Primary commits:** `96de5e1`, `6fdaa34`, `5ee6e9c`, `2d74097`

**Improvements.** Pending identity checks can be restarted; travel quick replies became contextual and tested; purchases display real receipts; chat gained real-time voice through backend-issued ephemeral tokens; and workspace mocks were replaced with data from the product APIs.

**Discovery and outcome.** Mocks that survive integration hide ownership failures, loading and empty states, and contract drift. The frontend now consumes the same durable state that governs purchases.

### 18. Correct a critical identity assumption: the platform operator is not the customer

**When:** 2026-08-30 · **Primary commits:** `b73f9fa`, `e145864`

**Problem.** TravelBot had been registered as though Marta owned it, and her Didit evidence was reused as a biometric reference. That blocked other customers and risked comparing one person's biometrics with another's.

**Correction.** `principal_jaguary_platform` operates public `agent_travelbot` and owns its key and build. Each authenticated customer independently owns their session, conversation, Didit attestation, mandate, consent, logical credential, authorization, and receipt.

**Outcome.** TravelBot is `PUBLIC`; external trust is keyed by `(agent_id, principal_id)`; logical credentials are customer-isolated; agent snapshots use the platform's cryptographic trust; economic authority uses the customer's policy evidence. A public agent can serve multiple customers without sharing authority or data. [ADR-007](adr/ADR-007-agent-operator-and-customer-authority.md) formalizes the correction.

### 19. Preserve flight-source provenance through the receipt

**When:** 2026-08-30

**Problem.** Google Flights supplied an official result URL during discovery, but the value stopped at the offer. A completed Purchase Receipt therefore could not link back to the flight source, and historical receipts lost useful provenance even when the original selected offer remained durable.

**Decision and outcome.** VuelaYa now copies the HTTPS source URL into the flight fulfillment before signing the checkout. The signed value follows the existing checkout → authorization → order → receipt path without creating a browser-authored field. A data migration backfills historical receipts only when the durable conversation, selected offer, checkout, and receipt agree; unmatched legacy receipts remain unchanged.

## Decisions that remained invariant

1. The model proposes; deterministic code decides and commits.
2. The merchant authors economic terms; the browser and agent do not.
3. Only a transactionally reserved `ALLOW` can reach payment.
4. Active mandates are immutable, bounded, revocable, and replay-protected.
5. Reusable credentials and secrets stay out of the browser, LLM, logs, and public contracts.
6. External integrations are normalized before entering policy.
7. External calls do not run inside SQL transactions.
8. Ambiguous economic responses remain pending until reconciliation.
9. Authority belongs to an authenticated customer, even when the agent is public and platform-operated.
10. Documentation distinguishes implementation, normalized subsets, sandboxes, spikes, and planned work.

## Alternatives rejected

| Alternative | Reason for rejection |
| --- | --- |
| Let the LLM authorize or pay | Probabilistic output cannot be the final authority over money. |
| Expose the Yuno Agent Toolkit or a token to TravelBot | It would bypass Verify, mandates, and credential isolation. |
| Use AP2 as the complete commerce protocol | AP2 proves authority but does not replace catalog, checkout, order, or fulfillment. |
| Use UCP as a payment rail | UCP organizes commerce; execution and settlement belong to the provider or rail. |
| Treat Yuno Vault as a portable card | Its reference is contextual, not a universal credential for arbitrary sites. |
| Store PAN or CVV in Bound | It would increase PCI scope and expose reusable material unnecessarily. |
| Make browser automation the P0 path | It is fragile, prone to blocking, and unsuitable for raw credentials. |
| Verify first and reserve later | It permits races and concurrent consumption of the same authority. |
| Retry payment after timeout with a new key | It can produce a duplicate charge. |
| Use an in-memory timer for monitoring | Restarts and multiple instances would lose or duplicate work. |
| Increase a watch budget automatically | It would expand authority without fresh consent. |
| Treat `needsApproval` as consent | It is runtime state, not human proof bound to economic terms. |
| Treat the customer as TravelBot's owner | It confuses the operator with the authority holder and breaks multi-user isolation. |

## Open gaps discovered or accepted

This project cycle ended with a functional reference vertical, not a platform ready for real money. The main known gaps are:

- general mandate and travel-watch routes do not consistently enforce session ownership;
- the composition root still installs fake payment even when Yuno configuration exists;
- authoritative checkouts and some signing keys are ephemeral and process-local;
- advertised UCP and AP2 capabilities are broader than the implemented wire protocol;
- pending payments have no runtime-connected webhook or reconciliation worker;
- multi-passenger search still derives totals from a one-adult quote;
- local flight times can still be confused with UTC instants;
- catalogs, offers, rate limiting, and some keys need shared storage or rotation;
- some workflow-table relationships are enforced by the application rather than the database.

[Known implementation gaps](technical/known-gaps.md) documents the details, impact, and recommended order.

## Maintaining this log

Update this file when a discovery changes the team's understanding, an assumption is corrected, a cross-cutting improvement lands, or an important decision does not independently justify a new ADR.

For every new entry, record:

1. the date and related commits or pull requests;
2. the observed context or problem;
3. the decision made;
4. the discovery or corrected assumption;
5. the consequence for product, code, security, or operations;
6. any limitations that remain open.

Create a separate ADR when a decision is expensive to reverse, affects several system boundaries, or needs to preserve alternatives and acceptance criteria in depth.
