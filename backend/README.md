# Bound backend

Fastify v5 API using TypeScript, ESM, Zod environment validation and Node's test runner through `tsx`.

PostgreSQL 17 is the transactional source of truth. Drizzle owns the versioned schema/migrations and uses `node-postgres` for pooling and dedicated transaction connections.

## Local requirements

- Node.js 20.9 or newer;
- pnpm 10;
- Docker with Docker Compose for the reproducible PostgreSQL environments.

Development and test use separate PostgreSQL instances and databases. The Compose ports are deliberately non-default to avoid colliding with an existing local PostgreSQL: development uses `localhost:55432/bound_dev`; tests use `localhost:55433/bound_test`.

## Environment

Copy `backend/.env.example` to `backend/.env` when running the backend package directly. `DATABASE_URL` is required and must be a `postgres://` or `postgresql://` URL with a host and database name.

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=3001
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://bound_dev:bound_dev_local@localhost:55432/bound_dev
```

`TEST_DATABASE_URL` is used only by migration/integration-test tooling and should point at the isolated test database. Connection URLs, passwords, reusable provider tokens, PAN and CVV must never be logged, committed to fixtures, or stored in the schema. The logger redacts common secret fields; startup/configuration failures emit sanitized messages without the URL.

## Commands

```bash
pnpm dev:backend
pnpm --filter @bound/backend lint
pnpm --filter @bound/backend typecheck
pnpm --filter @bound/backend test
pnpm --filter @bound/backend build
```

The API listens on `http://localhost:3001` by default. Copy `.env.example` to `.env` to override local configuration.

## Database and migrations

From the repository root:

```bash
# Start the isolated development database.
pnpm db:up

# Apply every pending migration to DATABASE_URL.
pnpm db:migrate

# Start and migrate the isolated test database.
pnpm db:test:up
export TEST_DATABASE_URL=postgresql://bound_test:bound_test_local@localhost:55433/bound_test
pnpm db:test:migrate

# Recreate only the ephemeral test container, clearing its state.
pnpm db:test:reset

# Stop both databases and delete the persistent development volume.
pnpm db:down
```

To create a migration after intentionally changing `src/db/schema.ts`, run `pnpm --filter @bound/backend db:generate`, inspect the generated SQL and commit both SQL and Drizzle metadata. Applied migrations are immutable.

## Integration tests

The integration suite never substitutes SQLite or an in-memory database. It resets the dedicated PostgreSQL schemas, migrates an empty database, truncates its own state before each case, and verifies commit, rollback, FKs, checks, replay/idempotency constraints and `SELECT ... FOR UPDATE` concurrency.

```bash
pnpm db:test:up
export TEST_DATABASE_URL=postgresql://bound_test:bound_test_local@localhost:55433/bound_test
pnpm test:integration

# Run the complete repository gate with PostgreSQL integration tests enabled.
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm check
```

Without `TEST_DATABASE_URL`, the PostgreSQL-only cases are reported as skipped so unit-only workflows remain usable. CI always supplies a real PostgreSQL service, so the full integration suite runs there.

## Transaction boundary

Create one `DatabaseConnection` for the process with `createDatabase`, and close it during application shutdown. Repository code receives either `database.db` for a single statement or the `TransactionClient` supplied by `database.transaction`:

```ts
await database.transaction(async (transaction) => {
  await transaction.execute(sql`
    SELECT mandate_id FROM mandates
    WHERE mandate_id = ${mandateId}
    FOR UPDATE
  `);
  // Perform every state change that must commit atomically through transaction.
});
```

The helper reserves one `node-postgres` client for the entire callback, commits on success, rolls back on error and always releases the client. Do not use `database.db` from inside the callback, and never keep a database transaction open while calling Yuno or any other external service. Reserve/transition state in one short transaction, make the external call afterward, then persist the normalized result in another transaction using the same idempotency key.

## Local payment boundary

`POST /authorizations/:id/pay` accepts an empty body and requires the shared `Idempotency-Key` header convention. The service derives the authorized amount, currency, checkout, merchant, principal and logical credential from PostgreSQL, atomically changes `RESERVED` to `PAYMENT_PENDING` while creating one payment attempt, commits, and only then calls the configured `PaymentExecutor`.

Local runs use the deterministic sanitized `FakePaymentExecutor` with an approved outcome by default. Tests can inject any `PaymentExecutor` or configure the fake for `APPROVED`, `DECLINED`, `TIMEOUT` or `UNKNOWN`. The executor receives the authorization ID as its stable provider idempotency key. Retries return a previously persisted result or report a still-pending attempt without executing a second payment.

The claim transaction writes `payment.attempt_started` together with `PAYMENT_PENDING` and the payment attempt. The result transaction writes the normalized result and its audit evidence together: `DECLINED` moves the authorization to `FAILED`; `TIMEOUT` and `UNKNOWN` remain `PAYMENT_PENDING`; `APPROVED` atomically creates the confirmed order/receipt and moves the authorization to `CONSUMED`. Every executor result event explicitly records `payment_executor_called: true`; pre-execution, denied, escalated, revoked, replay and cancelled events explicitly record `false`.

No real Yuno request, webhook or public reconciliation endpoint is present. Internal reconciliation reuses the existing payment attempt and provider idempotency key; it does not create another attempt or invoke the executor again.

## TravelBot chat (BE-13)

TravelBot is a backend-only OpenAI Agents SDK runtime behind `AgentRuntimePort`. PostgreSQL owns the sanitized messages, normalized intent, deterministic state, model-run correlation, tool executions, approvals and replayable SSE events. OpenAI response/session IDs are metadata only. The browser never receives `OPENAI_API_KEY` and never calls OpenAI.

The flight inventory is the existing deterministic VuelaYa catalog returned by `GET /merchant/flights`: the MVP has one GRU → COR economy flight on 2026-09-15 for USD 137. TravelBot does not browse external travel sites. Its only available function tools are the narrow `find_offers`, `create_checkout`, `prepare_authority`, `request_purchase`, `get_receipt` and `get_audit_timeline` contracts. Tool availability is derived from the persisted state and every economic operation is revalidated by application services.

When the intent is complete, the service filters compatible flights and deterministically chooses one recommendation by lowest total price, earliest departure and stable offer ID. It persists only that offer, prepares checkout and authority, then asks for explicit purchase approval with the complete flight details and official source URL. `AWAITING_OFFER_SELECTION` is retained only as an internal/legacy checkout seam; the normal UI has no flight-selection step.

Configure these backend-only environment names to enable OpenAI chat; `.env.example` intentionally contains no values:

```text
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_REQUEST_TIMEOUT_MS
TRAVELBOT_AGENT_PRIVATE_JWK
TRAVELBOT_AGENT_KEY_ID
TRAVELBOT_AGENT_BUILD_FINGERPRINT
TRAVELBOT_DEMO_CREDENTIAL_ID
TRAVELBOT_APPROVAL_ENCRYPTION_KEY
```

The private JWK must match the public TravelBot identity registered by the local BE-12 seed/reset flow. The approval key is a base64-encoded 32-byte key used only to encrypt resumable Agents SDK state at rest. If OpenAI variables are absent, conversation reads/creation remain durable but message processing returns a sanitized retryable `503`; the backend never fabricates an LLM response.

Optional Langfuse export uses the current `@langfuse/tracing`/`@langfuse/otel` adapter and is disabled by default. Set `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL` to enable it. Only normalized IDs, states, tool names, status/reason codes, latency and usage are exported. Raw chat text, prompts, proofs, credentials and financial/provider payloads are never placed on `LlmTelemetryPort`.

| Method | Route | Behavior |
| --- | --- | --- |
| `POST` | `/v1/conversations` | creates an idempotent conversation for `{ principal_id, agent_id }` |
| `GET` | `/v1/conversations/:id` | reads sanitized intent, state, approvals and ordered messages |
| `POST` | `/v1/conversations/:id/messages` | appends one message and commits the deterministic assistant turn |

Mutable calls require both `Idempotency-Key` and `X-Correlation-Id`. Send `Accept: text/event-stream` to the message route for persisted SSE events. Event types are `assistant.delta`, `state.snapshot`, `tool.status`, `confirmation.required`, `turn.completed` and `error`; `id` is the monotonically increasing conversation event sequence. Reconnect with `Last-Event-ID: <sequence>` to recover committed events without repeating a tool or payment.

Authority/purchase approval is bound to merchant, checkout hash, amount, currency and mandate. The SDK interruption is encrypted and persisted before confirmation is requested. A changed field cancels it; explicit denial rejects it; a matching explicit confirmation resumes it once. Application confirmation—not SDK `needsApproval`—is consent. The final purchase always runs signed Verify/reservation and `PaymentService`; TravelBot has no `PaymentExecutor` dependency.

For the BE-12 one-command local reset hook, run:

```bash
pnpm --filter @bound/backend db:demo:reset
```

This non-production command clears chat and transactional purchase data while retaining the registered demo identity, credential reference and append-only audit ledger. Re-running migrations after the reset is safe.

## Postman collection

Import `postman/Bound API.postman_collection.json` into Postman and start the API with `pnpm dev:backend`. The collection uses `http://localhost:3001` by default and exercises the public VuelaYa, Verify, payment, receipt, audit, correlation and error surfaces without embedding a private signing key or reusable credential. The fully approved signed flow is covered by the PostgreSQL integration suite because it requires a runtime agent proof and committed authorization.

Run the same collection from the command line with:

```bash
pnpm dlx newman@6.2.1 run "backend/postman/Bound API.postman_collection.json"
```

Whenever an endpoint or public contract changes, update this collection in the same change. Add the happy path, relevant validation/error examples, assertions for `X-Correlation-Id`, and `Idempotency-Key` on mutable requests. The backend test suite parses the collection to prevent malformed JSON, missing request tests, or accidental credential material.

## Initial boundaries

- `src/routes`: HTTP transport only.
- `src/config`: validated environment and runtime configuration.
- Domain modules should live under `src/modules/<module>` and expose services to routes.
- Payment credentials and vendor secrets stay behind server-side adapters; they never enter route responses or agent tools.

## Versioned backend contracts

All backend modules must import shared domain schemas, inferred TypeScript types, state transitions, reason codes and ports from the single v1 entry point:

```ts
import {
  moneySchema,
  type Money,
  type CommerceProtocolAdapter,
  type PaymentExecutor,
} from "../contracts/v1/index.js";
```

Do not duplicate these shapes inside Trust Core, VuelaYa/UCP or Payments. Breaking changes require a new versioned entry point; compatible additions can be made to v1 deliberately and with contract tests.

Database modules follow the same rule: import enum schemas and domain types only from `src/contracts/v1/index.ts`. SQL migrations contain the materialized `CHECK` values generated from that entry point; do not create private TypeScript enums beside the database schema.

The v1 conventions are:

- money is an integer `amount` in minor units plus an uppercase ISO 4217 `currency`;
- timestamps are RFC 3339 UTC strings ending in `Z`;
- signed payload schemas are strict and reject unknown properties;
- signed JSON is canonicalized with RFC 8785/JCS before SHA-256 hashing;
- payment contracts expose only a logical `credential_id` and masked `display` value;
- timeout and unknown payment results remain non-terminal and must keep the authorization `PAYMENT_PENDING` until reconciliation.

Sanitized deterministic examples for Marta, TravelBot, VuelaYa and the GRU → COR flight are also exported from the v1 entry point. Fixtures never contain a PAN, CVV, private key, provider secret or reusable vaulted token.

## HTTP conventions

Every response includes `X-Correlation-Id`. A syntactically valid client-provided value is preserved; otherwise the API generates a UUID. Public errors use this body and never include stack traces:

```json
{
  "error": {
    "code": "amount_limit_exceeded",
    "message": "Checkout amount exceeds the mandate limit",
    "details": {}
  },
  "correlation_id": "corr_purchase_001"
}
```

## Agent identity and signed requests

The Trust API persists public-only TravelBot identities and exposes:

- `POST /trust/v1/agents` to register an agent (`Idempotency-Key` required);
- `GET /trust/v1/agents/:agentId` to read the registered public identity;
- `POST /trust/v1/agent-requests/verify` to verify a signed request envelope and return normalized identity, nonce and validity data.

Agent keys are strict public P-256 JWKs and active agents use ES256. The compact JWS payload is the RFC 8785/JCS representation of the strict envelope. The envelope binds the HTTP method, route, canonical body hash, agent ID, key ID, build fingerprint, issue time, expiry and nonce. Verification uses the injected `ClockPort`; it does not consume the nonce. Atomic nonce replay enforcement belongs to the future authorization transaction.

Private JWK material is rejected by the registration contract. Request logs contain only the agent ID, key ID and correlation ID; request bodies, proofs, signatures and key material are redacted.

Every `POST`, `PUT`, `PATCH` and `DELETE` request must include an `Idempotency-Key` containing 8–128 safe ASCII characters (`A-Z`, `a-z`, digits, `.`, `_`, `:`, `-`). This issue validates the key at the transport boundary; persistence and replay of stored responses belong to the endpoint implementation workstreams.

The initial mutable surfaces are expected to follow the same rule: agent and mandate creation/transitions, merchant checkout creation/completion, verify, payment execution and demo reset. Read-only profile, offer, checkout, authorization, receipt and audit routes still receive correlation IDs but do not require idempotency keys.

### Initial endpoint contract map

These are transport boundaries for the follow-up workstreams, not endpoints implemented by BE-01:

| Surface | Input / output contract |
| --- | --- |
| `POST /agents` | `AgentIdentity` |
| `POST /mandates`, mandate transitions | `Mandate` with `MandateStatus` |
| `GET /.well-known/ucp` | `MerchantCapabilities` |
| offer discovery | `OfferCandidate[]` |
| `POST /ucp/v1/checkout` | `PurchaseIntent` → `NormalizedCheckout` |
| `POST /ucp/v1/checkout/:id/complete` | `AuthorizedCheckout` → `OrderReceipt` |
| `POST /verify` | `AgentRequestProof` + `NormalizedCheckout` → `AuthorizationDecision` / `ReservedAuthorization` |
| `POST /authorizations/:id/pay` | `AuthorizedPayment` → `PaymentResult` |
| receipt and audit reads | `OrderReceipt` / `AuditEvidence` |

For example, a payment module receives the approved reference `{ "credential_id": "cred_demo_marta_visa", "display": "Visa •••• 4242" }` inside `AuthorizedPayment`; it never accepts a card number or provider-vault token through this contract.

## Mandate lifecycle (BE-04)

The mandate module persists the exact flight-purchase authority approved by the principal. Its public lifecycle is deliberately small:

| Method | Route | Behavior |
| --- | --- | --- |
| `POST` | `/v1/mandates` | creates an unsigned `DRAFT`; a repeated key and identical body returns the original draft |
| `GET` | `/v1/mandates/:id` | reads the current state and atomically materializes `EXPIRED` at `expires_at` |
| `POST` | `/v1/mandates/:id/activate` | signs the canonical terms and performs the only `DRAFT` → `ACTIVE` transition |
| `POST` | `/v1/mandates/:id/revoke` | idempotently performs `ACTIVE` → `REVOKED` with its audit event in the same transaction |

All mutable routes require `Idempotency-Key`. Request bodies are strict and reject unknown fields. A mandate contains principal and agent identity, merchant IDs and/or categories, route, cabin, per-purchase and aggregate limits, currency, validity, maximum uses and a logical credential reference. Responses expose a defensively masked credential display; they never expose provider tokens, card data or signing keys.

`DRAFT` has no hash, signature or activation time. Activation validates the time window, canonicalizes `MandateTerms` with RFC 8785/JCS, stores its SHA-256 and signs the same bytes through `SignerPort`. Terms and proofs are immutable after activation. Changing authority requires a new `mandate_id` linked through `supersedes_mandate_id`; the server calculates the next version.

`MandateService.loadActiveMandate()` is the internal seam for BE-06. It returns only signed `ACTIVE` authority inside its validity window. Draft, future, revoked, expired and consumed authority fails closed with a stable reason code. Actual usage reservation/consumption remains owned by BE-07; payment execution is not part of this module.

PostgreSQL enforces proof shape, scope/currency/route constraints, state transitions and post-activation immutability. Expiry uses only the injected `ClockPort`. Revocation locks the mandate row and writes `mandate.revoked` to `audit_events` in the same commit.

## VuelaYa UCP subset (BE-05)

VuelaYa is the deterministic P0 merchant for principal Marta and agent TravelBot. It implements only the local normalized subset required by the flight demo, pinned to the UCP `2026-08-25` snapshot:

- `dev.ucp.shopping.checkout`;
- `dev.ucp.common.payment.ap2_mandate`, extending Checkout;
- deterministic offer discovery, checkout creation/read, authorized completion and order receipt read;
- merchant-authored `CheckoutTerms`, RFC 8785/JCS canonicalization, SHA-256 and a detached ES256 signature.

This is not a claim of full UCP conformance. The public body at `/.well-known/ucp` intentionally validates against the frozen local `MerchantCapabilities` contract rather than reproducing the complete upstream business-profile schema. Its `Link` response header advertises the implemented local endpoints. The signed fixture retains `https://demo.vuelaya.example` as its stable merchant identity; all executable API calls use `http://localhost:3001`.

### Routes

| Method | Route | Contract / behavior |
| --- | --- | --- |
| `GET` | `/.well-known/ucp` | `MerchantCapabilities`; Checkout + AP2 and local endpoint links |
| `GET` | `/merchant/flights` | `OfferCandidate[]`; one GRU → COR flight for USD 137 (`amount: 13700`) |
| `POST` | `/ucp/v1/checkout` | strict `PurchaseIntent` → merchant-authored `NormalizedCheckout` |
| `GET` | `/ucp/v1/checkout/:id` | reads a non-expired signed checkout |
| `POST` | `/ucp/v1/checkout/:id/complete` | strict `AuthorizedCheckout` → idempotent `OrderReceipt` |
| `GET` | `/ucp/v1/orders/:id` | reads the sanitized merchant receipt |
| `GET` | `/receipts/:receiptId` | reads the same persisted sanitized receipt by canonical receipt ID |
| `GET` | `/audit/:correlationId` | reads the validated, complete correlated audit timeline |

Mutable routes require `Idempotency-Key`. Checkout creation and completion also require `UCP-Capabilities: dev.ucp.shopping.checkout,dev.ucp.common.payment.ap2_mandate`; omitting AP2 is treated as a downgrade and fails closed. Every response carries `X-Correlation-Id`. Completion is an idempotent read of the already confirmed order and does not fabricate a new audit event.

### Sanitized local flow

Start the API:

```bash
pnpm dev:backend
```

Discover the profile and offer:

```bash
curl -i http://localhost:3001/.well-known/ucp
curl -i http://localhost:3001/merchant/flights
```

Create the frozen USD 137 checkout. The agent supplies intent and quantity, never price, items or total:

```bash
curl -i -X POST http://localhost:3001/ucp/v1/checkout \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: idem_readme_checkout_001' \
  -H 'UCP-Capabilities: dev.ucp.shopping.checkout,dev.ucp.common.payment.ap2_mandate' \
  -d '{
    "intent_id":"intent_travelbot_vy_471",
    "agent_id":"agent_travelbot",
    "merchant_id":"merchant_vuelaya",
    "offer_id":"offer_vy_471_gru_cor",
    "quantity":1,
    "requested_at":"2026-08-29T12:01:00.000Z"
  }'
```

The authoritative terms hash is `d2f3856b7bac0531b71ac6ff9e2e2fd7f970d38d3fcef79afde052b77b0f071d`. Use the Postman collection for the complete request because it captures the runtime checkout signature and submits it with the sanitized `ReservedAuthorization` fixture before reading the resulting order.

### Integrity, state and limitations

- Checkout terms are validated with the strict v1 schema before canonicalization. Object-property order does not affect the RFC 8785/JCS hash; changing price, currency, route, cabin, item, merchant or expiry does.
- The signer is available only through `SignerPort`. A P-256 keypair is generated in memory at process startup; no private key is exported, logged, stored or versioned. Checkout fixtures remain runtime-local, while completed orders and receipts are persisted when PostgreSQL is configured.
- The default application clock is the fixed demo instant `2026-08-29T12:04:01.000Z`, keeping the P0 fixture reproducible. Tests inject later clocks to prove offer, checkout and authorization expiry behavior. A production adapter must use an injected system clock and durable storage.
- Payment approval creates the order, `order.confirmed` event, receipt and `CONSUMED` transition in the same transaction. Completion requires a schema-valid authorization/checkout binding and returns that persisted confirmed order; a bare `ALLOW` declaration or caller-invented payment is rejected. One receipt is stored per checkout, authorization and payment, so retries return the same object.
- `payment_id` in the merchant receipt is the sanitized logical ID returned by the configured executor. VuelaYa never resolves a credential, invokes `PaymentExecutor`, calls Yuno or executes payment.
- External websites, browser automation, real Yuno calls and LLM behavior remain outside this module.

## Pure Bound Verify policy (BE-06)

`modules/verify/evaluate()` is the pre-reservation policy seam. It receives v1 agent, mandate, normalized authorization and checkout contracts plus explicit signature results, evaluation time, aggregate usage, nonce state and human-approval requirement. It performs no I/O and never reads the system clock.

Rules run in a fixed order: agent proof/state, mandate proof/state/binding, principal/agent binding, merchant, checkout integrity/signature, route/cabin scope, amount/currency, validity, aggregate usage and nonce/replay. Missing, malformed and unknown inputs return `DENY`; a valid request returns `ALLOW`, while an otherwise valid request marked for approval returns `ESCALATE human_approval_required`.

The result is the shared v1 `PolicyEvaluation`, containing stable reasons, `bound.verify.v1` and deterministic evidence inputs. It intentionally has no `authorization_id` or final `evidence_hash`: `POST /verify`, transactional reservation, replay insertion and final response construction belong to BE-07.

## Atomic Bound Verify reservation (BE-07)

`POST /verify` uses the existing signed-request envelope. `request_body` is strict and contains the shared v1 `NormalizedAuthorization` and merchant-authored `NormalizedCheckout`; `proof` is the shared v1 `AgentRequestProof` and must bind `POST`, `/verify` and the canonical request body.

```json
{
  "request_body": {
    "authorization": { "...": "NormalizedAuthorization" },
    "checkout": { "...": "NormalizedCheckout" }
  },
  "proof": { "...": "AgentRequestProof" }
}
```

Identity, agent signature, active signed mandate, authoritative VuelaYa checkout, checkout signature, normalized authorization, aggregate usage and nonce state are loaded before the pure `evaluate()` call. `DENY` and `ESCALATE` return the v1 `AuthorizationDecision` without writing a checkout, nonce or payable authorization.

An `ALLOW` candidate enters one short PostgreSQL transaction. Replay/idempotency advisory locks are acquired in deterministic order, the mandate row is locked with `SELECT ... FOR UPDATE`, and the transaction reloads agent/mandate state, cancels stale reservations, recomputes aggregate usage, rechecks nonce/checkout replay and calls the same pure `evaluate()` function again. Only the final transactional `ALLOW` inserts the signed checkout, nonce, `RESERVED` authorization and `authorization.reserved` audit event. Any failure rolls all four writes back, and `authorization_id` is returned only after commit.

Capacity includes every unexpired `RESERVED` authorization plus all `PAYMENT_PENDING` and `CONSUMED` authorizations. A `RESERVED` authorization expires at the earliest of checkout, normalized authorization and mandate expiry. On the next locked verification for that mandate, an expired `RESERVED` row transitions atomically to `CANCELLED`, emits `authorization.cancelled` with reason `reservation_expired`, and releases capacity. Explicitly `CANCELLED` and terminal `FAILED` rows do not count. `PAYMENT_PENDING` is never auto-cancelled or released because its external payment result may be unknown.

An exact retry with the same `Idempotency-Key`, signed proof and request body returns the committed decision and original `authorization_id`. Reusing a key with different content returns `idempotency_conflict`. Reusing a nonce or an already reserved checkout/request under another key returns `DENY replay_detected` and creates nothing. `policy_version` is `bound.verify.v1`; `evidence_hash` is the SHA-256 of the RFC 8785/JCS canonical `PolicyEvaluation`, so identical evidence inputs produce the same hash.

## Tamper-evident audit and receipts (BE-11)

Audit payloads are parsed through an event-specific strict allowlist before storage. They contain logical IDs, hashes, masked or hashed references, state, reason codes and authorized monetary values only. Raw request proofs, authentication headers, PAN, CVV, private keys, reusable provider tokens and raw Yuno payloads are neither accepted by the ledger nor returned by receipt/timeline endpoints.

Each subject chain uses:

```text
payload_hash = SHA-256(JCS(sanitized_payload))
event_hash   = SHA-256(JCS(event_id, correlation_id, event_type,
                          subject_id, payload_hash, previous_hash, recorded_at))
```

Authorization, payment and order events use `authorization_id` as their common subject. PostgreSQL advisory locks serialize concurrent appends. Before an append or public read, the service reconstructs the links and recomputes `payload_hash`, `previous_hash` and `event_hash`; an inconsistent chain fails closed with a sanitized `internal_error` rather than returning partial or untrusted evidence. The chain detects database changes, but it is not a blockchain or an external immutability guarantee. An operator able to replace database protections could rewrite both rows and hashes; production should anchor/export chain tips to immutable storage.

Public reads are:

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/audit/:correlationId` | resolves Verify or Pay correlation IDs to the same complete ordered flow and validates every returned subject chain |
| `GET` | `/receipts/:receiptId` | reads the persisted `OrderReceipt` by `receipt_id` and validates its full authorization chain |
| `GET` | `/ucp/v1/orders/:orderId` | reads the same receipt by merchant `order_id` |

Different Verify and Pay HTTP correlation IDs are retained as sanitized `request_correlation_id` evidence, while all events in the payment flow use the Verify authorization correlation as the canonical chain correlation. Lookup through either persisted ID resolves to the full chain; the API does not label a literal correlation-ID subset as a complete timeline.

Audit and business writes share transaction boundaries:

- mandate/revocation and Verify reservation/decision events roll back with their state changes;
- `payment.attempt_started` rolls back with the `PAYMENT_PENDING` transition and attempt insert;
- payment result evidence and `order.confirmed` roll back with the result, order/receipt insertion and terminal-state update.

Terminal evidence uses an internal unique deduplication key, so retries do not append another decision, payment result or order event. The receipt stores the real audit event hashes and remains readable after process restart.
