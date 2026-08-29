import type { DatabaseClient } from "../../db/database.js";

import { calculatePayloadHash } from "./hash-chain.js";
import type { AuditEventRepository, AuditLedgerPort } from "./ports.js";
import { auditTimelineSchema, sanitizeLedgerPayload, type AuditTimeline } from "./schemas.js";
import type { AuditAppendInput, StoredAuditEvent } from "./types.js";

function chainPositions(events: readonly StoredAuditEvent[]): Map<string, number> {
  const byHash = new Map(events.map((event) => [event.eventHash, event]));
  const positions = new Map<string, number>();
  const position = (event: StoredAuditEvent, visited = new Set<string>()): number => {
    const known = positions.get(event.eventHash);
    if (known !== undefined) return known;
    if (visited.has(event.eventHash)) return 0;
    visited.add(event.eventHash);
    const previous = event.previousHash === null ? undefined : byHash.get(event.previousHash);
    const calculated = previous?.subjectId === event.subjectId ? position(previous, visited) + 1 : 0;
    positions.set(event.eventHash, calculated);
    return calculated;
  };
  for (const event of events) {
    position(event);
  }
  return positions;
}

export class AuditLedgerService implements AuditLedgerPort {
  constructor(private readonly repository: AuditEventRepository) {}

  async append(database: DatabaseClient, input: AuditAppendInput): Promise<StoredAuditEvent> {
    const sanitizedPayload = sanitizeLedgerPayload(input.eventType, input.payload as never);
    return this.repository.append(database, {
      correlationId: input.correlationId,
      eventType: input.eventType,
      subjectId: input.subjectId,
      sanitizedPayload,
      payloadHash: calculatePayloadHash(sanitizedPayload),
      recordedAt: input.recordedAt,
    });
  }

  async getTimeline(correlationId: string): Promise<AuditTimeline> {
    const events = await this.repository.findByCorrelationId(correlationId);
    const positions = chainPositions(events);
    events.sort((left, right) => {
      const timeDifference = left.recordedAt.getTime() - right.recordedAt.getTime();
      if (timeDifference !== 0) return timeDifference;
      if (left.subjectId === right.subjectId) {
        const positionDifference = (positions.get(left.eventHash) ?? 0) - (positions.get(right.eventHash) ?? 0);
        if (positionDifference !== 0) return positionDifference;
      }
      return left.eventId.localeCompare(right.eventId);
    });
    return auditTimelineSchema.parse({
      correlation_id: correlationId,
      events: events.map((event) => ({
        event_id: event.eventId,
        correlation_id: event.correlationId,
        event_type: event.eventType,
        subject_id: event.subjectId,
        payload: event.sanitizedPayload,
        payload_hash: event.payloadHash,
        previous_hash: event.previousHash,
        event_hash: event.eventHash,
        recorded_at: event.recordedAt.toISOString(),
      })),
    });
  }
}
