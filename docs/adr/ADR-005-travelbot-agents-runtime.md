# ADR-005 — Deterministic TravelBot over OpenAI Agents SDK

- Status: accepted
- Date: 2026-08-29

## Context

The local MVP needs a natural-language TravelBot that can complete the existing VuelaYa → Bound Verify → fake payment path. Model output is untrusted and cannot own purchase state, consent, idempotency, authority or payment decisions.

## Decision

Use one OpenAI Agents SDK for TypeScript `Agent` behind the application-owned `AgentRuntimePort`. No domain or application contract imports SDK types. The runner uses the Responses provider with `store: false`, parallel tool calls disabled, strict Zod function schemas, SDK tracing disabled for sensitive content and one bounded structured-output repair.

PostgreSQL is the source of truth for conversations, ordered sanitized messages, intent snapshots, model runs, normalized tool executions, encrypted approval interruptions and replayable SSE events. Provider response/run identifiers are correlation metadata only.

The application owns this state machine. In the normal user journey it ranks compatible offers deterministically (lowest total, earliest departure, then stable offer ID), keeps one best match and proceeds directly to purchase approval:

```text
COLLECTING → READY_TO_SEARCH → AWAITING_AUTHORITY_CONFIRMATION
→ READY_TO_PURCHASE
→ EXECUTING → COMPLETED | FAILED
```

`AWAITING_OFFER_SELECTION` remains an internal compatibility seam for checkout preparation and legacy persisted conversations; it is not a selection screen in the normal flow. The chosen offer, its complete trip details and its official source URL are returned with the approval request. The user only confirms or denies that bound purchase.

It recomputes completeness and legal tools after every proposal. Tool handlers reload the persisted conversation and fail closed if a tool is stale or unavailable. Mutation tools are committed only by `TravelBotService`; the model cannot call `PaymentExecutor`, mint an authorization decision or choose an idempotency key. Purchase goes through the existing mandate, signed Verify/reservation, `PaymentService`, persisted order/receipt and audit services.

`needsApproval` pauses SDK execution but does not represent user consent. The application persists the interruption encrypted with AES-256-GCM, binds consent to merchant, checkout hash, amount, currency and mandate, and resumes once only after exact explicit confirmation. Corrections cancel the pending approval; denial rejects it.

`LlmTelemetryPort` is no-op by default. The optional Langfuse adapter exports only allowlisted normalized metadata asynchronously and best-effort. Raw messages, prompts, proofs, credentials, provider payloads and receipt/audit bodies are excluded.

## Consequences

- Tests use deterministic `AgentRuntimePort` and telemetry fakes; the only OpenAI-shaped test uses a local request spy.
- A valid configured model and backend-only agent signing/encryption material are required to process messages; missing OpenAI configuration is explicit and never simulated.
- The MVP inventory remains the local VuelaYa GRU → COR fixture. Adding a real travel provider requires another narrow commerce adapter, not browser/HTTP tools for the model.
- Persisted SSE event sequences make disconnect recovery a read/replay concern and do not repeat committed side effects.
