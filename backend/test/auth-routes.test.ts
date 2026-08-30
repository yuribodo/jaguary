import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import type { PrincipalIdentityProviderPort } from "../src/contracts/v1/index.js";
import { AuthCrypto } from "../src/modules/auth/crypto.js";
import { DemoPrincipalAuthProvider } from "../src/modules/auth/demo-provider.js";
import { InMemoryPrincipalAuthStore } from "../src/modules/auth/memory-repository.js";
import { PrincipalAuthService } from "../src/modules/auth/service.js";

const now = new Date("2026-08-29T12:00:00.000Z");
class FakeOidcProvider implements PrincipalIdentityProviderPort {
  lastStart?: { state: string; nonce: string; codeChallenge: string };
  async createAuthorizationRequest(input: { state: string; nonce: string; codeChallenge: string }) {
    this.lastStart = input;
    return { url: `https://accounts.example/authorize?state=${encodeURIComponent(input.state)}&nonce=${encodeURIComponent(input.nonce)}&code_challenge=${encodeURIComponent(input.codeChallenge)}` };
  }
  async verifyCallback(input: { code: string; codeVerifier: string; expectedNonce: string }) {
    if (input.code !== "valid-code" || input.codeVerifier.length < 43 || input.expectedNonce.length < 20) throw new Error("invalid oidc callback");
    return { provider: "google", issuer: "https://accounts.google.com", subject: "google-subject-123", displayName: "Marta", verifiedEmail: "marta@example.com", assurance: "OIDC" as const };
  }
}

function authFixture(mode: "demo" | "oidc" = "oidc") {
  const crypto = new AuthCrypto("test-auth-secret");
  const store = new InMemoryPrincipalAuthStore(crypto);
  const provider = new FakeOidcProvider();
  const service = new PrincipalAuthService({
    mode,
    providers: mode === "oidc" ? { google: provider } : {},
    authRepository: store,
    sessions: store,
    crypto,
    clock: { now: () => now },
    callbackUrl: "http://localhost:3001/auth/v1/login/google/callback",
    sessionTtlSeconds: 28_800,
    loginTransactionTtlSeconds: 600,
    ...(mode === "demo" ? { demoProvider: new DemoPrincipalAuthProvider("development", "demo") } : {}),
  });
  return { crypto, store, provider, service };
}

test("OIDC + PKCE issues an opaque backend session and consumes state once", async () => {
  const fixture = authFixture();
  const app = await buildApp({ auth: { service: fixture.service, mode: "oidc", allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 } });
  const start = await app.inject({ method: "GET", url: "/auth/v1/login/google/start?return_to=%2Fauth%2Fcallback" });
  assert.equal(start.statusCode, 302);
  const state = new URL(start.headers.location!).searchParams.get("state")!;
  assert.ok(fixture.provider.lastStart?.codeChallenge);

  const callback = await app.inject({ method: "GET", url: `/auth/v1/login/google/callback?state=${encodeURIComponent(state)}&code=valid-code` });
  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, "http://localhost:3000/auth/callback");
  const cookie = callback.headers["set-cookie"] as string;
  assert.match(cookie, /bound_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Secure/);
  const rawToken = decodeURIComponent(cookie.match(/bound_session=([^;]+)/)![1]!);
  assert.equal(fixture.store.tokenHashes.has(rawToken), false);

  const replay = await app.inject({ method: "GET", url: `/auth/v1/login/google/callback?state=${encodeURIComponent(state)}&code=valid-code` });
  assert.equal(replay.statusCode, 400);
  await app.close();
});

test("session, CSRF, Origin and logout are bound to the opaque cookie", async () => {
  const fixture = authFixture("demo");
  const app = await buildApp({ auth: { service: fixture.service, mode: "demo", allowedOrigin: "http://localhost:3000", secureCookies: true, sessionTtlSeconds: 28_800 } });
  const demo = await app.inject({ method: "POST", url: "/auth/v1/demo/session", headers: { origin: "http://localhost:3000", "idempotency-key": "idem_demo_login_001" } });
  assert.equal(demo.statusCode, 201);
  assert.equal(demo.json().demo, true);
  const cookie = demo.headers["set-cookie"] as string;
  assert.match(cookie, /Secure/);
  const session = await app.inject({ method: "GET", url: "/auth/v1/session", headers: { cookie } });
  assert.equal(session.json().principal.principal_id, "principal_marta");
  const csrf = session.json().csrf_token as string;

  const crossOrigin = await app.inject({ method: "POST", url: "/auth/v1/logout", headers: { cookie, origin: "https://attacker.example", "x-csrf-token": csrf, "idempotency-key": "idem_logout_001" } });
  assert.equal(crossOrigin.statusCode, 403);
  const missingCsrf = await app.inject({ method: "POST", url: "/auth/v1/logout", headers: { cookie, origin: "http://localhost:3000", "idempotency-key": "idem_logout_002" } });
  assert.equal(missingCsrf.statusCode, 403);
  const logout = await app.inject({ method: "POST", url: "/auth/v1/logout", headers: { cookie, origin: "http://localhost:3000", "x-csrf-token": csrf, "idempotency-key": "idem_logout_003" } });
  assert.equal(logout.statusCode, 204);
  const expired = await app.inject({ method: "GET", url: "/auth/v1/session", headers: { cookie } });
  assert.deepEqual(expired.json(), { authenticated: false });
  await app.close();
});

test("demo route is absent unless demo mode is explicit and redirects are allowlisted", async () => {
  const fixture = authFixture();
  const app = await buildApp({ auth: { service: fixture.service, mode: "oidc", allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 } });
  const demo = await app.inject({ method: "POST", url: "/auth/v1/demo/session", headers: { "idempotency-key": "idem_demo_disabled" } });
  assert.equal(demo.statusCode, 404);
  const redirect = await app.inject({ method: "GET", url: "/auth/v1/login/google/start?return_to=https%3A%2F%2Fattacker.example" });
  assert.equal(redirect.statusCode, 400);
  await app.close();
});

test("sensitive authentication endpoints are rate limited per client", async () => {
  const fixture = authFixture();
  const app = await buildApp({ auth: { service: fixture.service, mode: "oidc", allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 } });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await app.inject({ method: "GET", url: "/auth/v1/login/google/start" });
    assert.equal(response.statusCode, 302);
  }
  const limited = await app.inject({ method: "GET", url: "/auth/v1/login/google/start" });
  assert.equal(limited.statusCode, 429);
  await app.close();
});

test("DemoPrincipalAuthProvider cannot be constructed outside development demo mode", () => {
  assert.throws(() => new DemoPrincipalAuthProvider("production", "demo"), /only be enabled/);
  assert.throws(() => new DemoPrincipalAuthProvider("test", "demo"), /only be enabled/);
  assert.throws(() => new DemoPrincipalAuthProvider("development", "oidc"), /only be enabled/);
});

test("session expiry is exclusive at the exact TTL boundary", async () => {
  let current = now;
  const crypto = new AuthCrypto("expiry-auth-secret");
  const store = new InMemoryPrincipalAuthStore(crypto);
  const service = new PrincipalAuthService({ mode: "demo", providers: {}, authRepository: store, sessions: store, crypto,
    clock: { now: () => current }, callbackUrl: "http://localhost/callback", sessionTtlSeconds: 300, loginTransactionTtlSeconds: 60,
    demoProvider: new DemoPrincipalAuthProvider("development", "demo") });
  const issued = await service.createDemoSession();
  assert.equal((await service.getSession(issued.token)).authenticated, true);
  current = new Date(now.getTime() + 300_000);
  assert.deepEqual(await service.getSession(issued.token), { authenticated: false });
});

test("authorization codes, session tokens and identity claims never enter request logs", async () => {
  const fixture = authFixture();
  let logs = "";
  const app = await buildApp({ logger: { level: "trace", stream: { write: (line: string) => { logs += line; } } },
    auth: { service: fixture.service, mode: "oidc", allowedOrigin: "http://localhost:3000", secureCookies: false, sessionTtlSeconds: 28_800 } });
  const start = await app.inject({ method: "GET", url: "/auth/v1/login/google/start" });
  const state = new URL(start.headers.location!).searchParams.get("state")!;
  const secretCode = "authorization-code-must-never-be-logged";
  await app.inject({ method: "GET", url: `/auth/v1/login/google/callback?state=${encodeURIComponent(state)}&code=${secretCode}` });
  await app.close();
  assert.equal(logs.includes(secretCode), false);
  assert.equal(logs.includes("marta@example.com"), false);
  for (const tokenHash of fixture.store.tokenHashes) assert.equal(logs.includes(tokenHash), false);
});

test("external identities bind by canonical issuer and subject, never email alone", async () => {
  const store = new InMemoryPrincipalAuthStore(new AuthCrypto("identity-binding-secret"));
  const first = await store.resolveExternalIdentity({ provider: "google", issuer: "https://accounts.google.com", subject: "subject-a", displayName: "Marta", verifiedEmail: "marta@example.com", assurance: "OIDC" });
  const renamed = await store.resolveExternalIdentity({ provider: "google", issuer: "https://accounts.google.com", subject: "subject-a", displayName: "Marta B", verifiedEmail: "changed@example.com", assurance: "OIDC" });
  const sameEmailOtherSubject = await store.resolveExternalIdentity({ provider: "google", issuer: "https://accounts.google.com", subject: "subject-b", displayName: "Marta", verifiedEmail: "marta@example.com", assurance: "OIDC" });
  assert.equal(renamed.principal_id, first.principal_id);
  assert.notEqual(sameEmailOtherSubject.principal_id, first.principal_id);
});
