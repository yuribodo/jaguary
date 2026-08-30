# Jaguary Decision Log

> This is the standalone technical narrative of Jaguary. A reviewer should be able to understand the problem, architecture, provider roles, trust boundaries, delivered behavior, tradeoffs, and remaining risks without opening another document.

| Metadata | Value |
| --- | --- |
| Status | Historical project record through the current state |
| Period covered | 2026-08-29 to 2026-08-30 |
| Last reviewed | 2026-08-30 |
| Scope | Product, architecture, security, integrations, experience, and operations |

## Purpose

This log records how Jaguary evolved, which decisions guided the implementation, what the team learned while building it, and which improvements or corrections followed from those discoveries. It intentionally includes the essential reasoning that also exists in deeper architecture records; those records are optional evidence, not required reading.

This history was reconstructed from Git, code, tests, migrations, and deployed behavior. When initial intent and final behavior differ, this log gives precedence to implemented behavior and records the change in direction. “Implemented” means present in the repository and covered by tests; “production-connected” means selected by the deployed composition root; “sandbox” or “demo” is stated explicitly.

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

## What exists today

Jaguary is a transactional modular monolith with two deployables: a Next.js Trusted Surface and a Fastify API. PostgreSQL is the source of truth for sessions, conversations, mandates, nonces, authorizations, payment attempts, orders, receipts, disputes, travel watches, and a hash-chained audit ledger. The browser never authors prices, payment authority, or reusable credentials.

The normal purchase path is:

```text
Customer request
  → TravelBot interprets and completes trip context
  → flight adapter returns normalized offers and source provenance
  → VuelaYa creates a merchant-signed checkout
  → customer approves exact terms or activates bounded prior authority
  → Bound Verify deterministically returns DENY, ESCALATE, or ALLOW
  → ALLOW and a single-use reservation commit atomically in PostgreSQL
  → the selected payment executor runs outside the database transaction
  → order, receipt, dispute capability, and audit evidence become durable
```

### Components and authority

| Component | Role in the implemented system | Authority it does **not** have |
| --- | --- | --- |
| Trusted Surface (Next.js) | Shows trip context, mandates, exact approval terms, purchases, receipts, disputes, and audit evidence | Cannot author price, create `ALLOW`, resolve credentials, or call a payment provider directly |
| TravelBot + OpenAI Agents SDK | Interprets natural language into strict trip proposals and invokes only state-legal tools | Model output is untrusted; it cannot grant authority, choose idempotency keys, or pay |
| VuelaYa merchant adapter | Owns catalog data and creates canonical, signed checkout economics and fulfillment | Cannot use the customer's mandate without Bound verification |
| Bound Verify | Applies pure ordered policy rules to trusted snapshots and produces `DENY`, `ESCALATE`, or `ALLOW` | Performs no model, identity-provider, flight-provider, or payment-provider call |
| Authorization and payment services | Reserve authority atomically, enforce one execution path, normalize payment results, and seal receipts | Cannot expand mandate scope or treat an ambiguous provider response as success |
| PostgreSQL / Neon | Stores current authority and workflow state and supplies transaction, locking, replay, and audit guarantees | The local hash chain alone is not external immutable storage |

### External providers and their exact roles

| Provider | What Jaguary uses it for | Integration status and trust boundary |
| --- | --- | --- |
| OpenAI | Agents SDK runtime for structured conversation interpretation and tool proposals | Production-connected. Provider storage and parallel tool calls are disabled; persisted application state, not provider run state, is authoritative |
| SerpApi / Google Flights | Searches flights and returns price, itinerary, and an official Google Flights source URL | Production-connected through a backend-only adapter. Results are validated and normalized as offer evidence; they never authorize a purchase |
| Didit | Customer identity assurance and liveness/biometric consent evidence | Production-connected behind a vendor-neutral adapter. Webhooks are signature-checked and statuses normalized; Didit never produces `ALLOW` |
| Google OIDC | Authenticates the human into an opaque, owner-scoped Jaguary session | Production-connected. Authentication proves the session identity, not purchase consent or agent integrity |
| Yuno | Tested server-side payment executor and provider-result normalization | Implemented and sandbox-tested, but **not selected by the current production composition root**; the demo currently uses an explicit deterministic fake executor |

### Protocol vocabulary used in this log

- **UCP-like commerce subset:** capability discovery, catalog, signed checkout, order, and fulfillment contracts used by the VuelaYa vertical. It is a normalized experimental subset, not a claim of complete upstream UCP conformance.
- **AP2-shaped mandate:** signed proof describing who delegated what purchase scope, amount, time window, merchant, and usage. It supplies authority evidence; it does not replace commerce or payment processing.
- **Bound Verify:** Jaguary's deterministic enforcement point. It evaluates normalized identity, mandate, checkout, time, revocation, usage, and replay state.
- **Reservation:** a single-use economic capability created in the same database transaction as `ALLOW`, preventing concurrent requests from spending the same authority.
- **Agent Passport:** a short-lived ES256 token containing privacy-safe trust claims and cryptographic bindings; it is evidence, not a payment credential.

## Timeline of decisions, discoveries, and improvements

### 1. Define the problem and the authority boundary

**When:** 2026-08-29 · **Primary commits:** `c4a0825`, `47c3316`

**Context.** The product needed to answer, verifiably, whether an agent acting for a person could execute an exact purchase at that moment. Combining intent interpretation, checkout, authorization, and payment in one automation would make that authority ambiguous.

**Decision.** Bound became the exclusive economic decision point. The LLM may interpret language and propose actions, but it cannot create an `ALLOW`, move money, define prices, choose credentials, or alter authority.

**Discovery and outcome.** Commerce, proof of authority, enforcement, credential resolution, and payment are separate problems. The project therefore adopted normalized internal contracts instead of making any provider protocol its domain model: the commerce adapter creates an authoritative checkout; the mandate supplies delegation evidence; Bound Verify alone enforces it; a credential adapter resolves a logical reference only after reservation; and a payment executor talks to the provider. This separation allows SerpApi, Didit, Yuno, or a future commerce adapter to change without changing who can create `ALLOW`.

**Rejected alternative and consequence.** A single “agent buys” integration would be faster to sketch but would let provider tools or model output bypass revocation, limits, and audit. The chosen boundary adds explicit adapters and state transitions, but makes every economic effect explainable and independently testable.

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

**Discovery and outcome.** Declared identity is not proven identity, and key possession is not external certification of the operator or build. Jaguary separates four claims: the registered agent key proves request possession; the platform record identifies the agent operator and build; Didit supplies customer-bound external assurance and liveness evidence; and the signed mandate proves economic delegation. Verify consumes normalized snapshots of those claims but remains reproducible and makes no LLM, identity-provider, or payment-provider calls.

**Rejected alternative and consequence.** Treating one provider badge or one authenticated user as sufficient proof would collapse distinct trust questions and make multi-customer operation unsafe. The separation requires more bindings, but a failed or unavailable provider can only remove evidence and fail closed—it cannot silently grant authority.

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

**Decision and outcome.** Implement and test `YunoPaymentExecutor`, retain an explicit deterministic fake executor for the demo, and keep enrollment on the provider's secure surface. The database exposes only a logical credential reference; only the server-side adapter may resolve provider material after a reserved authorization exists. PAN, CVV, and reusable tokens never reach TravelBot, the browser, logs, receipts, or public contracts. Provider calls reuse the persisted authorization identity for idempotency and normalize `APPROVED`, `DECLINED`, `TIMEOUT`, and `UNKNOWN` without guessing.

**Current limitation.** The current production composition root still installs the fake executor even when Yuno variables exist. The adapter demonstrates and tests the intended integration boundary, but the deployed demo must not be described as processing real Yuno payments. Wiring the real executor, credential resolver, webhook authentication, and reconciliation worker is a high-severity requirement before real money.

### 10. Build a Trusted Surface and evolve chat

**When:** 2026-08-29 · **Primary commits:** `3935361`, `e7889f7`, `a7391e5`, `fc1d99d`

**Decision.** Make authority visible and understandable rather than hiding mandates, limits, confirmation, or evidence behind a “magical” chat.

**Outcome.** The Trusted Surface, conversation and confirmation components, landing page, account navigation, purchases, payment methods, and merchant pages turn the frontend into an authority narrative. Users can distinguish proposals, approvals, executions, blocks, and receipts.

### 11. Use OpenAI for TravelBot while keeping state under application control

**When:** 2026-08-29 · **Primary commit:** `d1e8e5c`

**Decision.** Use the OpenAI Agents SDK behind a dedicated port, with structured output, strict tools, disabled parallel tool calls, and PostgreSQL-backed conversation persistence.

**Discovery and outcome.** Structured output remains untrusted input, SDK `needsApproval` is not sufficient consent, and provider IDs are correlation data rather than workflow truth. After every model proposal, the application recomputes missing fields, valid tools, and the legal next state from durable data. Tool handlers reload the conversation and reject stale calls. Approval interruptions are encrypted with AES-256-GCM and bound to merchant, checkout hash, amount, currency, and mandate; they resume at most once. Corrections invalidate pending approval. The model does not select idempotency keys, mint authorization decisions, or invoke payment.

**Operational consequence.** PostgreSQL stores ordered sanitized messages, intent snapshots, normalized tool executions, approval state, and replayable SSE events. A disconnect can replay presentation events without repeating committed side effects, while provider tracing excludes raw prompts, proofs, credentials, and receipt bodies.

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

**Decision and outcome.** A durable travel watch uses a pre-approved, single-use conditional mandate bounded by route, date window, cabin, passengers, merchant, currency, and budget. Activation requires liveness once, before unattended monitoring begins; a later match still receives a fresh merchant checkout and passes Verify against current revocation, scope, price, and usage state immediately before payment.

**Reliability and safety mechanics.** PostgreSQL stores watches and attempts. Workers claim due rows with `FOR UPDATE SKIP LOCKED`, use reclaimable leases, stable checkout/Verify/payment idempotency identities, and bounded provider backoff. No inventory reschedules the watch; an over-budget fare is diagnostic only; changing the budget requires a new mandate and consent; cancellation revokes the active mandate. This survives process restarts without relying on one in-memory timer or duplicating a purchase.

### 17. Refine trust, purchasing, voice, and real-data integration

**When:** 2026-08-30 · **Primary commits:** `96de5e1`, `6fdaa34`, `5ee6e9c`, `2d74097`

**Improvements.** Pending identity checks can be restarted; travel quick replies became contextual and tested; purchases display real receipts; chat gained real-time voice through backend-issued ephemeral tokens; and workspace mocks were replaced with data from the product APIs.

**Discovery and outcome.** Mocks that survive integration hide ownership failures, loading and empty states, and contract drift. The frontend now consumes the same durable state that governs purchases.

### 18. Correct a critical identity assumption: the platform operator is not the customer

**When:** 2026-08-30 · **Primary commits:** `b73f9fa`, `e145864`

**Problem.** TravelBot had been registered as though Marta owned it, and her Didit evidence was reused as a biometric reference. That blocked other customers and risked comparing one person's biometrics with another's.

**Correction.** `principal_jaguary_platform` operates public `agent_travelbot` and owns its key and build. Each authenticated customer independently owns their session, conversation, Didit attestation, mandate, consent, logical credential, authorization, and receipt.

**Outcome.** TravelBot is `PUBLIC`; external trust is keyed by `(agent_id, principal_id)`; logical credentials are customer-isolated; agent snapshots use the platform's cryptographic trust; economic authority uses the customer's policy evidence. Conversation APIs derive the customer from the opaque authenticated session. Biometric consent loads only that mandate customer's assessment, and Verify independently requires one agent identity across request/mandate/authorization and one customer identity across mandate/authorization. A public agent can therefore serve multiple customers without sharing sessions, portraits, credentials, authority, or receipts.

**Evidence.** Route tests cover cross-principal privacy, CSRF, Origin, and session-derived ownership. Trust tests give two customers distinct attestations for the same public agent. PostgreSQL integration tests cover migration, isolated onboarding and credential references, and the complete chat → Verify → payment → receipt path.

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

## Real trade-offs

These are not free improvements: each choice deliberately accepts a concrete cost in exchange for a property the hackathon vertical needs more.

| Decision | Benefit gained | Cost consciously accepted | Why the trade-off was right now | Revisit when |
| --- | --- | --- | --- | --- |
| Transactional modular monolith instead of independent services | One PostgreSQL boundary can atomically enforce revocation, nonces, limits, reservation, and audit | The API is a larger single deployment and failure domain, with less independent scaling | Correctness and explainability of financial concurrency matter more than premature service isolation | Reconciliation volume or module-specific scaling proves that an outbox-backed worker/service is operationally necessary |
| Pure deterministic Verify instead of model-based authorization | Stable outcomes, reason codes, replayable tests, and fail-closed behavior | New policy capabilities require explicit schemas, normalized evidence, code, and tests rather than prompt changes | Money movement needs reproducibility more than conversational flexibility | Do not replace this boundary; use models only to propose inputs or explain deterministic results |
| Payment-provider calls outside SQL transactions | Avoids holding locks during slow or unavailable external I/O and supports scalable provider interaction | A timeout creates an honest `PAYMENT_PENDING` state that requires reconciliation instead of immediate certainty | Long database locks and guessed payment outcomes are more dangerous than explicit ambiguity | Add durable webhook/polling reconciliation before enabling real payments; keep external calls outside SQL |
| Pre-authorized conditional mandate for fare monitoring | A matching fare can be bought unattended while price and inventory are still available | The customer does not reconfirm at match time, so authority must be narrower, single-use, revocable, and liveness-bound | Fresh confirmation would defeat the stated autonomous-purchase use case | Require a new mandate whenever budget, route, date window, cabin, passengers, merchant, or execution mode changes |
| Normalized provider adapters instead of adopting provider payloads as domain models | Providers can be replaced and none can smuggle missing evidence into `ALLOW` | Adapter code must track upstream changes, and the current UCP/AP2-shaped subset is not full standards interoperability | Stable trust semantics were achievable within hackathon scope without coupling policy to one vendor | Implement pinned conformance suites before claiming standard interoperability or accepting third-party clients |
| Deterministic fake payment in the deployed demo while retaining a tested Yuno adapter | The end-to-end authorization, receipt, dispute, and audit demonstration is reliable without pretending sandbox access equals settlement readiness | The demo does not execute a real Yuno payment and must say so clearly | Demonstrating the authority boundary safely is more honest than presenting a partially wired provider as production payment | Replace the fake only after runtime composition, credential resolution, webhooks, reconciliation, and production safety tests are complete |

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

This project cycle ended with a functional reference vertical, not a platform ready for real money. Severity below describes the risk of deploying or presenting the current repository as a complete implementation.

| Severity | Gap and present behavior | Impact | Required next step |
| --- | --- | --- | --- |
| High | General mandate and travel-watch routes do not consistently derive ownership from the opaque session, although conversations and purchases do | A caller with a resource identifier could attempt cross-customer API access; downstream economic checks still fail closed, but resource authorization must not rely on identifier secrecy | Require session ownership on every public read/mutation, Origin and CSRF on browser mutations, `404` for foreign resources, and two-principal IDOR tests |
| High | `YunoPaymentExecutor` is implemented and tested, but the production composition root selects `FakePaymentExecutor` | A successful demo payment is not evidence that Yuno processed money | Select Yuno only when fully configured, resolve credentials server-side, forbid fake payment outside explicit demo/test mode, and add a production composition test |
| High | Merchant checkout state and default merchant/mandate signing keys are process-local | A restart can lose authoritative checkout lookup or rotate the verification key; multiple API instances can disagree | Persist authoritative checkouts; use durable KMS/HSM-backed keys with stable `kid`, discovery, overlap, and rotation tests |
| High | The public UCP/AP2 labels are broader than the custom normalized wire subset actually implemented | An external standards-based client could interpret capability discovery as full conformance and fail to interoperate | Either publish a clearly experimental namespace or implement pinned upstream schemas, negotiation, proof placement, key discovery, and conformance vectors |
| High | `TIMEOUT` and `UNKNOWN` correctly remain `PAYMENT_PENDING`, but no deployed Yuno webhook or polling worker reconciles them | A real provider payment could remain economically ambiguous indefinitely | Authenticate provider webhooks, poll by original provider/idempotency identity, prohibit state regression, and alert on aged pending attempts |
| Medium | Google Flights is queried with one adult and the price is later multiplied by passenger count | The arithmetic is deterministic, but the provider may not have quoted availability or a fare bucket for the whole party | Query the true party size, normalize whether price is per traveler or total, and test two-to-nine passenger cases |
| Medium | Airport-local flight times are preserved but a legacy field appends `Z` | Code can mistake wall time for a real UTC instant, affecting duration, order, policy, or audit | Resolve airport time zones and offsets or remove the misleading instant field |
| Medium | Search cache and remembered offers are process-local; remembered offers are not fully bounded | Restarts lose lookup, instances disagree, and high-cardinality traffic can increase memory/provider calls | Add expiry and capacity limits, shared quote storage where correctness requires it, request budgets, and cache/provider metrics |
| Medium | Agent Passport keys rotate on every restart | Unexpired passports fail verification after deployment and safe overlapping rotation is impossible | Load durable keys, publish overlapping JWKS entries, and define rotation/revocation operations |
| Medium | Some workflow identifiers are validated by services but lack database foreign keys | A migration, regression, or alternate writer could create orphaned references | Define deletion/retention semantics, then add validated foreign keys for shared lifecycles and correlation tests for intentionally polymorphic ledger subjects |
| Lower | Provider retries, distributed rate limits, diagnostic classification, and live sandbox smoke tests are incomplete | Operational failures may be noisy, instance-local, or diagnosed too generically even when the economic path fails closed | Add bounded SerpApi retry/backoff, shared expiring rate limits, finer error taxonomy, and gated provider sandbox smoke checks |

**Recommended production order.** (1) prohibit fake payments outside explicit demo mode and wire the selected executor; (2) persist checkout state and signing keys; (3) narrow or complete UCP/AP2 conformance claims; (4) add payment reconciliation; (5) correct party-size and time-zone semantics; (6) add shared caches, distributed rate limits, key rotation, and sandbox smoke coverage.

## Maintaining this log

Update this file when a discovery changes the team's understanding, an assumption is corrected, a cross-cutting improvement lands, or an important decision does not independently justify a new ADR.

For every new entry, record:

1. the date and related commits or pull requests;
2. the observed context or problem;
3. the decision made;
4. the discovery or corrected assumption;
5. the consequence for product, code, security, or operations;
6. any limitations that remain open.

Deeper architecture records may still preserve extended alternatives and acceptance criteria, but every future entry must keep the reviewer-facing explanation complete here.
