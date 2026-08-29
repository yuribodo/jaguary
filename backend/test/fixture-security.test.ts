import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const fixtureSourceUrl = new URL("../src/contracts/v1/fixtures/index.ts", import.meta.url);

test("domain fixtures contain no reusable payment or secret material", async () => {
  const source = (await readFile(fixtureSourceUrl, "utf8")).toLowerCase();
  const forbiddenNames = [
    "card_number",
    "security_code",
    "cvv",
    "vaulted_token",
    "reusable_token",
    "private_key",
    "private_secret",
  ];

  for (const forbiddenName of forbiddenNames) {
    assert.equal(source.includes(forbiddenName), false, `${forbiddenName} must not be present`);
  }
  assert.doesNotMatch(source, /\b[0-9]{13,19}\b/, "fixtures must not contain a PAN-like value");
});

test("Yuno adapter fixtures contain only sanitized response bindings", async () => {
  const fixturesUrl = new URL("fixtures/yuno/", import.meta.url);
  const files = await readdir(fixturesUrl);
  const source = (await Promise.all(
    files.map(async (file) => readFile(new URL(file, fixturesUrl), "utf8")),
  )).join("\n").toLowerCase();
  const forbiddenNames = [
    "public-api-key",
    "private-secret-key",
    "customer_payer",
    "email",
    "phone",
    "vaulted_token",
    "network_token",
    "document_number",
    "billing_address",
    "shipping_address",
    "raw_response",
  ];

  for (const forbiddenName of forbiddenNames) {
    assert.equal(source.includes(forbiddenName), false, `${forbiddenName} must not be present`);
  }
  assert.doesNotMatch(source, /\b[0-9]{13,19}\b/, "Yuno fixtures must not contain PAN-like data");
});
