import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEventHash,
  calculatePayloadHash,
  canonicalEventHashInput,
  sanitizeLedgerPayload,
  validateAuditChain,
  type StoredAuditEvent,
} from "../src/modules/ledger/index.js";

const payload = {
  mandate_id: "mandate_ledger_001",
  principal_id: "principal_ledger_001",
  agent_id: "agent_ledger_001",
  status: "DRAFT" as const,
  created_at: "2026-08-29T12:00:00.000Z",
};

function event(
  eventId: string,
  previousHash: string | null,
  sanitizedPayload = payload,
): StoredAuditEvent {
  const candidate: StoredAuditEvent = {
    eventId,
    correlationId: "corr_ledger_001",
    eventType: "mandate.created",
    subjectId: "mandate_ledger_001",
    sanitizedPayload,
    payloadHash: calculatePayloadHash(sanitizedPayload),
    previousHash,
    eventHash: "",
    recordedAt: new Date("2026-08-29T12:00:00.000Z"),
  };
  candidate.eventHash = calculateEventHash(candidate);
  return candidate;
}

test("the same sanitized payload and canonical event input produce the same hashes", () => {
  const first = event("event_ledger_001", null);
  const second = event("event_ledger_001", null);

  assert.equal(calculatePayloadHash(payload), calculatePayloadHash({ ...payload }));
  assert.equal(first.eventHash, second.eventHash);
  assert.deepEqual(canonicalEventHashInput(first), {
    event_id: "event_ledger_001",
    correlation_id: "corr_ledger_001",
    event_type: "mandate.created",
    subject_id: "mandate_ledger_001",
    payload_hash: first.payloadHash,
    previous_hash: null,
    recorded_at: "2026-08-29T12:00:00.000Z",
  });
});

test("payload, previous_hash and order tampering invalidate a subject chain", () => {
  const first = event("event_ledger_001", null);
  const second = event("event_ledger_002", first.eventHash);
  assert.deepEqual(validateAuditChain([first, second]), { valid: true });

  const changedPayload = { ...second, sanitizedPayload: { ...payload, agent_id: "agent_changed" } };
  assert.deepEqual(validateAuditChain([first, changedPayload]), {
    valid: false,
    index: 1,
    reason: "payload_hash_mismatch",
  });

  const changedPrevious = { ...second, previousHash: "f".repeat(64) };
  changedPrevious.eventHash = calculateEventHash(changedPrevious);
  assert.deepEqual(validateAuditChain([first, changedPrevious]), {
    valid: false,
    index: 1,
    reason: "previous_hash_mismatch",
  });

  assert.deepEqual(validateAuditChain([second, first]), {
    valid: false,
    index: 0,
    reason: "previous_hash_mismatch",
  });
});

test("event payload allowlists reject proof, signature and credential fields", () => {
  assert.throws(() => sanitizeLedgerPayload("mandate.created", {
    ...payload,
    proof: "raw-proof",
    signature: "reusable-signature",
    credential_id: "credential_secret",
  } as never));
});
