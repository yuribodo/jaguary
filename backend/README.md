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

Import `postman/Bound API.postman_collection.json` into Postman and start the API with `pnpm dev:backend`. The collection uses `http://localhost:3001` by default and contains executable checks for the current root and health routes, the public error envelope, correlation IDs, and mutable-request idempotency validation.

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
| `POST /merchant/checkouts` | `PurchaseIntent` → `NormalizedCheckout` |
| checkout completion | `AuthorizedCheckout` → `OrderReceipt` |
| `POST /verify` | `AgentRequestProof` + `NormalizedCheckout` → `AuthorizationDecision` / `ReservedAuthorization` |
| `POST /authorizations/:id/pay` | `AuthorizedPayment` → `PaymentResult` |
| receipt and audit reads | `OrderReceipt` / `AuditEvidence` |

For example, a payment module receives the approved reference `{ "credential_id": "cred_demo_marta_visa", "display": "Visa •••• 4242" }` inside `AuthorizedPayment`; it never accepts a card number or provider-vault token through this contract.
