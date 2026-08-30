# ADR-007 — Public TravelBot and customer-bound identity assurance

- Status: accepted
- Date: 2026-08-30
- Related: [ADR-003](ADR-003-agent-identity-assurance.md), [ADR-005](ADR-005-travelbot-agents-runtime.md), [ADR-006](ADR-006-durable-autonomous-travel-watch.md)

## Context

TravelBot is a public platform agent that serves multiple authenticated customers. The original implementation registered Marta as its owner and reused her Didit assessment as the biometric reference for every purchase. That happened to work for the Marta demo fixture, but denied every other customer before biometric consent and sent them to an onboarding page they could never use.

Those identities answer different security questions:

- the **platform principal** owns the registered agent, public key, and build;
- the **customer principal** owns the browser session, Didit identity evidence, conversation, mandate, credential reference, biometric consent, authorization, and receipt.

Marta is only one customer. She has no privileged relationship to TravelBot, and her portrait must never become another customer's biometric reference.

## Decision

Model and enforce the identities independently.

1. `agent_travelbot` is owned by `principal_jaguary_platform` and marked `access_scope=PUBLIC`.
2. Public access binds trust reads and onboarding sessions to the authenticated customer without changing the agent's global cryptographic identity.
3. `agent_attestations` references agent and principal independently. Current assurance is selected by `(agent_id, principal_id)`, so two customers can never share a Didit assessment.
4. The platform execution snapshot for a public agent uses local cryptographic assurance. Customer-bound authority uses the configured external trust mode and fails closed until that customer's assessment is verified.
5. Biometric consent loads the current assessment for the mandate's customer and uses only that assessment as the reference portrait.
6. The public conversation API derives the customer from the opaque authenticated session; reads, messages, and deletion remain customer-scoped.
7. Verify requires one agent ID across registered identity, signed request, mandate, and authorization, and independently requires one customer across mandate and authorization.
8. The configured demo credential remains a template; the internal flow creates an isolated logical reference owned by each customer.

## Consequences

- One public TravelBot can safely serve many authenticated customers.
- Each customer completes and sees only their own Didit verification and biometric evidence.
- Marta's existing assessment remains Marta's assessment after migration, but she is no longer the agent owner.
- Didit establishes customer evidence; it does not become the source of purchase authority or an `ALLOW` decision.
- Customer authority remains explicit, scoped, signed, revocable, and rechecked by Verify immediately before reservation.
- Integrations must not infer that `agents.principal_id` is the shopper. For TravelBot it is the platform principal; customer ownership comes from session-bound records.

## Verification

- Route tests prove session-derived creation, CSRF/origin enforcement, and cross-principal privacy.
- Trust tests prove that Alice and Bob receive different attestations for the same public TravelBot.
- PostgreSQL integration tests prove public-agent migration, independent customer onboarding references, per-customer credential isolation, and the complete chat → Verify → payment → receipt path.
