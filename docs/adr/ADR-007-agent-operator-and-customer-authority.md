# ADR-007 — Agent operator and customer authority are separate identities

- Status: accepted
- Date: 2026-08-30
- Related: [ADR-003](ADR-003-agent-identity-assurance.md), [ADR-005](ADR-005-travelbot-agents-runtime.md), [ADR-006](ADR-006-durable-autonomous-travel-watch.md)

## Context

TravelBot is a platform-operated agent that serves multiple authenticated customers. The original implementation used one `principal_id` both for the human/operator whose identity and key/build binding are attested and for the customer whose conversation and purchase authority are being executed. That happened to work for the Marta demo fixture, but denied every other valid customer with `agent_attestation_binding_mismatch`.

Those identities answer different security questions:

- the **operator principal** answers who owns and operates the registered agent, public key, build, and Didit KYA evidence;
- the **customer principal** answers who owns the browser session, conversation, mandate, credential reference, authorization, and receipt.

Requiring the two IDs to match would make a platform agent single-user. Ignoring either binding would lose operator trust or customer authority.

## Decision

Model and enforce the identities independently.

1. `agents.principal_id` remains the operator/owner binding used by registration, Didit attestation, assurance, and Agent Passport issuance.
2. The public conversation API derives the customer from the opaque authenticated session. A browser cannot submit or replace `principal_id` when creating a conversation.
3. Conversation reads, messages, and deletion are scoped to that customer. A different valid session receives `404` rather than learning whether the conversation exists.
4. Agent eligibility has an explicit purpose:
   - `OPERATOR` checks that the requesting principal owns the agent binding;
   - `EXECUTION` checks agent status and required current trust evidence without comparing the operator to the customer.
5. Verify requires one agent ID across registered identity, signed request, mandate, and authorization. Separately, it requires one customer principal across mandate and authorization.
6. PostgreSQL uses independent foreign keys for the agent and customer on conversations, mandates, and travel watches. It does not encode a composite agent/customer equality that the domain does not require.
7. The configured demo credential is a template only. Internal TravelBot authority preparation creates a deterministic, isolated logical credential reference owned by the customer. No payment secret or token is copied, and public mandate creation cannot request template expansion.

## Consequences

- One attested TravelBot can safely serve many authenticated customers.
- Didit continues to establish operator evidence and biometric consent; it does not become the source of purchase authority or an `ALLOW` decision.
- Customer authority remains explicit, scoped, signed, revocable, and rechecked by Verify immediately before reservation.
- Existing rows where operator and customer are both Marta remain valid through the migration.
- Integrations must not infer that `agents.principal_id` is the shopper. Code and documentation should use “operator” or “agent owner” for that field and “customer” or “authority principal” for conversation/mandate ownership.

## Verification

- Route tests prove session-derived creation, CSRF/origin enforcement, and cross-principal privacy.
- Policy tests prove that a platform-operated agent can execute authority for another customer while mismatched mandate/authorization customers still fail closed.
- PostgreSQL integration tests prove independent agent/customer foreign keys, per-customer demo credential isolation, and the complete chat → Verify → payment → receipt path.
