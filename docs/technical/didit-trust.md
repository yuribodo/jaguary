# Didit and agent trust

| Metadata | Value |
| --- | --- |
| Status | Real adapter implemented; optional by mode |
| Purpose | Add external operator-identity evidence and biometric consent evidence |
| Primary code | [`backend/src/modules/trust/didit-provider.ts`](../../backend/src/modules/trust/didit-provider.ts) |

[Open the Didit trust sequence](../diagrams/didit-trust-sequence.html).

## What Didit is for

Didit verifies a human operator through a hosted KYC workflow. Bound normalizes an approved result into the `OPERATOR_IDENTITY` assurance claim. Didit does not certify TravelBot's code, key, build fingerprint, or complete agent identity, and it never returns a Bound `ALLOW`.

Didit's official hosted-session flow creates a server-side session at `POST /v3/session/`, returns a hosted verification URL, and later exposes the result through a webhook or the decision endpoint. See [Create Session](https://docs.didit.me/sessions-api/create-session) and [Didit Webhooks](https://docs.didit.me/integration/webhooks).

## Trust modes

| Mode | External evidence effect |
| --- | --- |
| `LOCAL` | Local registered key, build, binding, and operational status remain sufficient. No Didit network request. |
| `EXTERNAL_OPTIONAL` | Evidence is recorded and visible, but an unavailable/non-verified provider does not block an otherwise valid local agent. |
| `EXTERNAL_REQUIRED` | A current `VERIFIED` attestation with the exact principal/agent/key/build binding is mandatory. Unknown or unavailable fails closed. |

## Operator-attestation flow

1. An authenticated principal explicitly consents and starts an attestation with idempotency and CSRF protection.
2. Bound verifies that the principal owns the registered agent binding.
3. The adapter calls Didit server-to-server with an allowlisted callback and opaque random `vendor_data`.
4. The browser receives only the allowlisted `https://verify.didit.me/...` hosted URL.
5. Didit sends `status.updated` to Bound. The adapter validates the five-minute timestamp window and `X-Signature-V2` HMAC over canonical sorted JSON using constant-time comparison.
6. Bound deduplicates the authenticated event, rejects invalid regressions, and persists only normalized status, claims, bindings, timestamps, and hashes.
7. Polling the decision endpoint is used for explicit reconciliation, not as a substitute for webhook authentication.

The official Didit guidance recommends `X-Signature-V2`, HMAC-SHA256, and rejecting timestamps more than 300 seconds from the receiver clock. The implementation follows that path.

## Biometric consent for mandate activation

When a biometric workflow is configured, mandate activation has an additional one-use gate:

1. Bound loads the already approved onboarding portrait directly from Didit.
2. It validates the host, media signature, and a 2 MiB limit.
3. It creates a Didit Biometric Authentication session using the portrait as the trusted reference.
4. The principal completes passive liveness/face match on Didit's hosted surface.
5. The verified result is bound to the principal, agent, mandate, onboarding assessment, and immutable mandate-terms hash.
6. Activation consumes that evidence inside the same PostgreSQL transaction that signs the mandate.

The portrait exists only in process memory for session creation and its buffer is cleared. Bound does not persist selfie, portrait, documents, raw webhook payload, or full provider decisions.

## Agent Passport

After valid trust binding, Bound can issue a short-lived ES256 Agent Passport. It contains hashes and references for agent, principal, key, build, evidence, assurance, audience, purpose, and expiry. Local verification checks the token and current Bound state without calling Didit. Suspension, revocation, expiry, or a changed binding invalidates it.

## Operational checks

Use the real-validation checklist in [BE-14](../be-14-principal-auth-kya.md#didit-setup-and-real-validation-checklist). A provider session completing in a browser is not enough: signed webhook delivery, event deduplication, normalized storage, and local Passport verification must also succeed.
