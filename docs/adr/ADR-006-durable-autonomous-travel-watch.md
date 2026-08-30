# ADR-006 — Durable autonomous travel watch

- Status: accepted
- Date: 2026-08-30

## Context

TravelBot previously performed one synchronous inventory search. When no flight matched the route, date, cabin, passenger count and total budget, it returned no offers and stopped. Requiring liveness only after a future match would also make an unattended purchase impossible at the moment it matters.

## Decision

Add a durable automatic travel watch owned by the application. The user approves its complete authority before monitoring begins. The authority is a one-use conditional mandate bound to principal, agent, merchant, route, cabin, departure window, passenger count, total currency and hard maximum amount. Its expiry cannot outlive the departure window.

```text
create watch + draft mandate
        ↓
AWAITING_LIVENESS ── verified biometric consent ──→ ACTIVE
                                                      ↓
                              due claim → CHECKING → no match → ACTIVE
                                               └──→ valid match → Verify → pay → COMPLETED
```

Liveness signs and activates the conditional mandate at watch activation. A later purchase loads that already-active mandate and does not request liveness again. Verify still rechecks the signed mandate, checkout economics, flight window and passenger quantity immediately before payment.

PostgreSQL is the source of truth for watches and check attempts. Workers claim due work with `FOR UPDATE SKIP LOCKED`, use a reclaimable lease, and use stable idempotency identities for checkout, Verify and payment. A process restart therefore resumes monitoring without recreating authority or duplicating a purchase.

No inventory schedules another check. A nearest over-budget offer is stored as diagnostic data and shown as a suggestion only. The approved budget is immutable: the agent never increases it. A different budget requires a new watch, new mandate and new liveness approval.

Temporary provider failures retry with bounded backoff. A stale checkout is searched again; non-recoverable Verify or payment outcomes stop the watch. Cancellation revokes an active mandate before stopping future checks. Mandate expiry independently prevents purchases if watch scheduling state is stale.

The first public version exposes only `AUTO_PURCHASE`. The broader mode enum reserves an ask-before-purchase evolution, but requests for that mode fail validation until its separate approval flow exists.

## Consequences

- The foreground search can distinguish a valid match, no inventory and the nearest offer above budget.
- The UI can rediscover the latest watch by conversation and poll its durable state after redirects or reloads.
- Autonomous execution depends on the same merchant checkout, signed agent proof, Verify, payment, receipt and audit path as an interactive purchase.
- Monitoring latency is controlled by the due interval and worker wake-up interval; it does not keep an HTTP request or in-memory timer per user open.
- Increasing a budget is intentionally never autonomous.
