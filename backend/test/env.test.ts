import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ConfigurationError, loadEnv } from "../src/config/env.js";

const validEnvironment = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://bound_app:local_password@localhost:55433/bound_test",
};

test("database configuration accepts only PostgreSQL URLs", () => {
  const env = loadEnv(validEnvironment);

  assert.equal(env.DATABASE_URL, validEnvironment.DATABASE_URL);
  assert.deepEqual(env.yuno, { enabled: false });
  assert.deepEqual(env.openai, { enabled: false });
  assert.deepEqual(env.travelbot, { enabled: false });
  assert.deepEqual(env.langfuse, { enabled: false });
  assert.deepEqual(env.flightSearch, { enabled: false });
  assert.throws(
    () => loadEnv({ ...validEnvironment, DATABASE_URL: "sqlite::memory:" }),
    ConfigurationError,
  );
});

test("BE-14 defaults to explicit local trust and development-only demo auth", () => {
  const env = loadEnv({ ...validEnvironment, NODE_ENV: "development" });
  assert.deepEqual(env.auth, {
    mode: "demo",
    sessionTtlSeconds: 28_800,
    loginTransactionTtlSeconds: 600,
  });
  assert.deepEqual(env.kya, {
    mode: "LOCAL",
    provider: "fake",
    requestTimeoutMs: 5_000,
    attestationTtlSeconds: 31_536_000,
  });
});

test("BE-14 production rejects demo auth and incomplete or unsafe OIDC", () => {
  assert.throws(() => loadEnv({ ...validEnvironment, NODE_ENV: "test", AUTH_MODE: "demo" }), ConfigurationError);
  assert.throws(() => loadEnv({ ...validEnvironment, NODE_ENV: "production", AUTH_MODE: "demo" }), ConfigurationError);
  assert.throws(() => loadEnv({ ...validEnvironment, AUTH_MODE: "oidc" }), ConfigurationError);
  assert.throws(() => loadEnv({
    ...validEnvironment,
    NODE_ENV: "production",
    AUTH_MODE: "oidc",
    AUTH_OIDC_ISSUER: "http://accounts.google.com",
    AUTH_OIDC_CLIENT_ID: "client-id",
    AUTH_OIDC_CLIENT_SECRET: "client-secret-never-log",
    AUTH_OIDC_CALLBACK_URL: "http://bound.example/auth/v1/login/google/callback",
  }), ConfigurationError);
  const env = loadEnv({
    ...validEnvironment,
    NODE_ENV: "production",
    AUTH_MODE: "oidc",
    AUTH_OIDC_ISSUER: "https://accounts.google.com",
    AUTH_OIDC_CLIENT_ID: "client-id",
    AUTH_OIDC_CLIENT_SECRET: "client-secret-never-log",
    AUTH_OIDC_CALLBACK_URL: "https://bound.example/auth/v1/login/google/callback",
  });
  assert.equal(env.auth.mode, "oidc");
});

test("BE-14 external KYA is complete and pinned to the official Didit origin", () => {
  const incomplete = {
    ...validEnvironment,
    KYA_MODE: "EXTERNAL_REQUIRED",
    KYA_PROVIDER: "didit",
  };
  assert.throws(() => loadEnv(incomplete), ConfigurationError);
  assert.throws(() => loadEnv({
    ...incomplete,
    KYA_API_BASE_URL: "https://attacker.example",
    KYA_API_KEY: "secret",
    KYA_WORKFLOW_ID: "550e8400-e29b-41d4-a716-446655440000",
    KYA_BIOMETRIC_WORKFLOW_ID: "550e8400-e29b-41d4-a716-446655440010",
    KYA_WEBHOOK_SECRET: "webhook-secret",
  }), ConfigurationError);
  const env = loadEnv({
    ...incomplete,
    KYA_API_BASE_URL: "https://verification.didit.me",
    KYA_API_KEY: "secret",
    KYA_WORKFLOW_ID: "550e8400-e29b-41d4-a716-446655440000",
    KYA_BIOMETRIC_WORKFLOW_ID: "550e8400-e29b-41d4-a716-446655440010",
    KYA_WEBHOOK_SECRET: "webhook-secret",
  });
  assert.equal(env.kya.mode, "EXTERNAL_REQUIRED");
  assert.equal(env.kya.provider, "didit");
  assert.equal(env.kya.biometricWorkflowId, "550e8400-e29b-41d4-a716-446655440010");
});

test("Google Flights search is backend-only, optional, and validates its controls", () => {
  const env = loadEnv({
    ...validEnvironment,
    SERPAPI_API_KEY: "serpapi-secret",
    FLIGHT_SEARCH_TIMEOUT_MS: "12000",
    GOOGLE_FLIGHTS_DEEP_SEARCH: "true",
  });
  assert.deepEqual(env.flightSearch, {
    enabled: true,
    apiKey: "serpapi-secret",
    timeoutMs: 12_000,
    deepSearch: true,
  });
  assert.throws(() => loadEnv({
    ...validEnvironment,
    SERPAPI_API_KEY: "serpapi-secret",
    FLIGHT_SEARCH_TIMEOUT_MS: "60000",
  }), ConfigurationError);
});

test("OpenAI chat configuration validates the model and fails closed when incomplete", () => {
  const secret = "sk-secret-must-never-appear";
  assert.throws(
    () => loadEnv({ ...validEnvironment, OPENAI_API_KEY: secret }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /OPENAI_MODEL/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
  assert.throws(
    () => loadEnv({
      ...validEnvironment,
      OPENAI_API_KEY: secret,
      OPENAI_MODEL: "model with spaces",
    }),
    ConfigurationError,
  );
  assert.deepEqual(loadEnv({
    ...validEnvironment,
    OPENAI_API_KEY: secret,
    OPENAI_MODEL: "gpt-5.2",
    OPENAI_REQUEST_TIMEOUT_MS: "15000",
    TRAVELBOT_AGENT_PRIVATE_JWK: JSON.stringify({
      kty: "EC", crv: "P-256", x: "x", y: "y", d: "private-never-log",
    }),
    TRAVELBOT_AGENT_KEY_ID: "key_travelbot_test",
    TRAVELBOT_AGENT_BUILD_FINGERPRINT: "a".repeat(64),
    TRAVELBOT_DEMO_CREDENTIAL_ID: "cred_demo_marta_visa",
    TRAVELBOT_APPROVAL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
  }).openai, {
    enabled: true,
    apiKey: secret,
    model: "gpt-5.2",
    requestTimeoutMs: 15_000,
  });
});

test("Yuno is disabled by default and incomplete enablement fails closed", () => {
  const secret = "must-never-appear-in-configuration-errors";

  assert.throws(
    () => loadEnv({
      ...validEnvironment,
      YUNO_ENABLED: "true",
      YUNO_PRIVATE_SECRET_KEY: secret,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /YUNO_BASE_URL/);
      assert.match(error.message, /YUNO_ACCOUNT_ID/);
      assert.match(error.message, /YUNO_PUBLIC_API_KEY/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("Yuno accepts only the official HTTPS sandbox base URL in this phase", () => {
  const configuredEnvironment = {
    ...validEnvironment,
    YUNO_ENABLED: "true",
    YUNO_ACCOUNT_ID: "550e8400-e29b-41d4-a716-446655440000",
    YUNO_PUBLIC_API_KEY: "[REDACTED]",
    YUNO_PRIVATE_SECRET_KEY: "[REDACTED]",
    YUNO_COUNTRY: "BR",
    YUNO_REQUEST_TIMEOUT_MS: "10000",
  };

  assert.throws(
    () => loadEnv({
      ...configuredEnvironment,
      YUNO_BASE_URL: "https://api.y.uno",
    }),
    ConfigurationError,
  );
  const env = loadEnv({
    ...configuredEnvironment,
    YUNO_BASE_URL: "https://api-sandbox.y.uno/",
  });
  assert.deepEqual(env.yuno, {
    enabled: true,
    baseUrl: "https://api-sandbox.y.uno",
    accountId: configuredEnvironment.YUNO_ACCOUNT_ID,
    publicApiKey: configuredEnvironment.YUNO_PUBLIC_API_KEY,
    privateSecretKey: configuredEnvironment.YUNO_PRIVATE_SECRET_KEY,
    country: "BR",
    requestTimeoutMs: 10000,
  });
});

test("invalid database configuration fails with a sanitized error", () => {
  const secret = "do-not-leak-this-password";
  const invalidUrl = `postgresql://bound_app:${secret}@/missing-host`;

  assert.throws(
    () => loadEnv({ ...validEnvironment, DATABASE_URL: invalidUrl }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /DATABASE_URL/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, /bound_app/);
      assert.doesNotMatch(error.message, /postgresql:\/\//);
      return true;
    },
  );
});

test("missing database configuration is rejected", () => {
  assert.throws(() => loadEnv({ NODE_ENV: "test" }), ConfigurationError);
});

test("server startup exits with a sanitized configuration error", async () => {
  const secret = "startup-secret-must-not-leak";
  const serverPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));
  const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: `postgresql://bound_app:${secret}@/missing-host`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  assert.notEqual(exitCode, 0);
  assert.match(output, /DATABASE_URL/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(output, /postgresql:\/\//);
});
