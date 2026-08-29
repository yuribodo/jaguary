import type { DatabaseClient } from "../../db/database.js";

import type { AuditTimeline } from "./schemas.js";
import type { AuditAppendInput, PreparedAuditEvent, StoredAuditEvent } from "./types.js";

export interface AuditLedgerPort {
  append(database: DatabaseClient, input: AuditAppendInput): Promise<StoredAuditEvent>;
  getTimeline(correlationId: string): Promise<AuditTimeline>;
  validateSubject(subjectId: string): Promise<StoredAuditEvent[]>;
}

export interface AuditEventRepository {
  append(database: DatabaseClient, event: PreparedAuditEvent): Promise<StoredAuditEvent>;
  findByCorrelationId(correlationId: string): Promise<StoredAuditEvent[]>;
  findBySubjectId(subjectId: string): Promise<StoredAuditEvent[]>;
  findTimelineEvents(correlationId: string): Promise<StoredAuditEvent[]>;
}
