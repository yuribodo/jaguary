# BE-14 — Principal login, provider-backed KYA and Bound Agent Passport

## Security architecture

Principal login is isolated behind `PrincipalIdentityProviderPort` and `PrincipalSessionRepositoryPort`. Google is the first real OIDC adapter and uses Authorization Code + PKCE, one-use hashed `state`, encrypted server-side verifier/nonce state, strict discovery issuer, audience and nonce checks, and an allowlisted callback/return path. Identities are keyed by canonical issuer plus a SHA-256 subject hash; email is never an identity key.

The browser receives only an opaque, random `bound_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` outside localhost). PostgreSQL stores its hash and a session-bound CSRF hash. Logout, expiry and security-transition rotation revoke the previous row. `DemoPrincipalAuthProvider` can exist only under `NODE_ENV=development` plus `AUTH_MODE=demo` and clearly marks its response as demo authentication.

Agent assurance is isolated behind `AgentAttestationProviderPort`, `AgentTrustRepositoryPort` and `AgentEligibilityPort`. The domain contains no Didit types. Modes have deliberately different policy effects:

- `LOCAL`: preserves Bound's key/build/operational checks; the deterministic fake performs no network I/O.
- `EXTERNAL_OPTIONAL`: records normalized external evidence but never blocks an otherwise eligible local agent.
- `EXTERNAL_REQUIRED`: requires a current `VERIFIED` attestation bound to the principal, agent, key and build.

Provider output is evidence, never `ALLOW`. Verify, mandate creation, TravelBot conversation creation, signed agent-request verification and the transactional reservation all use the same eligibility decision. Reservation reloads and locks the agent and trust snapshot in its transaction, so a committed revocation or exact-boundary expiry prevents authorization. No Didit request is made from Verify, payment, mandate, TravelBot or a database transaction.

Didit contributes only `OPERATOR_IDENTITY`. It does not certify TravelBot, its key or its build. Bound creates hosted sessions server-side with opaque `vendor_data`; validates the official API and hosted origins; normalizes every documented Didit status; authenticates webhook V2 HMAC signatures with a five-minute freshness window; hashes the authenticated event ID for deduplication; ignores older/terminal-regression events; and reconciles through the decision endpoint with bounded timeout/retry. Raw webhook bodies, documents, selfies, biometrics, addresses, signed URLs, provider tokens and full decision payloads are not persisted.

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

Use only the [official Didit documentation](https://docs.didit.me/). Create a workflow and configure its signed webhook to:

```text
https://<backend-origin>/trust/v1/attestations/webhooks/didit
```

Set `KYA_MODE=EXTERNAL_OPTIONAL` or `EXTERNAL_REQUIRED`, `KYA_PROVIDER=didit`, `KYA_API_BASE_URL=https://verification.didit.me`, `KYA_API_KEY`, `KYA_WORKFLOW_ID`, `KYA_WEBHOOK_SECRET`, timeout and TTL. The hosted callback is the allowlisted frontend `/trust/callback`; the API key and webhook secret stay backend-only.

External KYA may be called validated only after all three have happened in the same environment: a real hosted Didit session completed, a fresh signed webhook accepted/deduplicated, and a Bound Passport issued and locally verified. The repository contains deterministic HTTP-fake coverage, but no Google/Didit credential names were available in the current environment, so real sandbox validation remains intentionally unclaimed.

## Retention and revocation

Bound revocation writes `agent.attestation_revoked`; exact TTL expiry writes `agent.attestation_expired`. Evidence is minimal hashes plus an encrypted provider assessment reference. After an attestation is `REJECTED`, `EXPIRED`, `REVOKED` or `ERROR`, remove its local provider/event evidence while retaining the append-only historical audit hashes:

```bash
pnpm --filter @bound/backend db:kya:purge -- --agent-id agent_travelbot
```

The command refuses `PENDING` or `VERIFIED` evidence. Database backup retention must follow the deployment's privacy policy; secrets and provider payloads must never enter backups through application tables or logs.
