import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
