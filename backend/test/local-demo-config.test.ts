import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, type JsonWebKey } from "node:crypto";
import test from "node:test";

import { parse } from "dotenv";

import {
  configureLocalTravelBotEnvironment,
  generateLocalTravelBotMaterial,
  LocalDemoConfigurationError,
} from "../src/db/local-demo-config.js";

test("generates matching local signing, fingerprint, credential, and encryption material", () => {
  const material = generateLocalTravelBotMaterial();
  const privateKey = createPrivateKey({
    key: JSON.parse(material.TRAVELBOT_AGENT_PRIVATE_JWK) as JsonWebKey,
    format: "jwk",
  });
  const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });

  assert.deepEqual(material.publicJwk, {
    kty: publicJwk.kty,
    crv: publicJwk.crv,
    x: publicJwk.x,
    y: publicJwk.y,
  });
  assert.match(material.TRAVELBOT_AGENT_BUILD_FINGERPRINT, /^[a-f0-9]{64}$/);
  assert.equal(Buffer.from(material.TRAVELBOT_APPROVAL_ENCRYPTION_KEY, "base64").byteLength, 32);
  assert.equal(material.TRAVELBOT_DEMO_CREDENTIAL_ID, "cred_local_travelbot_template");
});

test("adds local material without changing manually supplied provider configuration", () => {
  const source = [
    "NODE_ENV=development",
    "DATABASE_URL=postgresql://bound_dev:bound_dev_local@localhost:55432/bound_dev",
    "OPENAI_API_KEY=manually-supplied-provider-key",
    "SERPAPI_API_KEY=manually-supplied-provider-key",
    "",
  ].join("\n");
  const configured = configureLocalTravelBotEnvironment(source);
  const parsed = parse(configured.content);

  assert.equal(configured.generated, true);
  assert.equal(parsed.OPENAI_API_KEY, "manually-supplied-provider-key");
  assert.equal(parsed.SERPAPI_API_KEY, "manually-supplied-provider-key");
  assert.equal(parsed.TRAVELBOT_AGENT_KEY_ID, "key_local_travelbot_2026");
});

test("keeps a complete existing local configuration unchanged", () => {
  const material = generateLocalTravelBotMaterial();
  const source = Object.entries(material)
    .filter(([field]) => field !== "publicJwk")
    .map(([field, value]) => `${field}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");

  const configured = configureLocalTravelBotEnvironment(source);

  assert.equal(configured.generated, false);
  assert.equal(configured.content, source);
  assert.deepEqual(configured.material.publicJwk, material.publicJwk);
});

test("rejects partial local key configuration instead of generating mismatched values", () => {
  assert.throws(
    () => configureLocalTravelBotEnvironment("TRAVELBOT_AGENT_KEY_ID=existing-key\n"),
    LocalDemoConfigurationError,
  );
});
