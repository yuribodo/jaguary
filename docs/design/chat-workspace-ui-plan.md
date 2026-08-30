# Bound Chat Workspace — UI/UX direction

Status: revised frontend direction, 2026-08-29

## Product thesis

Bound is a chat-first workspace where a person can ask an agent to act, understand what it is doing, constrain its authority, and see the economic consequence before money moves.

The chosen direction is **Chat Workspace**: a light, familiar conversation surface with conversation history on the left and a compact contextual panel on the right. The chat remains the product; the panel supports it without turning the experience into a technical dashboard.

Intended qualities: precise, observable, calm.

Anti-qualities: conversationally vague, finance-dashboard generic, falsely celebratory.

## Reference findings

- [Microsoft UX design for agents](https://microsoft.design/articles/ux-design-for-agents/): agent actions should remain visible and controllable, with uncertainty and status exposed. Bound implements this as a deterministic execution timeline beside the conversation.
- [Microsoft Human–AI Interaction Guidelines](https://www.microsoft.com/en-us/research/?p=564561): clarify capabilities, support correction, explain behavior, and convey action consequences. Bound separates request, checkout, authority, verification, and payment into visible stages.
- [Nielsen Norman Group: visibility of system status](https://www.nngroup.com/articles/visibility-system-status/): feedback should keep the user oriented and preserve trust. Bound uses persistent state in place of transient success toasts for economic events.
- [Google Flights: best fares](https://support.google.com/travel/answer/7664728): “best” is a tradeoff between price, convenience, and booking ease, while the cheapest option may carry self-transfer or airport-change costs. Bound therefore shows airline, local times, duration, stops, party total, and source instead of ranking by price alone.
- [KAYAK search and discovery](https://www.kayak.com/c/help/search/): flight comparison needs explicit traveler count, filters, live-source context, and honest language around predictive or changing prices. Bound repeats passenger count and marks each observed fare as subject to checkout reconfirmation.
- [Airbnb special offers](https://www.airbnb.com/help/article/128): an offer sent inside a message thread should be reviewed again with its price and payment information before confirmation. Bound uses the same continuity principle for its in-chat flight offer and authorization artifact without copying Airbnb’s visual treatment.

## Information architecture

1. **History panel** — operations and their durable status.
2. **Conversation** — the primary surface and the artifact currently being reviewed.
3. **Details** — task progress, spending limit, and fixed transaction context.
4. **Composer** — always available for the next user instruction.

On narrow screens the center remains primary, the left navigation becomes a sheet, and critical money impact is repeated inside the authority artifact because the inspector is not visible.

The mobile conversation also contains a persistent “Entendi sua viagem” artifact. It makes the agent’s interpretation correctable without requiring the user to open the desktop-only inspector. Fare actions stack below totals on narrow widths and preserve a 44px tap target.

## Interaction state model

| Stage | Agent feedback | Financial language | User control |
| --- | --- | --- | --- |
| Request | Intent extracted: route, cabin, ceiling | No impact yet | Edit or restart request |
| Offer | Merchant and price found | “Purchase proposed” | Select or ignore |
| Checkout | Commercial terms fixed and signed | “Nothing spent or reserved” | Review evidence |
| Draft | Authority terms persisted | “Will remain after purchase” | Activate or leave as draft |
| Active mandate | Authority signed and revocable | Still not a purchase | Revoke or continue |
| Verify | ALLOW, DENY, or ESCALATE with reason | Reserved only after committed ALLOW | Correct scope or stop |
| Payment pending | Provider called; result unresolved | “Reserved / pending,” never “spent” | Wait or inspect evidence |
| Approved | Order and receipt confirmed | Explicit negative delta and remaining balance | Open receipt |
| Declined | No order created | Show no debit and released/failed state | Retry only through a new authorized attempt |
| Revoked | Authority ended | “No funds moved” when applicable | Create a new mandate |

## Spending envelope rules

- Show total authority and current available amount together.
- Before payment, label the amount as **proposed**, never spent.
- After committed authorization, use **reserved** only when the backend confirms a reservation.
- After approval and receipt persistence, animate the ledger delta once: `− US$137`, then settle on the new available balance.
- Do not rely on color alone; pair state with a label, icon, amount, and timestamp/evidence when available.
- A timeout or unknown payment result must remain pending. Never reset the balance optimistically.

## Motion and feedback

- Timeline steps change only when their backend-backed state changes.
- Search feedback names the current operation (“consultando voos”, “fixando a oferta”, or “validando a autorização”) instead of using an indefinite typing indicator.
- Progress indicators use restrained pulses for active work; completed steps settle without looping motion.
- Balance changes transition over 300–500 ms and retain the final textual delta in transaction history.
- Destructive revocation always has a confirmation step.
- Reduced-motion preferences remove animated scrolling, pulses, and balance interpolation.

## Backend connection sequence

1. Replace the current `NOT_CONNECTED` decision source with the signed agent-orchestration endpoint; do not sign agent requests in browser code.
2. Feed `ALLOW | DENY | ESCALATE`, reason codes, and `authorization_id` into the execution timeline.
3. Connect payment execution and represent `APPROVED | DECLINED | TIMEOUT | UNKNOWN` without collapsing pending states.
4. Load the persisted order receipt and audit timeline after approval.
5. Derive spent/reserved/available amounts from backend authorization and receipt evidence, not from frontend inference.

The current implementation intentionally stops before steps 1–5 when those endpoints cannot be called securely from the frontend. It exposes that boundary in the UI rather than simulating success.
