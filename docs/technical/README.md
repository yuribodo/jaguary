# Technical documentation

| Metadata | Value |
| --- | --- |
| Status | Current implementation |
| Audience | Engineers, reviewers, operators, and technical evaluators |
| Last verified | 2026-08-30 |
| Runtime scope | `frontend/`, `backend/`, PostgreSQL, and configured external providers |

Bound is the deterministic authorization layer between an agent's proposed economic action and payment execution. Jaguary is the product and brand; TravelBot is the shopping agent used by the current flight vertical; VuelaYa is the merchant adapter used by the demo.

The shortest accurate model is:

> OpenAI helps TravelBot understand and propose. UCP carries commerce. AP2 carries authority. Bound decides. Didit contributes identity evidence. The payment executor moves money only after a reserved `ALLOW`.

[Open the system context diagram](../diagrams/system-context.html).

## Product parts

| Part | Purpose | Owns | Must not own |
| --- | --- | --- | --- |
| Trusted Surface | Let the principal inspect and explicitly confirm an exact action | Human-readable consent and conversation UX | Silent authorization or secrets |
| TravelBot | Turn natural language into a structured travel workflow | Intent extraction and narrow tool proposals | Policy truth, signing keys, or payment execution |
| VuelaYa | Represent an agent-native merchant | Offers, merchant-authored checkout terms, order read | User authority or Bound policy |
| Mandates | Persist scoped, revocable authority | Principal, agent, merchant, route, limits, validity, credential reference | Mutable authority after activation |
| Bound Verify | Produce a deterministic decision | Signatures, bindings, scope, limits, state, replay, reservation | LLM judgment or provider calls during evaluation |
| Payments | Execute a reserved authorization once | Payment attempt, provider idempotency, result transition | Choosing amount, merchant, or credential from client input |
| Trust | Normalize agent/operator assurance | Local key/build binding, Didit evidence, Agent Passport | Producing `ALLOW` by itself |
| Ledger | Explain committed state transitions | Append-only correlated hash chain and receipts | A claim of blockchain or external immutability |

## Integration guides

- [OpenAI and TravelBot](openai-travelbot.md) — why the model is present, how turns work, and where deterministic control resumes.
- [Google Flights search through SerpApi](google-flights-search.md) — typed query mapping, normalization, caching, expiry, and the boundary before checkout.
- [Didit and agent trust](didit-trust.md) — operator identity evidence, webhooks, biometric consent, and Agent Passports.
- [UCP commerce integration](ucp-commerce.md) — discovery, capability negotiation, merchant-authored checkout, and orders.
- [AP2 and Bound authorization](ap2-bound.md) — mandates, exact checkout binding, Verify, replay protection, and the current conformance boundary.

## Engineering status

- [Known implementation gaps](known-gaps.md) — prioritized production, interoperability, and reliability findings backed by code anchors.

## Core invariants

1. No LLM or browser response can directly create an `ALLOW` or call a payment executor.
2. The merchant, not the agent, authors price, items, total, and checkout expiry.
3. Active authority is immutable, scoped, time-bound, revocable, and tied to a logical payment credential.
4. A payment uses values loaded from a persisted reserved authorization, never a client-supplied amount.
5. Nonce, idempotency, mandate usage, and authorization transitions are enforced transactionally in PostgreSQL.
6. External provider evidence is normalized before use; Verify performs no OpenAI or Didit network call.
7. Secrets, raw credentials, provider payloads, PAN, and CVV are excluded from public contracts and logs.

## Implementation versus roadmap

The current system is a modular monolith: one Next.js application, one Fastify API, and PostgreSQL. OpenAI and Didit are real optional adapters. VuelaYa and the normalized UCP/AP2 flow are intentionally bounded demo implementations. The application entry point currently installs the deterministic fake payment executor even when Yuno configuration is enabled; the Yuno adapter exists and is tested in isolation but is not composed into the runtime and has no complete webhook/reconciliation surface.

Historical plans and research remain useful context, but this directory and the code are the source of truth for current behavior.
