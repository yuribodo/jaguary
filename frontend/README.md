# Bound frontend

Next.js App Router application with TypeScript, Tailwind CSS v4, shadcn/base-nova, Vercel AI Elements and ESLint.

## Commands

```bash
pnpm dev:frontend
pnpm --filter @bound/frontend lint
pnpm --filter @bound/frontend typecheck
pnpm --filter @bound/frontend build
```

Copy `.env.example` to `.env.local` only when the backend URL differs from `http://localhost:3001`.

## Initial boundaries

- `src/app`: routes, layouts and route-level composition.
- `src/components`: reusable UI and client-side behavior.
- Browser code may call the public Bound API, but never receives payment or signing secrets.

## Trusted Surface foundation

The first Trusted Surface follows `docs/design/design.md` and the approved **Carta de Autoridade** moodboard. Its primary interaction is a chat thread: the travel request, VuelaYa offer, mandate review and explicit authority actions remain in one readable conversation. Browser requests are isolated in `src/lib/bound-api.ts` and use `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`). Every available `X-Correlation-Id` is retained and exposed in the header evidence control; public API errors also show the correlation ID returned in the error envelope.

The conversation shell uses the installed AI Elements Conversation, Message, PromptInput, Suggestion, Shimmer and Confirmation components over shadcn primitives. Application layout and domain widgets use Tailwind utilities; `globals.css` is limited to framework imports and semantic moodboard tokens.

### Real endpoints connected

| Method | Endpoint | Use in the surface |
| --- | --- | --- |
| `GET` | `/health` | API availability |
| `GET` | `/trust/v1/agents/agent_travelbot` | public TravelBot identity, status, key ID and build fingerprint |
| `GET` | `/.well-known/ucp` | VuelaYa merchant identity and UCP profile |
| `GET` | `/merchant/flights` | GRU → COR offer discovery and empty state |
| `POST` | `/ucp/v1/checkout` | merchant-authored checkout with AP2 capabilities, hash and signature |
| `POST` | `/v1/mandates` | unsigned `DRAFT` creation |
| `POST` | `/v1/mandates/:id/activate` | explicit user activation |
| `GET` | `/v1/mandates/:id` | mandate detail and current-state refresh |
| `POST` | `/v1/mandates/:id/revoke` | explicit, confirmed revocation |

All mutable requests send an `Idempotency-Key` and a client-generated `X-Correlation-Id`. Checkout creation also sends both required UCP capabilities.

The mandate API expects the backend environment to contain the existing Marta/TravelBot and logical credential references (`principal_marta`, `agent_travelbot`, `cred_demo_marta_visa`). The frontend does not bypass those references or write directly to PostgreSQL.

### Deliberately not connected or simulated

- There is no chat or LLM API in this release. The composer starts the fixed GRU → COR demonstration and a deterministic client state machine arranges real API results in the thread; it does not claim to understand arbitrary travel requests.
- No `POST /verify` call is made. The implemented identity verification route is not presented as the future Bound purchase decision.
- `src/lib/authorization-state.ts` defines the replaceable `AuthorizationDecisionSource` seam for the future HTTP decision/reservation integration. The pure BE-06 policy now exists in the backend, but `POST /verify` and BE-07 reservation do not; the current UI state is `NOT_CONNECTED` and does **not** fabricate `ALLOW`, `DENY` or `ESCALATE`.
- Checkout completion, order receipts, authorization reservation/consumption, payment execution and Yuno are outside this surface.
- There is no `pay()` tool or payment action.
- No PAN, CVV, Yuno token or reusable payment credential enters frontend state. Only the logical credential reference and defensively masked display returned by the mandate API are rendered.
- The proposed policy values (economy cabin, USD 150 per-purchase/aggregate limit, one use and 24-hour validity) are local review inputs derived from the P0 demo brief; the resulting mandate state, signature, hash and timestamps are always read from real API responses.
