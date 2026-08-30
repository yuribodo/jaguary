import assert from "node:assert/strict";
import { generateKeyPair } from "node:crypto";
import { promisify } from "node:util";
import test from "node:test";

import { exportJWK, SignJWT } from "jose";

import { GoogleOidcPrincipalProvider } from "../src/modules/auth/google-oidc-provider.js";

const generate = promisify(generateKeyPair);
async function fixture(overrides: { issuer?: string; audience?: string; nonce?: string } = {}) {
  const { privateKey, publicKey } = await generate("rsa", { modulusLength: 2048 });
  const publicJwk = await exportJWK(publicKey);
  const issuer = overrides.issuer ?? "https://accounts.google.com";
  const audience = overrides.audience ?? "bound-client";
  const nonce = overrides.nonce ?? "nonce-expected";
  const idToken = await new SignJWT({ nonce, name: "Marta", email: "marta@example.com", email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "google-test-key" })
    .setIssuer(issuer).setAudience(audience).setSubject("google-subject-123")
    .setIssuedAt(1788004800).setExpirationTime(1788008400).sign(privateKey);
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/.well-known/openid-configuration")) return new Response(JSON.stringify({
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
    }), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ id_token: idToken, access_token: "never-return-this" }), { status: 200, headers: { "content-type": "application/json" } });
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "google-test-key", alg: "RS256", use: "sig" }] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(null, { status: 404 });
  };
  return { fetchFn, calls };
}

test("Google OIDC uses discovery, authorization code + PKCE and validates its ID token", async () => {
  const http = await fixture();
  const provider = new GoogleOidcPrincipalProvider({ issuer: "https://accounts.google.com", clientId: "bound-client", clientSecret: "secret", fetch: http.fetchFn, now: () => new Date(1788005000 * 1000) });
  const authorization = await provider.createAuthorizationRequest({ state: "state-123", nonce: "nonce-expected", codeChallenge: "challenge-123", callbackUrl: "https://bound.example/auth/v1/login/google/callback" });
  const url = new URL(authorization.url);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("prompt"), "select_account");
  const identity = await provider.verifyCallback({ code: "authorization-code", codeVerifier: "verifier-123", expectedNonce: "nonce-expected", callbackUrl: "https://bound.example/auth/v1/login/google/callback" });
  assert.deepEqual(identity, { provider: "google", issuer: "https://accounts.google.com", subject: "google-subject-123", displayName: "Marta", verifiedEmail: "marta@example.com", assurance: "OIDC" });
  const tokenCall = http.calls.find((call) => call.url === "https://oauth2.googleapis.com/token")!;
  assert.match(String(tokenCall.init?.body), /code_verifier=verifier-123/);
});

test("Google OIDC rejects nonce, issuer and audience mismatches", async () => {
  for (const override of [{ nonce: "wrong" }, { issuer: "https://evil.example" }, { audience: "other-client" }]) {
    const http = await fixture(override);
    const provider = new GoogleOidcPrincipalProvider({ issuer: "https://accounts.google.com", clientId: "bound-client", clientSecret: "secret", fetch: http.fetchFn, now: () => new Date(1788005000 * 1000) });
    await assert.rejects(() => provider.verifyCallback({ code: "code", codeVerifier: "verifier", expectedNonce: "nonce-expected", callbackUrl: "https://bound.example/auth/v1/login/google/callback" }), /OIDC callback validation failed/);
  }
});

test("Google OIDC fails closed when the provider rejects the PKCE verifier", async () => {
  const http = await fixture();
  const provider = new GoogleOidcPrincipalProvider({ issuer: "https://accounts.google.com", clientId: "bound-client", clientSecret: "secret",
    fetch: async (input, init) => {
      if (String(input) === "https://oauth2.googleapis.com/token") {
        assert.match(String(init?.body), /code_verifier=invalid-verifier/);
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      return http.fetchFn(input, init);
    }, now: () => new Date(1788005000 * 1000) });
  await assert.rejects(() => provider.verifyCallback({ code: "code", codeVerifier: "invalid-verifier", expectedNonce: "nonce-expected", callbackUrl: "https://bound.example/auth/v1/login/google/callback" }), /OIDC callback validation failed/);
});

test("Google discovery rejects unapproved issuer and endpoint origins", async () => {
  const provider = new GoogleOidcPrincipalProvider({
    issuer: "https://accounts.google.com", clientId: "bound-client", clientSecret: "secret",
    fetch: async () => new Response(JSON.stringify({ issuer: "https://accounts.google.com", authorization_endpoint: "https://evil.example/auth", token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs" }), { status: 200 }),
  });
  await assert.rejects(() => provider.createAuthorizationRequest({ state: "state", nonce: "nonce", codeChallenge: "challenge", callbackUrl: "https://bound.example/callback" }), /OIDC discovery validation failed/);
});
