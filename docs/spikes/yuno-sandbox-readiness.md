# Spike: Yuno sandbox integration readiness

## Status and decision

- **Review date:** 2026-08-29.
- **Scope:** prepare [BE-09](https://github.com/yuribodo/jaguary/issues/10) without implementing a production payment flow.
- **Related architecture decision:** [ADR-004 — Mandatory credential enrollment and external checkout](../adr/ADR-004-credential-enrollment-and-external-checkout.md).
- **Work performed:** contract and documentation review only; no authenticated call, enrollment, tokenization, or sandbox payment.
- **Documentation readiness:** complete.
- **Operational readiness:** blocked until account access, configuration, and eligibility for tokenized-card payment are validated with Yuno.
- **Temporary decision:** use only `FakePaymentExecutor` until a Yuno account is available; keep the live sandbox path disabled.
- **v1 contract:** `PaymentExecutor` and `PaymentResult` support BE-09's narrow path—previously enrolled card, synchronous single-step payment, and no 3DS challenge—without changes. They do not represent the full asynchronous production lifecycle.
- **Network-free foundation:** see [BE-09 — Yuno sandbox adapter foundation](../be-09-yuno-adapter.md). The issue remains operationally blocked, and wiring still depends on BE-10.

All Yuno findings below use official Yuno documentation current on the review date.

## Spike boundaries

This document does not authorize anyone to:

- create a customer, session, enrollment, or sandbox payment;
- use production credentials;
- copy test-card data into code, logs, or fixtures;
- enable `DIRECT` before confirming the account's PCI or AOC requirements with Yuno;
- expose the Yuno Agent Toolkit to TravelBot;
- change contracts in `backend/src/contracts/v1/`.

## Readiness result

| Item | Result | Evidence or pending action |
| --- | --- | --- |
| Environment | Confirmed from documentation | Sandbox uses `https://api-sandbox.y.uno`; Test and Live modes use separate keys. |
| Credentials | Not validated here | Obtain Test Mode keys and perform only a read-only query before any payment. |
| Account and routing | Not validated | Confirm `account_id`, Yuno Testing Gateway, a published CARD route, and Checkout Builder. |
| No-account fallback | Decided | Use only `FakePaymentExecutor` with deterministic results and sanitized fixtures. |
| Secure enrollment | Feasible with SDK or Secure Fields | PAN and CVV go directly from browser to Yuno; browser exposure of `vaulted_token` remains a blocker. |
| Server-side payment with `vaulted_token` | Documented by Yuno | The official example uses `workflow: DIRECT`; confirm enablement and PCI or AOC requirements. |
| Idempotency | Compatible with adaptation | Yuno requires UUID and retains results for 24 hours; the local contract accepts but does not require UUID. |
| Synchronous result | Compatible | `SUCCEEDED/APPROVED`, `DECLINED`, and `REJECTED` can be normalized. |
| Timeout or asynchronous result | Partially compatible | `TIMEOUT` and `UNKNOWN` fit, but webhook and reconciliation need adjacent persistence and services. |
| Brazil | Partially confirmed | `BR`, `BRL`, two decimal places, and local documents are documented; final requirements depend on provider routing. |
| 3DS | Outside the BE-09 happy path | A challenge requires human action and cannot be completed by TravelBot. |

## 1. Obtain and validate sandbox access

Yuno calls its sandbox **Test Mode**. Sandbox and production use different keys even though the organization login is shared. The sandbox moves no real money and has its own base URL. See [API Environments](https://docs.y.uno/reference/getting-started/api-environments) and [Developers and credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials).

### Access checklist

1. Obtain access to the correct organization in the [Yuno Dashboard](https://dashboard.y.uno/).
2. Enable **Test Mode** before reading identifiers or keys.
3. Select the account representing VuelaYa or Bound in sandbox.
4. Retrieve Test Mode keys and `account_id` through a secret manager, never chat or versioned files.
5. Connect **Yuno Testing Gateway** under Connections.
6. Create and publish a `CARD` route pointing to the test gateway.
7. Enable `CARD` in Checkout Builder and publish the configuration.
8. Configure payment webhook v2 with HMAC enabled.

The testing gateway is sandbox-only, accepts all countries and currencies, and needs no provider credential of its own. Yuno API calls still require account credentials. See [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway) and [Set Up Payment Connection](https://docs.y.uno/docs/direct-integration-use-cases/set-up-payment-connection).

### Safe validation without creating a payment

An authorized operator should:

1. confirm Test Mode, account, connection, routing, and checkout publication in the Dashboard;
2. run a redacted backend query for a known sandbox order with `GET /v1/payments?merchant_order_id=...`;
3. treat `200` as valid authentication, `401` as invalid credentials, and `403` as missing permission or IP restriction;
4. if no known payment exists, stop after Dashboard and credential validation until explicit authorization exists to create test data;
5. never print request headers, complete responses, or process configuration.

If the Dashboard has an IP allowlist, authorize the environment's outbound IP without disabling the protection globally.

## 2. Identifiers and scopes

| Identifier | Requirement | Source and use | Recommended storage |
| --- | --- | --- | --- |
| Yuno organization | Access context | Groups accounts and may have organization-wide keys; not required by `POST /v1/payments`. | Operational inventory outside payment domain |
| `account_id` | Required | Dashboard UUID used for enrollment and payment. | Server-side configuration |
| Organization or account keys | Required | Prefer least-privilege account-scoped keys; Test and Live keys differ. | Secret manager |
| Bound `merchant_id` | Locally required | VuelaYa identity already bound to authorization; never confuse it with `account_id`. | Bound domain |
| `merchant_order_id` | Required by Yuno | Stable idempotent order reference derived from authorization or checkout. | Payment attempt |
| `merchant_reference` | Optional in Yuno | Opaque Bound transaction reference. | Payment attempt |
| Yuno customer `id` | Required for enrollment and reuse | Returned by `POST /v1/customers`; associates a vaulted method with a person. | Private adapter storage |
| `merchant_customer_id` | Required to create customer | Opaque local ID; never email, CPF, or other PII. | Private adapter mapping |
| `vaulted_token` | Required for reusable payment | Persistent Yuno payment-method reference. | Encrypted adapter vault only |
| Yuno payment `id` | Required for reconciliation | Creation UUID accepted by `GET /v1/payments/{payment_id}`. | Attempt and ledger |
| Yuno transaction `id` | Useful | Identifies the `PURCHASE` transaction and can become normalized `provider_reference`. | Result and ledger |
| `connection_data.id` | Useful for support | Identifies which configured connection processed the transaction. | Allowlisted internal telemetry |

The `merchant_id` in Yuno's B2B organization API belongs to whitelabel account-group onboarding and is not required for ordinary payment. Do not add that hierarchy to BE-09 without confirming the organization is whitelabel. See [B2B Organization Management](https://docs.y.uno/docs/using-yuno/b2b-organization-management).

## 3. Authentication and configuration

Every REST call uses `public-api-key` and `private-secret-key`. Mutable operations also require `X-Idempotency-Key`, plus JSON content and accept headers. See [Authentication](https://docs.y.uno/reference/getting-started/authentication).

The public key may initialize Yuno's browser SDK. The private key never leaves the backend. Documentation and examples contain variable names only.

| Name | Sensitivity | Purpose |
| --- | --- | --- |
| `YUNO_ENABLED` | Non-secret | Feature gate, disabled by default |
| `YUNO_BASE_URL` | Non-secret | Sandbox URL for BE-09 |
| `YUNO_ACCOUNT_ID` | Operationally confidential | Selected Yuno account |
| `YUNO_PUBLIC_API_KEY` | Browser-public only for SDK use | API header and SDK initialization |
| `YUNO_PRIVATE_SECRET_KEY` | Secret | Server-side API header |
| `YUNO_COUNTRY` | Non-secret | Processing country, initially configurable `BR` |
| `YUNO_WEBHOOK_HMAC_SECRET` | Secret | Raw-body HMAC verification |
| `YUNO_WEBHOOK_API_KEY` | Secret | Expected static webhook header |
| `YUNO_WEBHOOK_SECRET` | Secret | Expected second static webhook header |
| `YUNO_REQUEST_TIMEOUT_MS` | Non-secret | Client timeout below Yuno's 60-second limit |

Never add values for these variables to `.env.example`, Postman, CI output, or documentation.

## 4. Secure enrollment and tokenization

The applicable provider flow is:

1. the backend creates or retrieves a customer through `POST /v1/customers`;
2. the backend creates `POST /v1/customers/sessions` with account, customer, and country;
3. the backend starts enrollment through the customer session with a UUID idempotency key;
4. the Trusted Surface mounts Yuno Web SDK or Secure Fields with only the public key and customer session;
5. PAN, expiration, and CVV travel directly between secure fields or iframe and Yuno;
6. the backend confirms `ENROLLED` through webhook or authenticated payment-method lookup;
7. the adapter writes `vaulted_token` to encrypted storage and publishes only a logical `credential_id` and masked display.

Sources: [Enroll Payment Methods](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods), [Create Customer](https://docs.y.uno/reference/customers/create-customer), [Create Customer Session](https://docs.y.uno/reference/customer-sessions-enrollment/create-customer-session), [Web Enrollment](https://docs.y.uno/docs/sdks/card-enrollment/web-enrollment), [Secure Fields Enrollment](https://docs.y.uno/docs/sdks/customization/secure-fields/enrollment-secure-fields), and [PCI Compliance](https://docs.y.uno/docs/security-and-compliance/pci-compliance).

The regular frontend, TravelBot, and VuelaYa never receive `vaulted_token`. Enrollment UI must not copy it into global state, analytics, query strings, error reports, or public responses. The backend correlates enrollment through authenticated queries or webhooks.

One blocker remains: Yuno's SDK documentation says `yunoEnrollmentStatus` receives `vaultedToken`, while Secure Fields exposes `generateVaultedToken`. The token may therefore exist in browser memory even if Jaguary ignores it. ADR-004 prohibits the Trusted Surface from capturing or persisting reusable secrets, so the team must confirm a hosted or backend-retrieved mode with Yuno. If none exists, a new architecture decision is required; this spike creates no implicit exception.

`DIRECT` enrollment is not a fallback because Yuno reserves it for PCI-compliant merchants and it would expand card-data scope.

## 5. Payment creation and retrieval

The server-side adapter proposes `POST /v1/payments` with:

- configured `account_id` and country;
- stable `merchant_order_id` and opaque `merchant_reference`;
- a PII-free description;
- amount and currency derived from the reservation;
- Yuno customer ID and `vaulted_token` resolved privately;
- `workflow: DIRECT` and `payment_method.type: CARD`;
- single-step capture and one installment when configuration requires it;
- a persisted UUID in `X-Idempotency-Key`.

See [Create Payment](https://docs.y.uno/reference/payments/create-payment) and [Card Direct with vaulted token](https://docs.y.uno/reference/payments/payment-examples/cards#card-direct-with-vaulted-token).

Bound uses integer minor units; Yuno uses numeric currency values. BRL conversion must be decimal-exact:

```text
Bound { amount: 13700, currency: BRL } -> Yuno { value: 137.00, currency: BRL }
```

Construct decimal digits from the integer and ISO exponent, validate the response currency and amount, then reconstruct local `Money`. Never rely on unchecked binary floating-point division.

For reconciliation, retrieve by payment ID when known or by stable `merchant_order_id` after a timeout. Keep `raw_response=false`, reuse the exact key and request body, and never generate a new key to “unlock” a timeout.

## 6. Idempotency

Yuno requires a UUID `X-Idempotency-Key` and retains processed results for 24 hours. Repeated calls return the original result; concurrent calls may return `409`. A different body does not replace the first operation. Documentation says `400` and `500` do not retain the key.

Implications for Bound:

- the `PaymentExecutor.pay` string can carry a UUID unchanged;
- not every locally valid idempotency string is safe to forward;
- current fixture IDs such as `authorization_vy_...` do not meet Yuno's format;
- BE-08 or BE-09 must generate and persist one Yuno UUID per authorization;
- the same UUID survives restarts, timeouts, and retries;
- after 24 hours, reconcile by `merchant_order_id` before considering any new creation.

No v1 contract change is needed, but persistence must enforce this invariant.

## 7. Webhooks and reconciliation

Configure webhook v2 for `payment.purchase` and enrollment events. Yuno expects `200 OK` and may retry up to seven times over 96 hours. See [Webhooks](https://docs.y.uno/docs/webhooks), [Configure Webhooks](https://docs.y.uno/docs/webhooks/configure-webhooks), and [Webhook examples](https://docs.y.uno/docs/webhooks/object-and-examples).

Bound must:

1. capture exact raw-body bytes before JSON parsing;
2. calculate HMAC-SHA256 with the webhook secret and Base64-encode it;
3. compare in constant time with `x-hmac-signature`;
4. validate configured `x-api-key` and `x-secret` headers;
5. reject unexpected signatures, headers, versions, or `account_id` before mutation;
6. persistently deduplicate by event idempotency key and context;
7. apply monotonic transitions bound to payment, order, amount, and currency;
8. return `200` only after durable persistence or detection of an already persisted duplicate.

HMAC does not provide freshness by itself. Replay protection depends on durable deduplication and the state machine. Do not log full webhook bodies because provider examples contain PII, tokens, browser data, and provider details.

Valid webhooks are the normal update path. After timeout, `409`, or non-terminal status, retrieve with bounded backoff. Keep authorization in `PAYMENT_PENDING` while the economic result is unknown, and escalate operationally rather than automatically creating another payment.

## 8. Map states to `PaymentResult`

| Yuno or HTTP observation | `PaymentResult` | Rule |
| --- | --- | --- |
| `SUCCEEDED` + `APPROVED`, with amount fully validated | `APPROVED` | Only BE-09 happy path |
| Terminal `DECLINED` or `REJECTED` | `DECLINED` | Use sanitized allowlisted response code |
| Client timeout without a usable response | `TIMEOUT` | Unknown economic result; reconcile the same attempt |
| `CREATED`, `READY_TO_PAY`, or `PENDING/*` | `UNKNOWN` with payment ID | Do not treat as decline or release another attempt |
| `ERROR/TIMEOUT`, `5xx`, invalid payload, or interrupted connection | `UNKNOWN` or `TIMEOUT` | Keep `PAYMENT_PENDING` until retrieval or webhook |
| `409` for an in-progress key | `UNKNOWN` | Wait and retrieve; do not change the key |
| `400`, `401`, or `403` | Operational adapter error | Reject with a sanitized error, not an issuer decline |
| Partial approval, refund, cancel, chargeback, or unexpected state | `UNKNOWN` in BE-09 | Requires explicit production handling |

`TIMEOUT` is a transport observation, not proof of payment failure. `UNKNOWN` is a response without an economic conclusion. Both block a new charge.

Before mapping `APPROVED`, validate `account_id`, `merchant_order_id`, currency, and amount. Any mismatch is an incident and maps to `UNKNOWN`, not success.

## 9. Brazil, test cards, and 3DS

- Processing country is `BR`; local currency is `BRL` with two decimal places.
- Customer, address, document, and installment fields vary by provider and routing.
- The first proof uses one installment and no complex fallback.
- Yuno Testing Gateway accepting a country and currency does not prove a Brazilian acquirer will accept the same route.
- The current checkout uses USD. Before a live BE-09 test, select USD or BRL while keeping checkout, reservation, and Yuno identical; the adapter performs no exchange.

Yuno publishes test cards for success, declines, invalid data, and 3DS. Never copy PAN, CVV, or expiration into this repository. The authorized operator reads the official page at test time and enters data directly into Yuno secure fields. Fixtures contain only synthetic IDs and masked display values.

A 3DS challenge requires a human. TravelBot never receives a redirect URL, OTP, cryptogram, or completion tool. BE-09 should use an authorized no-challenge success scenario; any required additional action maps to `UNKNOWN`, keeps `PAYMENT_PENDING`, and stops.

## 10. Data boundary

The general domain and ledger may store logical credential IDs, masked display, authorization and checkout IDs, merchant, amount and currency, correlation IDs, normalized Yuno payment and transaction IDs, timestamps, allowlisted decline codes, and non-sensitive hashes.

Only encrypted adapter storage may hold Yuno customer IDs, `vaulted_token`, and private logical-to-provider mappings. Only a secret manager may hold API keys, webhook secrets, and provider credentials.

The regular frontend, TravelBot, VuelaYa, logs, and fixtures must never receive PAN, CVV, full expiration, track data, PIN, provider tokens, cryptograms, OTP, private keys, raw identity documents, contact or address PII, expired customer sessions, browser fingerprints, full provider payloads, authenticated headers, webhook bodies, or unsanitized receipts.

The public API key is intended for Yuno's browser SDK but must still be restricted to the correct environment and origin. Redaction must recognize all credential, token, authentication, document, contact, address, and raw-response fields.

## 11. Current contract compatibility

**Verdict: conditionally compatible with the narrow BE-09 sandbox path, but insufficient by itself for the complete production lifecycle.**

The current port is adequate because it receives reserved merchant, checkout, amount, currency, a logical credential reference, and an idempotency key; the adapter can privately resolve provider data; `PaymentResult` covers approval, decline, timeout, and unknown results; and operational errors can reject the promise.

Safe implementation still requires a persisted UUID key, trusted account and customer configuration, exact money conversion, strict terminal success validation, adjacent webhook and reconciliation persistence, and explicit exclusion of 3DS challenges and asynchronous methods.

Production gaps include explicit pending and action-required details, retrieval and webhook-update methods, late discovery of payment IDs, richer unknown reasons, two-step capture, cancellation, refund, partial approval, and chargeback. BE-09 can keep these outside the v1 contract through adjacent application services and storage.

## 12. Proposed BE-09 flow

```text
Human enrollment in the Trusted Surface
  -> Yuno SDK/Secure Fields
  -> Yuno customer + ENROLLED payment method
  -> adapter stores provider token and exposes only logical credential_id

TravelBot requestPurchase
  -> signed VuelaYa checkout
  -> Bound Verify + ALLOW reservation
  -> persist PAYMENT_PENDING + Yuno UUID
  -> YunoPaymentExecutor resolves credential privately
  -> POST /v1/payments once with reservation bindings
       -> APPROVED: consume authorization and complete order
       -> DECLINED: fail authorization with normalized code
       -> TIMEOUT/UNKNOWN: remain pending and reconcile
  -> HMAC webhook + GET confirm terminal state
```

Until Test Mode access exists, fake payment is the only executor in development, tests, CI, and demos. Fake credentials contain no Yuno mapping, and results are clearly labeled simulated. Missing Yuno configuration selects fake explicitly or fails safely. There is no automatic fallback from a live Yuno attempt to fake payment.

## 13. Blockers before implementation or testing

1. Validate Test Mode access, keys, account, permissions, and IP allowlist.
2. Confirm testing gateway, published CARD route, Checkout Builder, and webhook v2.
3. Obtain written clarification on PCI or AOC eligibility for server-side `DIRECT` payment with an enrolled token.
4. Confirm an enrollment mode that keeps reusable tokens out of application JavaScript.
5. Define ownership and persistence for the Yuno UUID.
6. Select USD or BRL and validate exact minor-unit conversion without exchange.
7. Define opaque customer mapping, retention, and deletion.
8. Approve normalization for timeout, errors, rejection, partial approval, and `409`.
9. Confirm the authorized BE-09 scenario has no 3DS challenge.
10. Provide an HTTPS webhook, separate HMAC secret, durable deduplication, and retry policy.
11. Obtain explicit human authorization before the first mutable enrollment or sandbox payment.

While these blockers remain, `FakePaymentExecutor` is the active decision. It does not reduce any Yuno integration gate.

## 14. Official Yuno sources

- [API environments](https://docs.y.uno/reference/getting-started/api-environments)
- [Authentication and idempotency](https://docs.y.uno/reference/getting-started/authentication)
- [Developers and credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials)
- [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway)
- [Enrollment overview](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods)
- [Secure Fields enrollment](https://docs.y.uno/docs/sdks/customization/secure-fields/enrollment-secure-fields)
- [PCI compliance](https://docs.y.uno/docs/security-and-compliance/pci-compliance)
- [Create payment](https://docs.y.uno/reference/payments/create-payment)
- [Card payment examples](https://docs.y.uno/reference/payments/payment-examples/cards)
- [Retrieve payment by ID](https://docs.y.uno/reference/payments/retrieve-payment-by-id)
- [Retrieve payment by merchant order ID](https://docs.y.uno/reference/payments/retrieve-payment-by-merchant-order-id)
- [Payment statuses](https://docs.y.uno/reference/payments/status-and-response-codes/payment)
- [Transaction statuses](https://docs.y.uno/reference/payments/status-and-response-codes/transaction)
- [Webhooks](https://docs.y.uno/docs/webhooks)
- [Webhook signatures](https://docs.y.uno/docs/webhooks/verify-webhook-signatures-hmac)
- [Country reference](https://docs.y.uno/reference/country-reference)
- [3D Secure](https://docs.y.uno/docs/security-and-compliance/3d-secure)
