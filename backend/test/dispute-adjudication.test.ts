import assert from "node:assert/strict";
import test from "node:test";

import { adjudicatePurchaseDispute } from "../src/modules/disputes/adjudication.js";

test("complete authority evidence denies the claim and assigns principal liability", () => {
  const result = adjudicatePurchaseDispute({
    receipt_ownership_verified: true,
    commercial_binding_verified: true,
    mandate_authority_verified: true,
    agent_identity_verified: true,
    payment_approved_verified: true,
    audit_chain_verified: true,
  });

  assert.deepEqual(result, {
    verdict: "AUTHORIZED",
    liable_party: "PRINCIPAL",
    financial_outcome: "NO_CHARGEBACK",
    resolution_code: "VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE",
  });
});

test("missing authority evidence upholds the claim and assigns merchant liability", () => {
  const result = adjudicatePurchaseDispute({
    receipt_ownership_verified: true,
    commercial_binding_verified: true,
    mandate_authority_verified: false,
    agent_identity_verified: true,
    payment_approved_verified: true,
    audit_chain_verified: true,
  });

  assert.deepEqual(result, {
    verdict: "UNAUTHORIZED",
    liable_party: "MERCHANT",
    financial_outcome: "CHARGEBACK_RECORDED",
    resolution_code: "AUTHORITY_EVIDENCE_INCOMPLETE",
  });
});
