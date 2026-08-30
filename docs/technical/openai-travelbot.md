# OpenAI and TravelBot

| Metadata | Value |
| --- | --- |
| Status | Implemented, configuration required |
| Purpose | Natural-language intent extraction and constrained agent interaction |
| SDK | OpenAI Agents SDK for TypeScript using the Responses API |
| Primary code | [`backend/src/modules/travelbot/openai-runtime.ts`](../../backend/src/modules/travelbot/openai-runtime.ts) |

[Open the OpenAI turn sequence](../diagrams/openai-travelbot-sequence.html).

## What OpenAI is for

OpenAI gives TravelBot a conversational interface. It extracts origin, destination, date, passenger count, cabin, budget, selection, and explicit confirmation from user text. It can use recent sanitized history and propose narrow function-tool calls.

It is not the policy engine. It does not decide whether the agent is trusted, whether a mandate is active, whether a checkout matches, whether a nonce was used, or whether payment is allowed.

The implementation follows the official Responses API model: model input can produce structured output and function calls, while application code executes custom functions and returns their results. See the [OpenAI Responses API reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).

## One turn

1. `POST /v1/conversations/:id/messages` validates the message, correlation ID, and idempotency key.
2. `TravelBotService` atomically claims the turn. A replay returns the already committed conversation.
3. The runtime receives sanitized recent history plus normalized backend state. User text and tool results are explicitly treated as untrusted data.
4. The Agents SDK runs with `store: false`, parallel tool calls disabled, strict Zod schemas, a bounded turn count, and SDK tracing disabled.
5. Structured output is parsed. One invalid output gets a single repair attempt; otherwise application code produces a deterministic clarification.
6. Application policy merges and validates the proposal, recomputes missing fields, and derives the next legal state/tools.
7. Business mutations are performed by `TravelBotService` and application services, not by the model-side tool executor.
8. The turn, state transition, sanitized tool records, and replayable SSE events commit to PostgreSQL.

## Tools

| Tool | Why it exists | Economic authority |
| --- | --- | --- |
| `find_offers` | Search the typed VuelaYa catalog, backed by Google Flights through SerpApi when configured | Read-only |
| `create_checkout` | Refer to a persisted selected offer | Proposal only; application creates checkout |
| `prepare_authority` | Prepare the authority workflow | Application-owned |
| `request_purchase` | Pause for an exact explicit approval | Cannot bypass persisted confirmation |
| `get_receipt` | Return a sanitized completed receipt | Read-only |
| `get_audit_timeline` | Return sanitized event names/counts | Read-only |

Tool availability comes from persisted conversation state. The executor reloads the conversation before every call and rejects stale or illegal tools. Mutation tools return `application_commit_required` when invoked only from the model loop; the service performs the real operation after validating current state.

The live offer path is described separately in [Google Flights search through SerpApi](google-flights-search.md). OpenAI never receives the SerpApi key and does not call the flight provider directly.

## Approval is not delegated to the SDK

The Agents SDK `needsApproval` interruption creates a pause, not consent. Bound encrypts the resumable SDK state with AES-256-GCM and binds the pending approval to `merchant_id`, `checkout_hash`, `amount`, `currency`, and `mandate_id`. A changed field cancels it. A matching explicit confirmation can resume it once.

## Privacy and failure boundaries

- The browser never receives `OPENAI_API_KEY`.
- Prompts, raw model payloads, proofs, credentials, and receipt bodies are excluded from telemetry.
- Messages are redacted before model input and only sanitized application records are durable.
- Missing OpenAI configuration installs `UnavailableAgentRuntime`; reads remain durable but message processing returns a retryable sanitized failure rather than a fake model response.
- Rate limits, timeouts, connection errors, and provider 5xx responses map to explicit unavailable errors.

## Configuration

The backend validates `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REQUEST_TIMEOUT_MS`, the TravelBot signing material, and the approval encryption key. See [`backend/.env.example`](../../backend/.env.example) and [`backend/README.md`](../../backend/README.md#travelbot-chat-be-13).
