import { sha256CanonicalJson } from "../../contracts/v1/index.js";

import type { StoredAuditEvent } from "./types.js";

export interface CanonicalEventHashInput {
  event_id: string;
  correlation_id: string;
  event_type: string;
  subject_id: string;
  payload_hash: string;
  previous_hash: string | null;
  recorded_at: string;
}

export function canonicalEventHashInput(
  event: Omit<StoredAuditEvent, "eventHash" | "sanitizedPayload">,
): CanonicalEventHashInput {
  return {
    event_id: event.eventId,
    correlation_id: event.correlationId,
    event_type: event.eventType,
    subject_id: event.subjectId,
    payload_hash: event.payloadHash,
    previous_hash: event.previousHash,
    recorded_at: event.recordedAt.toISOString(),
  };
}

export function calculatePayloadHash(payload: unknown): string {
  return sha256CanonicalJson(payload);
}

export function calculateEventHash(
  event: Omit<StoredAuditEvent, "eventHash" | "sanitizedPayload">,
): string {
  return sha256CanonicalJson(canonicalEventHashInput(event));
}

export type ChainValidationResult =
  | { valid: true }
  | { valid: false; index: number; reason: "mixed_subjects" | "missing_payload" | "payload_hash_mismatch" | "previous_hash_mismatch" | "event_hash_mismatch" };

/** Reconstructs one unambiguous subject chain from its hash links. */
export function orderAuditChain(events: readonly StoredAuditEvent[]): StoredAuditEvent[] {
  if (events.length === 0) return [];
  const roots = events.filter((event) => event.previousHash === null);
  if (roots.length !== 1) throw new Error("Audit subject chain has an inconsistent number of roots");
  const ordered = [roots[0]!];
  while (ordered.length < events.length) {
    const previous = ordered.at(-1)!;
    const children = events.filter((event) => event.previousHash === previous.eventHash);
    if (children.length !== 1) throw new Error("Audit subject chain has an inconsistent link");
    ordered.push(children[0]!);
  }
  return ordered;
}

/** Validates one subject chain in its loaded order and recomputes every hash. */
export function validateAuditChain(events: readonly StoredAuditEvent[]): ChainValidationResult {
  const subjectId = events[0]?.subjectId;
  let previousHash: string | null = null;

  for (const [index, event] of events.entries()) {
    if (event.subjectId !== subjectId) return { valid: false, index, reason: "mixed_subjects" };
    if (event.sanitizedPayload === null) return { valid: false, index, reason: "missing_payload" };
    if (calculatePayloadHash(event.sanitizedPayload) !== event.payloadHash) {
      return { valid: false, index, reason: "payload_hash_mismatch" };
    }
    if (event.previousHash !== previousHash) {
      return { valid: false, index, reason: "previous_hash_mismatch" };
    }
    if (calculateEventHash(event) !== event.eventHash) {
      return { valid: false, index, reason: "event_hash_mismatch" };
    }
    previousHash = event.eventHash;
  }
  return { valid: true };
}
