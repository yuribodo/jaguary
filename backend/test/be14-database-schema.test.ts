import assert from "node:assert/strict";
import test from "node:test";

import { databaseSchema } from "../src/db/schema.js";

test("BE-14 schema owns separate principal auth and agent attestation state", () => {
  assert.deepEqual([
    "principals",
    "principalAuthIdentities",
    "principalLoginTransactions",
    "principalSessions",
    "agentAttestations",
    "agentAttestationEvents",
    "mandateBiometricConsents",
  ].filter((table) => !(table in databaseSchema)), []);
});
