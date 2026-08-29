import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ConfigurationError, loadEnv } from "../src/config/env.js";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://bound_app:local_password@localhost:55433/bound_test",
};

test("database configuration accepts only PostgreSQL URLs", () => {
  const env = loadEnv(validEnvironment);

  assert.equal(env.DATABASE_URL, validEnvironment.DATABASE_URL);
  assert.deepEqual(env.yuno, { enabled: false });
  assert.throws(
    () => loadEnv({ ...validEnvironment, DATABASE_URL: "sqlite::memory:" }),
    ConfigurationError,
  );
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
