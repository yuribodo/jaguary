# Bound backend

Fastify v5 API using TypeScript, ESM, Zod environment validation and Node's test runner through `tsx`.

## Commands

```bash
pnpm dev:backend
pnpm --filter @bound/backend lint
pnpm --filter @bound/backend typecheck
pnpm --filter @bound/backend test
pnpm --filter @bound/backend build
```

The API listens on `http://localhost:3001` by default. Copy `.env.example` to `.env` to override local configuration.

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
