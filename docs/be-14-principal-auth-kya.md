# BE-14 — Principal login, provider-backed KYA and Bound Agent Passport

## Security architecture

Principal login is isolated behind `PrincipalIdentityProviderPort` and `PrincipalSessionRepositoryPort`. Google is the first real OIDC adapter and uses Authorization Code + PKCE, one-use hashed `state`, encrypted server-side verifier/nonce state, strict discovery issuer, audience and nonce checks, and an allowlisted callback/return path. Identities are keyed by canonical issuer plus a SHA-256 subject hash; email is never an identity key.

The browser receives only an opaque, random `bound_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` outside localhost). PostgreSQL stores its hash and a session-bound CSRF hash. Logout, expiry and security-transition rotation revoke the previous row. `DemoPrincipalAuthProvider` can exist only under `NODE_ENV=development` plus `AUTH_MODE=demo` and clearly marks its response as demo authentication.

Agent assurance is isolated behind `AgentAttestationProviderPort`, `AgentTrustRepositoryPort` and `AgentEligibilityPort`. The domain contains no Didit types. Modes have deliberately different policy effects:

- `LOCAL`: preserves Bound's key/build/operational checks; the deterministic fake performs no network I/O.
- `EXTERNAL_OPTIONAL`: records normalized external evidence but never blocks an otherwise eligible local agent.
- `EXTERNAL_REQUIRED`: requires a current `VERIFIED` attestation bound to the principal, agent, key and build.

Provider output is evidence, never `ALLOW`. Verify, mandate creation, TravelBot conversation creation, signed agent-request verification and the transactional reservation all use the same eligibility decision. Reservation reloads and locks the agent and trust snapshot in its transaction, so a committed revocation or exact-boundary expiry prevents authorization. No Didit request is made from Verify, payment, mandate, TravelBot or a database transaction.

Didit contributes only `OPERATOR_IDENTITY`. It does not certify TravelBot, its key or its build. Bound creates hosted sessions server-side with opaque `vendor_data`; validates the official API and hosted origins; normalizes every documented Didit status; authenticates V3 destination webhooks with the recommended `X-Signature-V2` HMAC and a five-minute freshness window; hashes the authenticated event ID for deduplication; ignores older/terminal-regression events; and reconciles through the decision endpoint with bounded timeout/retry. Raw webhook bodies, documents, selfies, biometrics, addresses, signed URLs, provider tokens and full decision payloads are not persisted.

Mandate activation has a separate transactional biometric-consent gate. Once the principal has reviewed the agent, merchant, scope and limits, Bound hashes the complete immutable mandate terms and starts a published Didit Biometric Authentication workflow. The backend loads the approved onboarding portrait only long enough to create a face-match session, does not expose it to the browser, and clears the in-memory byte buffer afterward. The returning principal sees only a live-selfie step. A verified result is bound to that principal, agent, mandate, onboarding attestation and exact terms hash; changing any term invalidates it. Activation locks and consumes the one-use consent in the same PostgreSQL transaction that signs the mandate and appends its audit evidence. Pending, rejected, expired, reused or mismatched evidence fails closed and leaves the mandate in `DRAFT`.

After valid binding, Bound issues a short-lived ES256 Agent Passport. It contains only agent/key/build bindings, a principal hash, normalized assurance, provider/evidence hashes, issuer, audience/purpose and validity. Local verification checks signature, audience, expiry and the current Bound state without calling Didit. Expiry/revocation, binding changes and operational suspension/revocation invalidate it. Public verification material is available at `GET /trust/v1/passports/.well-known/jwks.json`.

## Local deterministic setup

Copy `backend/.env.example` to `backend/.env`, keep `NODE_ENV=development`, `AUTH_MODE=demo`, `KYA_MODE=LOCAL` and `KYA_PROVIDER=fake`, then migrate and run the backend. Open `/login`; the Marta demo creates `principal_marta`, then `/trust` can bind the existing `agent_travelbot` and issue a passport without external traffic.

## Google OIDC setup

1. Create a Google OAuth web client.
2. Register the exact backend redirect URI, locally `http://localhost:3001/auth/v1/login/google/callback`.
3. Set `AUTH_MODE=oidc`, `AUTH_OIDC_ISSUER=https://accounts.google.com`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET` and the exact `AUTH_OIDC_CALLBACK_URL`.
4. Register the frontend origin in Google and keep it equal to `CORS_ORIGIN`.

Production requires HTTPS issuer/callback configuration and refuses demo mode at startup.

## Didit setup and real-validation checklist

Use only the [official Didit documentation](https://docs.didit.me/). In the Didit Business Console, create an Application and a published KYC workflow. Under **API & Webhooks**, create a V3 webhook destination subscribed to `status.updated` whose public HTTPS URL is:

```text
https://<backend-origin>/trust/v1/attestations/webhooks/didit
```

The destination must answer directly without a redirect; Didit does not deliver webhooks to localhost or private URLs. Copy the Application API key, the published workflow UUID, and the destination's one-time `secret_shared_key`, then set `KYA_MODE=EXTERNAL_OPTIONAL` or `EXTERNAL_REQUIRED`, `KYA_PROVIDER=didit`, `KYA_API_BASE_URL=https://verification.didit.me`, `KYA_API_KEY`, `KYA_WORKFLOW_ID`, `KYA_WEBHOOK_SECRET`, timeout and TTL. The hosted callback is the allowlisted frontend `/trust/callback`; the API key and destination secret stay backend-only.

For mandate confirmation, also publish a **Biometric Authentication** workflow containing passive liveness followed by face match and set its UUID as `KYA_BIOMETRIC_WORKFLOW_ID`. Keep the same V3 `status.updated` webhook destination. The browser returns through `/biometric-callback`; that route reconciles the provider result before it posts the confirmation message that can activate the mandate. Starting a session requires an authenticated principal, Origin, session CSRF and `{ "consent": true }` at `POST /v1/mandates/:id/biometric-consent-sessions`. Reconciliation uses `POST /v1/mandates/:id/biometric-consent-sessions/:consentId/refresh`.

Before completing a real identity check, use Didit's **Try Webhook** action with a `status.updated` scenario and confirm a `2xx` delivery. Start with `EXTERNAL_OPTIONAL` while validating the provider path, then switch to `EXTERNAL_REQUIRED` only after the full flow succeeds.

External KYA may be called fully validated only after all three have happened in the same environment: a real hosted Didit session completed, a fresh signed webhook accepted/deduplicated, and a Jaguary Agent Passport issued and locally verified. Local external validation completed a real Google OIDC login and a real Didit hosted session through an approved decision reconciled by the backend. Signed public-webhook delivery and passport issuance remain residual deployment checks because the local callback is not publicly reachable. Provider credentials stay environment-only and are never committed.

## Retention and revocation

Bound revocation writes `agent.attestation_revoked`; exact TTL expiry writes `agent.attestation_expired`. Evidence is minimal hashes plus encrypted provider references. Biometric consent stores no selfie or onboarding portrait; it retains only bindings, status, timestamps and cryptographic evidence hashes, and terminal hosted URLs are cleared. After an attestation is `REJECTED`, `EXPIRED`, `REVOKED` or `ERROR`, remove its local provider/event evidence while retaining the append-only historical audit hashes:

```bash
pnpm --filter @bound/backend db:kya:purge -- --agent-id agent_travelbot
```

The command refuses `PENDING` or `VERIFIED` evidence. Database backup retention must follow the deployment's privacy policy; secrets and provider payloads must never enter backups through application tables or logs.
