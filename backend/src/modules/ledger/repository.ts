import { randomUUID } from "node:crypto";

import { asc, eq, inArray, or, sql } from "drizzle-orm";

import type { DatabaseClient } from "../../db/database.js";
import { auditEvents, authorizations, orders, payments } from "../../db/schema.js";

import { calculateEventHash, orderAuditChain, validateAuditChain } from "./hash-chain.js";
import type { AuditEventRepository } from "./ports.js";
import {
  isLedgerEventType,
  ledgerPayloadSchemas,
  type LedgerPayload,
} from "./schemas.js";
import type { PreparedAuditEvent, StoredAuditEvent } from "./types.js";

function storedEvent(row: typeof auditEvents.$inferSelect): StoredAuditEvent {
  let sanitizedPayload: LedgerPayload | null = null;
  if (row.sanitizedPayload !== null && isLedgerEventType(row.eventType)) {
    const parsed = ledgerPayloadSchemas[row.eventType].safeParse(row.sanitizedPayload);
    sanitizedPayload = parsed.success ? parsed.data : null;
  }
  return {
    eventId: row.eventId,
    correlationId: row.correlationId,
    eventType: row.eventType,
    subjectId: row.subjectId,
    sanitizedPayload,
    payloadHash: row.payloadHash,
    previousHash: row.previousHash,
    eventHash: row.eventHash,
    recordedAt: row.recordedAt,
  };
}

function findUniqueTip(events: readonly StoredAuditEvent[]): StoredAuditEvent | undefined {
  if (events.length === 0) return undefined;
  const referencedHashes = new Set(events.flatMap((event) => event.previousHash === null ? [] : [event.previousHash]));
  const tips = events.filter((event) => !referencedHashes.has(event.eventHash));
  if (tips.length !== 1) throw new Error("Audit subject chain has an inconsistent number of tips");
  return tips[0];
}

export class PostgresAuditEventRepository implements AuditEventRepository {
  constructor(private readonly database: DatabaseClient) {}

  async append(database: DatabaseClient, event: PreparedAuditEvent): Promise<StoredAuditEvent> {
    const lockKey = `audit-subject:${event.subjectId}`;
    await database.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const existing = (await database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, event.subjectId)))
      .map(storedEvent);
    const ordered = orderAuditChain(existing);
    if (!validateAuditChain(ordered).valid) throw new Error("Audit chain validation failed before append");
    if (event.deduplicationKey !== undefined) {
      const replay = (await database
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.deduplicationKey, event.deduplicationKey))
        .limit(1))[0];
      if (replay !== undefined) {
        const stored = storedEvent(replay);
        if (
          stored.subjectId !== event.subjectId
          || stored.eventType !== event.eventType
          || stored.payloadHash !== event.payloadHash
        ) {
          throw new Error("Audit deduplication key was reused with different evidence");
        }
        return stored;
      }
    }
    const previousHash = findUniqueTip(ordered)?.eventHash ?? null;
    const candidate: StoredAuditEvent = {
      ...event,
      eventId: `event_${randomUUID()}`,
      previousHash,
      eventHash: "",
    };
    candidate.eventHash = calculateEventHash(candidate);
    const inserted = (await database.insert(auditEvents).values({
      eventId: candidate.eventId,
      correlationId: candidate.correlationId,
      eventType: candidate.eventType,
      subjectId: candidate.subjectId,
      sanitizedPayload: candidate.sanitizedPayload,
      payloadHash: candidate.payloadHash,
      previousHash: candidate.previousHash,
      eventHash: candidate.eventHash,
      deduplicationKey: event.deduplicationKey,
      recordedAt: candidate.recordedAt,
    }).returning())[0];
    if (inserted === undefined) throw new Error("Audit event insert returned no row");
    return storedEvent(inserted);
  }

  async findByCorrelationId(correlationId: string): Promise<StoredAuditEvent[]> {
    const rows = await this.database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.correlationId, correlationId))
      .orderBy(asc(auditEvents.recordedAt), asc(auditEvents.eventId));
    return rows.map(storedEvent);
  }

  async findBySubjectId(subjectId: string): Promise<StoredAuditEvent[]> {
    const rows = await this.database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, subjectId))
      .orderBy(asc(auditEvents.recordedAt), asc(auditEvents.eventId));
    return rows.map(storedEvent);
  }

  async findTimelineEvents(correlationId: string): Promise<StoredAuditEvent[]> {
    const directSubjects = await this.database
      .select({ subjectId: auditEvents.subjectId })
      .from(auditEvents)
      .where(eq(auditEvents.correlationId, correlationId));
    const relatedAuthorizations = await this.database
      .select({ authorizationId: authorizations.authorizationId })
      .from(authorizations)
      .leftJoin(payments, eq(payments.authorizationId, authorizations.authorizationId))
      .leftJoin(orders, eq(orders.authorizationId, authorizations.authorizationId))
      .where(or(
        eq(authorizations.correlationId, correlationId),
        eq(payments.correlationId, correlationId),
        eq(orders.correlationId, correlationId),
      ));
    const subjectIds = [...new Set([
      ...directSubjects.map(({ subjectId }) => subjectId),
      ...relatedAuthorizations.map(({ authorizationId }) => authorizationId),
    ])];
    if (subjectIds.length === 0) return [];
    const rows = await this.database
      .select()
      .from(auditEvents)
      .where(inArray(auditEvents.subjectId, subjectIds))
      .orderBy(asc(auditEvents.recordedAt), asc(auditEvents.eventId));
    return rows.map(storedEvent);
  }
}
