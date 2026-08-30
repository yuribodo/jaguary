import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  agentRequestProofFixture,
  mandateFixture,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  sha256CanonicalJson,
  travelBotFixture,
  type Mandate,
  type ReasonCode,
} from "../src/contracts/v1/index.js";
import {
  evaluate,
  VERIFY_POLICY_VERSION,
  type VerifyPolicyInput,
} from "../src/modules/verify/index.js";
import { agentBindingHash } from "../src/modules/trust/index.js";

function canonicalInput(): VerifyPolicyInput {
  return {
    agent: structuredClone(travelBotFixture),
    agent_request: {
      agent_id: agentRequestProofFixture.payload.agent_id,
      key_id: agentRequestProofFixture.payload.key_id,
      build_fingerprint: agentRequestProofFixture.payload.build_fingerprint,
      nonce: agentRequestProofFixture.payload.nonce,
      issued_at: agentRequestProofFixture.payload.issued_at,
      expires_at: agentRequestProofFixture.payload.expires_at,
    },
    mandate: structuredClone(mandateFixture),
    mandate_signature_valid: true,
    authorization: structuredClone(normalizedAuthorizationFixture),
    checkout: structuredClone(normalizedCheckoutFixture),
    checkout_signature_valid: true,
    human_approval_required: false,
    now: "2026-08-29T12:04:00.000Z",
    usage: {
      aggregate_spend: { amount: 0, currency: "USD" as const },
      uses: 0,
    },
    nonce_status: "UNUSED" as const,
  };
}

function resignCheckout(input: VerifyPolicyInput): void {
  input.checkout.checkout_hash = sha256CanonicalJson(input.checkout.terms);
  input.authorization.checkout_hash = input.checkout.checkout_hash;
  input.checkout_signature_valid = true;
}

test("canonical VuelaYa checkout is allowed with deterministic evidence inputs", () => {
  assert.deepEqual(evaluate(canonicalInput()), {
    decision: "ALLOW",
    reasons: [],
    policy_version: VERIFY_POLICY_VERSION,
    evidence_inputs: {
      agent_id: "agent_travelbot",
      agent_request_nonce: "nonce_travelbot_001",
      mandate_id: "mandate_marta_travel_001",
      mandate_terms_hash: "004d96590e21d373d76147da96b499413bd5879f59c3e833920cc1451ca642ee",
      authorization_proof_hash: "6be44382fe92592b3024679a5254978884770c747b5f9e85a2f40e90b681bca2",
      checkout_id: "checkout_vy_471_gru_cor",
      checkout_hash: "d2f3856b7bac0531b71ac6ff9e2e2fd7f970d38d3fcef79afde052b77b0f071d",
      evaluated_at: "2026-08-29T12:04:00.000Z",
      aggregate_spend: { amount: 0, currency: "USD" },
      uses: 0,
      nonce_status: "UNUSED",
      human_approval_required: false,
      trust_snapshot: null,
    },
  });
});

test("Verify v2 denies from the centralized trust decision and binds its snapshot into evidence", () => {
  const input = canonicalInput();
  const trustSnapshot = {
    mode: "EXTERNAL_REQUIRED" as const, agent_id: "agent_travelbot", principal_id: "principal_marta", operational_status: "ACTIVE" as const,
    attestation_status: "PENDING" as const, attestation_id: "attestation_pending_001", key_id: travelBotFixture.verification_key.key_id,
    build_fingerprint: travelBotFixture.build_fingerprint, provider: "didit" as const, assurance_claims: [], assurance_level: "LOCAL_CRYPTOGRAPHIC" as const,
    binding_hash: agentBindingHash({ agentId: "agent_travelbot", principalId: "principal_marta", keyId: travelBotFixture.verification_key.key_id, buildFingerprint: travelBotFixture.build_fingerprint }),
    evidence_reference_hash: "a".repeat(64), issued_at: null, expires_at: null,
  };
  input.agent_trust = trustSnapshot;
  input.agent_eligibility_reason = "agent_attestation_pending";

  const result = evaluate(input);
  assert.equal(VERIFY_POLICY_VERSION, "bound.verify.v2");
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["agent_attestation_pending"]);
  assert.deepEqual(result.evidence_inputs.trust_snapshot, trustSnapshot);
});

test("an agent different from the mandate binding is denied", () => {
  const input = canonicalInput();
  input.agent_request.agent_id = "agent_impostor";

  assert.deepEqual(evaluate(input).reasons, ["agent_not_authorized"]);
  assert.equal(evaluate(input).decision, "DENY");
});

for (const [name, mutate] of [
  ["registered agent", (input: VerifyPolicyInput) => {
    input.agent.agent_id = "agent_other";
  }],
  ["registered principal", (input: VerifyPolicyInput) => {
    input.agent.principal_id = "principal_other";
  }],
  ["authorization agent", (input: VerifyPolicyInput) => {
    input.authorization.agent_id = "agent_other";
  }],
  ["authorization principal", (input: VerifyPolicyInput) => {
    input.authorization.principal_id = "principal_other";
  }],
] satisfies Array<[string, (input: VerifyPolicyInput) => void]>) {
  test(`${name} binding mismatch is denied`, () => {
    const input = canonicalInput();
    mutate(input);

    assert.deepEqual(evaluate(input).reasons, ["agent_not_authorized"]);
  });
}

for (const [name, mandate, reason] of [
  ["revoked", {
    ...mandateFixture,
    status: "REVOKED",
    authority_valid: false,
    revoked_at: "2026-08-29T12:03:30.000Z",
  }, "mandate_revoked"],
  ["expired", {
    ...mandateFixture,
    status: "EXPIRED",
    authority_valid: false,
  }, "mandate_expired"],
] satisfies Array<[string, Mandate, ReasonCode]>) {
  test(`${name} mandate is denied with its stable reason`, () => {
    const result = evaluate({ ...canonicalInput(), mandate });

    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, [reason]);
  });
}

test("a checkout from a merchant outside the mandate is denied", () => {
  const input = canonicalInput();
  input.checkout.terms.merchant_id = "merchant_attacker";
  resignCheckout(input);

  const result = evaluate(input);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["merchant_not_authorized"]);
});

test("a checkout outside the authorized route is denied", () => {
  const input = canonicalInput();
  input.checkout.terms.fulfillment.destination = "EZE";
  resignCheckout(input);

  const result = evaluate(input);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["scope_mismatch"]);
});

test("a checkout outside the authorized cabin is denied", () => {
  const input = canonicalInput();
  Object.assign(input.checkout.terms.fulfillment, { cabin: "BUSINESS" });
  resignCheckout(input);

  const result = evaluate(input);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["scope_mismatch"]);
});

for (const [name, mutate, reason] of [
  ["per-purchase amount", (input: VerifyPolicyInput) => {
    input.checkout.terms.total.amount = 15_001;
    input.mandate.terms.max_aggregate.amount = 30_000;
    if ("terms_hash" in input.mandate) {
      input.mandate.terms_hash = sha256CanonicalJson(input.mandate.terms);
    }
    resignCheckout(input);
  }, "amount_limit_exceeded"],
  ["aggregate amount", (input: VerifyPolicyInput) => {
    input.usage.aggregate_spend.amount = 2_000;
  }, "aggregate_limit_exceeded"],
  ["currency", (input: VerifyPolicyInput) => {
    input.checkout.terms.total.currency = "EUR";
    resignCheckout(input);
  }, "currency_mismatch"],
] satisfies Array<[string, (input: VerifyPolicyInput) => void, ReasonCode]>) {
  test(`${name} outside the mandate is denied`, () => {
    const input = canonicalInput();
    mutate(input);

    const result = evaluate(input);
    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, [reason]);
  });
}

for (const [name, mutate, reason] of [
  ["checkout created in the future", (input: VerifyPolicyInput) => {
    input.checkout.terms.created_at = "2026-08-29T12:05:00.000Z";
    resignCheckout(input);
  }, "checkout_integrity_failure"],
  ["mandate activated in the future", (input: VerifyPolicyInput) => {
    if (input.mandate.status === "ACTIVE") {
      input.mandate.activated_at = "2026-08-29T12:05:00.000Z";
    }
  }, "mandate_not_active"],
] satisfies Array<[string, (input: VerifyPolicyInput) => void, ReasonCode]>) {
  test(`${name} is denied by the validity rule`, () => {
    const input = canonicalInput();
    mutate(input);

    assert.deepEqual(evaluate(input).reasons, [reason]);
  });
}

for (const [name, mutate] of [
  ["invalid signature", (input: VerifyPolicyInput) => {
    input.mandate_signature_valid = false;
  }],
  ["terms changed after signing", (input: VerifyPolicyInput) => {
    input.mandate.terms.max_aggregate.amount = 20_000;
  }],
  ["consumed state", (input: VerifyPolicyInput) => {
    input.mandate = {
      ...mandateFixture,
      status: "CONSUMED",
      authority_valid: false,
    };
  }],
  ["authorization bound to another mandate", (input: VerifyPolicyInput) => {
    input.authorization.mandate_id = "mandate_other";
  }],
] satisfies Array<[string, (input: VerifyPolicyInput) => void]>) {
  test(`mandate ${name} fails closed`, () => {
    const input = canonicalInput();
    mutate(input);

    const result = evaluate(input);
    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, ["mandate_not_active"]);
  });
}

for (const [name, mutate] of [
  ["terms changed after hashing", (input: VerifyPolicyInput) => {
    input.checkout.terms.items[0]!.name = "Injected flight";
  }],
  ["invalid merchant signature", (input: VerifyPolicyInput) => {
    input.checkout_signature_valid = false;
  }],
] satisfies Array<[string, (input: VerifyPolicyInput) => void]>) {
  test(`tampered checkout is denied when ${name}`, () => {
    const input = canonicalInput();
    mutate(input);

    const result = evaluate(input);
    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, ["checkout_integrity_failure"]);
  });
}

test("a reused nonce is denied", () => {
  const input = canonicalInput();
  input.nonce_status = "USED";

  const result = evaluate(input);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["replay_detected"]);
});

for (const [name, mutate, reason] of [
  ["expired agent request", (input: VerifyPolicyInput) => {
    input.now = input.agent_request.expires_at;
  }, "agent_request_expired"],
  ["not-yet-valid agent request", (input: VerifyPolicyInput) => {
    input.now = "2026-08-29T12:02:59.999Z";
  }, "agent_request_not_yet_valid"],
  ["not-yet-valid mandate", (input: VerifyPolicyInput) => {
    input.mandate.terms.valid_from = "2026-08-29T12:05:00.000Z";
    if ("terms_hash" in input.mandate) {
      input.mandate.terms_hash = sha256CanonicalJson(input.mandate.terms);
    }
  }, "mandate_not_active"],
  ["expired active mandate", (input: VerifyPolicyInput) => {
    input.mandate.terms.expires_at = "2026-08-29T12:04:00.000Z";
    input.authorization.expires_at = input.mandate.terms.expires_at;
    if ("terms_hash" in input.mandate) {
      input.mandate.terms_hash = sha256CanonicalJson(input.mandate.terms);
    }
  }, "mandate_expired"],
] satisfies Array<[string, (input: VerifyPolicyInput) => void, ReasonCode]>) {
  test(`${name} is denied using explicit now`, () => {
    const input = canonicalInput();
    mutate(input);

    assert.deepEqual(evaluate(input).reasons, [reason]);
  });
}

test("the aggregate use count cannot exceed the mandate", () => {
  const input = canonicalInput();
  input.usage.uses = 1;

  const result = evaluate(input);
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["usage_limit_exceeded"]);
});

test("an otherwise valid request can require human approval without becoming payable", () => {
  const input = canonicalInput();
  input.human_approval_required = true;

  const result = evaluate(input);
  assert.equal(result.decision, "ESCALATE");
  assert.deepEqual(result.reasons, ["human_approval_required"]);
});

for (const [name, mutate, reason] of [
  ["unknown input field", (input: Record<string, unknown>) => {
    input.unknown_rule = true;
  }, "invalid_agent_signature"],
  ["missing mandate", (input: Record<string, unknown>) => {
    delete input.mandate;
  }, "mandate_not_active"],
  ["malformed checkout", (input: Record<string, unknown>) => {
    input.checkout = {};
  }, "checkout_integrity_failure"],
  ["malformed evaluation time", (input: Record<string, unknown>) => {
    input.now = "not-a-time";
  }, "mandate_not_active"],
  ["negative aggregate spend", (input: Record<string, unknown>) => {
    input.usage = { aggregate_spend: { amount: -1, currency: "USD" }, uses: 0 };
  }, "aggregate_limit_exceeded"],
  ["negative use count", (input: Record<string, unknown>) => {
    input.usage = { aggregate_spend: { amount: 0, currency: "USD" }, uses: -1 };
  }, "usage_limit_exceeded"],
  ["unknown nonce status", (input: Record<string, unknown>) => {
    input.nonce_status = "UNKNOWN";
  }, "replay_detected"],
  ["missing approval rule", (input: Record<string, unknown>) => {
    delete input.human_approval_required;
  }, "mandate_not_active"],
] satisfies Array<[string, (input: Record<string, unknown>) => void, ReasonCode]>) {
  test(`${name} is denied rather than throwing or allowing`, () => {
    const input = canonicalInput() as unknown as Record<string, unknown>;
    mutate(input);

    const result = evaluate(input as unknown as VerifyPolicyInput);
    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, [reason]);
  });
}

test("multiple failures use the documented deterministic rule order", () => {
  const input = canonicalInput();
  input.agent.status = "SUSPENDED";
  input.agent_request.agent_id = "agent_other";
  input.mandate = {
    ...mandateFixture,
    status: "REVOKED",
    authority_valid: false,
    revoked_at: "2026-08-29T12:03:30.000Z",
  };
  input.checkout.terms.merchant_id = "merchant_attacker";
  input.checkout.terms.fulfillment.destination = "EZE";
  input.checkout.terms.total = { amount: 16_000, currency: "EUR" };
  input.now = input.agent_request.expires_at;
  input.usage = {
    aggregate_spend: { amount: 1, currency: "USD" },
    uses: 1,
  };
  input.nonce_status = "USED";

  const expected: ReasonCode[] = [
    "agent_not_active",
    "mandate_revoked",
    "agent_not_authorized",
    "merchant_not_authorized",
    "checkout_integrity_failure",
    "scope_mismatch",
    "amount_limit_exceeded",
    "currency_mismatch",
    "agent_request_expired",
    "aggregate_limit_exceeded",
    "usage_limit_exceeded",
    "replay_detected",
  ];
  for (let run = 0; run < 10; run += 1) {
    assert.deepEqual(evaluate(input).reasons, expected);
  }
});

test("evaluate is pure and the verify module has no forbidden runtime dependencies", async () => {
  const input = canonicalInput();
  const before = structuredClone(input);

  evaluate(input);
  assert.deepEqual(input, before);

  const source = await readFile(
    new URL("../src/modules/verify/policy.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Date\.now\s*\(/);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:fastify|db|database|drizzle|yuno|openai|anthropic|fetch|axios)/i);
});

for (const [name, mutate, reason] of [
  ["missing verified request", (input: Record<string, unknown>) => {
    input.agent_request = null;
  }, "invalid_agent_signature"],
  ["missing agent", (input: Record<string, unknown>) => {
    input.agent = null;
  }, "agent_not_found"],
  ["suspended agent", (input: Record<string, unknown>) => {
    input.agent = { ...travelBotFixture, status: "SUSPENDED" };
  }, "agent_not_active"],
] satisfies Array<[string, (input: Record<string, unknown>) => void, ReasonCode]>) {
  test(`${name} fails closed at the agent rule`, () => {
    const input = canonicalInput() as unknown as Record<string, unknown>;
    mutate(input);

    const result = evaluate(input as unknown as VerifyPolicyInput);
    assert.equal(result.decision, "DENY");
    assert.deepEqual(result.reasons, [reason]);
  });
}
