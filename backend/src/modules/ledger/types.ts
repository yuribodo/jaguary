import type { LedgerEventType, LedgerPayload, LedgerPayloadByType } from "./schemas.js";

export type AuditAppendInput = {
  [EventType in LedgerEventType]: {
    correlationId: string;
    eventType: EventType;
    subjectId: string;
    payload: LedgerPayloadByType[EventType];
    recordedAt: Date;
    deduplicationKey?: string;
  };
}[LedgerEventType];

export interface StoredAuditEvent {
  eventId: string;
  correlationId: string;
  eventType: string;
  subjectId: string;
  sanitizedPayload: LedgerPayload | null;
  payloadHash: string;
  previousHash: string | null;
  eventHash: string;
  recordedAt: Date;
}

export interface PreparedAuditEvent {
  correlationId: string;
  eventType: LedgerEventType;
  subjectId: string;
  sanitizedPayload: LedgerPayload;
  payloadHash: string;
  recordedAt: Date;
  deduplicationKey?: string;
}
