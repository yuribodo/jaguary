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
| `POST` | `/v1/conversations` | create a durable TravelBot conversation |
| `GET` | `/v1/conversations/:id` | reopen backend-stored messages and operation state |
| `POST` | `/v1/conversations/:id/messages` | send user text through the OpenAI-backed TravelBot runtime |

All mutable requests send an `Idempotency-Key` and a client-generated `X-Correlation-Id`. Checkout creation also sends both required UCP capabilities.

The conversation service orchestrates merchant discovery, checkout, mandate, verification, payment and receipt APIs on the server. It expects the backend environment to contain the existing Marta/TravelBot and logical credential references (`principal_marta`, `agent_travelbot`, `cred_demo_marta_visa`). The frontend does not bypass that orchestration or write directly to PostgreSQL.

### Chat behavior and boundaries

- Messages, extracted intent, offers, approval state and receipts are rendered from the durable conversation response. The browser no longer runs a parallel scripted purchase state machine.
- The backend returns one selected recommendation. The chat renders its itinerary, cabin, duration, total and availability directly beside the approval controls, plus an official-flight link; there is no offer-picker tab in the normal journey.
- The sidebar remembers up to eight conversation IDs in local storage and reloads their messages from the API. This is a client-side index because the backend does not expose a conversation-list endpoint.
- Every message uses an idempotency key. A failed response can be retried with the same key, avoiding duplicate turns when the server completed but the network response was lost.
- The microphone control uses the browser Web Speech API when available. Dictation only fills the composer; the user must review and explicitly send it.
- No PAN, CVV, Yuno token, OpenAI key or reusable payment credential enters frontend state. OpenAI and payment execution remain server-side.
