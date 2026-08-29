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

## Postman collection

Import `postman/Bound API.postman_collection.json` into Postman and start the API with `pnpm dev:backend`. The collection uses `http://localhost:3001` by default and executes the complete VuelaYa profile → offer → signed checkout → authorized completion → order flow, plus public error, correlation ID and mutable-request idempotency checks.

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

## VuelaYa UCP subset (BE-05)

VuelaYa is the deterministic P0 merchant for principal Marta and agent TravelBot. It implements only the local normalized subset required by the flight demo, pinned to the UCP `2026-08-25` snapshot:

- `dev.ucp.shopping.checkout`;
- `dev.ucp.common.payment.ap2_mandate`, extending Checkout;
- deterministic offer discovery, checkout creation/read, authorized completion and order receipt read;
- merchant-authored `CheckoutTerms`, RFC 8785/JCS canonicalization, SHA-256 and a detached ES256 signature.

This is not a claim of full UCP conformance. The public body at `/.well-known/ucp` intentionally validates against the frozen local `MerchantCapabilities` contract rather than reproducing the complete upstream business-profile schema. Its `Link` response header advertises the implemented local endpoints. The signed fixture retains `https://demo.vuelaya.example` as its stable merchant identity so the BE-01 checkout hash remains unchanged; all executable API calls use `http://localhost:3001`.

### Routes

| Method | Route | Contract / behavior |
| --- | --- | --- |
| `GET` | `/.well-known/ucp` | `MerchantCapabilities`; Checkout + AP2 and local endpoint links |
| `GET` | `/merchant/flights` | `OfferCandidate[]`; one GRU → COR flight for USD 137 (`amount: 13700`) |
| `POST` | `/ucp/v1/checkout` | strict `PurchaseIntent` → merchant-authored `NormalizedCheckout` |
| `GET` | `/ucp/v1/checkout/:id` | reads a non-expired signed checkout |
| `POST` | `/ucp/v1/checkout/:id/complete` | strict `AuthorizedCheckout` → idempotent `OrderReceipt` |
| `GET` | `/ucp/v1/orders/:id` | reads the sanitized merchant receipt |

Mutable routes require `Idempotency-Key`. Checkout creation and completion also require `UCP-Capabilities: dev.ucp.shopping.checkout,dev.ucp.common.payment.ap2_mandate`; omitting AP2 is treated as a downgrade and fails closed. Every response carries `X-Correlation-Id`, and completion copies that correlation ID into `AuditEvidence`.

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

The authoritative terms hash is `b059774ba8efeb7200c1aaefa6786bf293e4c8d5fece24a147586a1a330f9c01`. Use the Postman collection for the complete request because it captures the runtime checkout signature and submits it with the sanitized `ReservedAuthorization` fixture before reading the resulting order.

### Integrity, state and limitations

- Checkout terms are validated with the strict v1 schema before canonicalization. Object-property order does not affect the RFC 8785/JCS hash; changing price, currency, route, item, merchant or expiry does.
- The signer is available only through `SignerPort`. A P-256 keypair is generated in memory at process startup; no private key is exported, logged, stored or versioned. Restarting the process discards both the key and all in-memory merchant state.
- The default application clock is the fixed demo instant `2026-08-29T12:04:01.000Z`, keeping the P0 fixture reproducible. Tests inject later clocks to prove offer, checkout and authorization expiry behavior. A production adapter must use an injected system clock and durable storage.
- Completion requires a schema-valid `RESERVED` authorization bound to authorization ID, checkout ID/hash, merchant, amount and currency. A bare `ALLOW` declaration is rejected. One receipt is stored per checkout and authorization, so retries return the same object.
- `payment_id` in the merchant receipt is a sanitized logical reference derived from the reserved authorization; VuelaYa never resolves a credential, invokes `PaymentExecutor`, calls Yuno or executes payment. Payment execution and durable authorization state remain downstream workstreams.
- No PostgreSQL, external website, browser automation, mandate lifecycle, Bound Verify rules, Yuno integration or LLM is part of this module.
