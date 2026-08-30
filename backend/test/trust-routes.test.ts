import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { AuthCrypto } from "../src/modules/auth/crypto.js";
import { DemoPrincipalAuthProvider } from "../src/modules/auth/demo-provider.js";
import { InMemoryPrincipalAuthStore } from "../src/modules/auth/memory-repository.js";
import { PrincipalAuthService } from "../src/modules/auth/service.js";
import { BoundAgentPassportService } from "../src/modules/trust/passport.js";
import { DeterministicFakeAttestationProvider } from "../src/modules/trust/fake-provider.js";
import { InMemoryAgentTrustRepository } from "../src/modules/trust/memory-repository.js";
import { AgentTrustService } from "../src/modules/trust/service.js";

const now = new Date("2026-08-29T12:00:00.000Z");
async function fixture() {
  const crypto = new AuthCrypto("test-auth-secret");
  const authStore = new InMemoryPrincipalAuthStore(crypto);
  const auth = new PrincipalAuthService({ mode: "demo", providers: {}, authRepository: authStore, sessions: authStore, crypto, clock: { now: () => now }, callbackUrl: "http://localhost/callback", sessionTtlSeconds: 28_800, loginTransactionTtlSeconds: 600, demoProvider: new DemoPrincipalAuthProvider("development", "demo") });
  const repository = new InMemoryAgentTrustRepository({ mode: "EXTERNAL_REQUIRED", provider: "fake", attestationTtlSeconds: 3600 }, [{ agentId: "agent_travelbot", principalId: "principal_marta", keyId: "key_travelbot", buildFingerprint: "a".repeat(64), operationalStatus: "ACTIVE" }]);
  const passports = await BoundAgentPassportService.create({ issuer: "https://bound.example", audience: "bound-verify", ttlSeconds: 900, now: () => now });
  const trust = new AgentTrustService({ provider: new DeterministicFakeAttestationProvider(now), providerName: "fake", repository, passports, clock: { now: () => now }, callbackUrl: "http://localhost:3000/trust/callback" });
  const app = await buildApp({ auth: { service: auth, mode: "demo", allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 }, trust: { service: trust, auth, allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 } });
  const login = await app.inject({ method: "POST", url: "/auth/v1/demo/session", headers: { origin: "http://localhost:3000", "idempotency-key": "idem_demo_trust" } });
  return { app, cookie: login.headers["set-cookie"] as string, csrf: login.json().csrf_token as string };
}

test("authenticated owner starts KYA and receives assurance plus a verifiable passport", async () => {
  const { app, cookie, csrf } = await fixture();
  const start = await app.inject({ method: "POST", url: "/trust/v1/agents/agent_travelbot/attestation-sessions", headers: { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf, "idempotency-key": "idem_attestation_001", "x-correlation-id": "corr_attestation_001" }, payload: { consent: true } });
  assert.equal(start.statusCode, 201);
  assert.equal(start.json().status, "VERIFIED");
  assert.equal(JSON.stringify(start.json()).includes("principal_marta"), false);
  const rotatedCookie = start.headers["set-cookie"] as string;
  assert.ok(rotatedCookie);
  assert.notEqual(rotatedCookie, cookie);
  assert.deepEqual((await app.inject({ method: "GET", url: "/auth/v1/session", headers: { cookie } })).json(), { authenticated: false });

  const assurance = await app.inject({ method: "GET", url: "/trust/v1/agents/agent_travelbot/assurance", headers: { cookie: rotatedCookie } });
  assert.equal(assurance.statusCode, 200);
  assert.equal(assurance.json().eligibility.eligible, true);
  assert.deepEqual(assurance.json().assurance_claims, ["OPERATOR_IDENTITY"]);

  const passport = await app.inject({ method: "GET", url: "/trust/v1/agents/agent_travelbot/passport", headers: { cookie: rotatedCookie } });
  assert.equal(passport.statusCode, 200);
  assert.ok(passport.json().passport);
  const jwks = await app.inject({ method: "GET", url: "/trust/v1/passports/.well-known/jwks.json" });
  assert.equal(jwks.json().keys.length, 1);
  const verify = await app.inject({ method: "POST", url: "/trust/v1/passports/verify", headers: { "idempotency-key": "idem_passport_verify" }, payload: { passport: passport.json().passport, audience: "bound-verify" } });
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.json().valid, true);
  await app.close();
});

test("KYA initiation enforces auth, ownership, consent, CSRF, Origin and explicit correlation", async () => {
  const { app, cookie, csrf } = await fixture();
  const common = { method: "POST" as const, url: "/trust/v1/agents/agent_travelbot/attestation-sessions", payload: { consent: true } };
  assert.equal((await app.inject({ ...common, headers: { origin: "http://localhost:3000", "idempotency-key": "idem_no_auth_001", "x-correlation-id": "corr_no_auth" } })).statusCode, 401);
  assert.equal((await app.inject({ ...common, headers: { cookie, origin: "http://localhost:3000", "idempotency-key": "idem_no_csrf_001", "x-correlation-id": "corr_no_csrf" } })).statusCode, 403);
  assert.equal((await app.inject({ ...common, headers: { cookie, origin: "https://attacker.example", "x-csrf-token": csrf, "idempotency-key": "idem_bad_origin", "x-correlation-id": "corr_bad_origin" } })).statusCode, 403);
  assert.equal((await app.inject({ ...common, headers: { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf, "idempotency-key": "idem_no_corr_001" } })).statusCode, 400);
  assert.equal((await app.inject({ ...common, url: "/trust/v1/agents/agent_other/attestation-sessions", headers: { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf, "idempotency-key": "idem_wrong_owner", "x-correlation-id": "corr_wrong_owner" } })).statusCode, 404);
  await app.close();
});

test("provider webhook is narrowly exempt from client Idempotency-Key", async () => {
  const { app } = await fixture();
  const response = await app.inject({ method: "POST", url: "/trust/v1/attestations/webhooks/didit", payload: {} });
  assert.notEqual(response.json().error?.message, "Idempotency-Key is required for mutable requests");
  await app.close();
});
