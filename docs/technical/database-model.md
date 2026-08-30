# Database model

| Metadata | Value |
| --- | --- |
| Status | Current implementation |
| Last verified | 2026-08-30 |
| Database | PostgreSQL through Drizzle ORM |
| Primary source | [`backend/src/db/schema.ts`](../../backend/src/db/schema.ts) |

Jaguary persists 25 tables in five domains. The database is more than storage: it is the transaction boundary that makes mandate usage, nonce consumption, authorization reservation, payment state, and audit evidence agree under concurrency.

[Open the complete domain map](../diagrams/database-domain-map.html) · [Open the detailed authority schema](../diagrams/authority-database-schema.html)

## How to read the diagrams

The domain map names every table and keeps the complete system readable. A solid connector means PostgreSQL enforces at least one foreign key between the domains. A dashed connector means the application stores identifiers that connect the domains, but the database does not enforce that relationship. Blue identifies the authorized economic path.

The detailed schema expands the five tables at the core of a purchase: `mandates`, `nonces`, `checkouts`, `authorizations`, and `payments`. It shows selected columns, composite bindings, primary and unique keys, and the foreign keys that keep the proposed checkout tied to the reserved payment.

## Table inventory

| Domain | Tables | Purpose |
| --- | --- | --- |
| Identity and agent trust | `principals`, `principal_auth_identities`, `principal_login_transactions`, `principal_sessions`, `agents`, `agent_attestations`, `agent_attestation_events` | Principal authentication, browser sessions, platform-agent ownership/access scope, and customer-bound trust evidence |
| TravelBot runtime | `travel_conversations`, `travel_messages`, `travel_intent_snapshots`, `travel_model_runs`, `travel_tool_executions`, `travel_approvals`, `travel_sse_events`, `travel_watches`, `travel_watch_checks` | Durable conversation workflow, OpenAI runs, tools, human interruptions, event replay, and autonomous flight watches |
| Commerce inputs | `payment_credentials`, `checkouts` | Logical provider credential references and merchant-authored economic terms |
| Authority and replay | `mandates`, `mandate_biometric_consents`, `nonces`, `authorizations` | Human authority, optional biometric evidence, replay prevention, and transactional `ALLOW` reservation |
| Effect and evidence | `payments`, `orders`, `audit_events` | Provider attempt state, merchant receipt, and correlated append-only evidence |

## The transaction spine

1. `mandates` binds a principal, agent, merchant scope, limits, validity window, and logical credential. Active mandate terms are immutable.
2. `checkouts` persists the merchant-authored amount, currency, items, expiry, checkout hash, and signature.
3. `nonces` binds one signed agent request to a mandate and the exact checkout tuple, preventing replay.
4. `authorizations` records the deterministic decision and reserves an allowed checkout against mandate usage in the same transaction.
5. `payments` references the reserved authorization and credential; its state machine records the provider outcome without accepting economic values from the browser.
6. `orders` closes the path by linking checkout, authorization, payment, and audit evidence to a receipt.

No displayed foreign key declares an explicit delete action, so PostgreSQL uses `ON DELETE NO ACTION`. That is appropriate for durable authority and evidence, but deletion tooling must remove dependent records in an explicit, safe order.

Agent ownership and customer authority are deliberately separate relationships. For public TravelBot, `agents.principal_id` identifies `principal_jaguary_platform` and `access_scope=PUBLIC`; it does not identify a shopper. The principal on an attestation, conversation, mandate, or watch identifies the authenticated customer. PostgreSQL enforces the attestation's agent and customer references independently, allowing one public agent to have isolated identity evidence per customer.

## Integrity boundaries to review

These are current schema facts, not claims that the application is presently producing orphan rows:

- `travel_conversations.selected_checkout_id`, `mandate_id`, `authorization_id`, and `receipt_id` are workflow bindings without foreign keys to commerce, authority, or order tables.
- `travel_approvals.mandate_id` and receipt identifiers on travel watches/checks are also application-level bindings.
- `audit_events.subject_id` and `correlation_id` are intentionally polymorphic evidence references rather than foreign keys. This keeps the ledger generic, so correctness depends on service-level correlation tests.

The solid and dashed edges in the domain map make this distinction visible. Before hardening them, decide the intended deletion/retention lifecycle: adding foreign keys without a retention policy could make privacy deletion or archival workflows impossible to execute safely.

## Source of truth and migrations

The Drizzle schema is the readable model; SQL migrations are the deployed history. A change is complete only when both agree and PostgreSQL integration tests cover its important constraints.

- Schema: [`backend/src/db/schema.ts`](../../backend/src/db/schema.ts)
- Migrations: [`backend/drizzle/`](../../backend/drizzle/)
- PostgreSQL integration test: [`backend/test/database.integration.test.ts`](../../backend/test/database.integration.test.ts)
- Transactional Verify store: [`backend/src/modules/verify/store.ts`](../../backend/src/modules/verify/store.ts)
- Payment persistence: [`backend/src/modules/payments/store.ts`](../../backend/src/modules/payments/store.ts)
