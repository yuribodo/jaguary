import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, isNotNull, lte, or, sql } from "drizzle-orm";

import {
  offerCandidateSchema,
  PublicApiError,
  travelWatchAuthoritySchema,
  travelWatchCriteriaSchema,
  travelWatchModeSchema,
  travelWatchNearestMissSchema,
  travelWatchStatusSchema,
  type OfferCandidate,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection } from "../../db/database.js";
import { travelWatchChecks, travelWatches } from "../../db/schema.js";
import type { FlightSearchOutcome, FlightSearchResult } from "../vuelaya/google-flights.js";
import type { TravelWatch, TravelWatchRepositoryPort } from "./watch.js";

type WatchRow = typeof travelWatches.$inferSelect;
const LEASE_MS = 60_000;

function outcome(value: string | null): FlightSearchOutcome | null {
  if (value === null) return null;
  if (value === "MATCH_FOUND" || value === "OVER_BUDGET" || value === "NO_INVENTORY") return value;
  throw new Error("Persisted travel watch outcome is invalid");
}

function fromRow(row: WatchRow): TravelWatch {
  return {
    watch_id: row.watchId,
    conversation_id: row.conversationId,
    principal_id: row.principalId,
    agent_id: row.agentId,
    mode: travelWatchModeSchema.parse(row.mode),
    status: travelWatchStatusSchema.parse(row.status),
    criteria: travelWatchCriteriaSchema.parse(row.criteria),
    criteria_hash: row.criteriaHash,
    mandate_id: row.mandateId,
    authority: travelWatchAuthoritySchema.parse(row.authority),
    next_check_at: row.nextCheckAt?.toISOString() ?? null,
    last_checked_at: row.lastCheckedAt?.toISOString() ?? null,
    expires_at: row.expiresAt.toISOString(),
    attempt_count: row.attemptCount,
    consecutive_failures: row.consecutiveFailures,
    last_outcome: outcome(row.lastOutcome),
    nearest_miss: row.nearestMiss === null ? null : travelWatchNearestMissSchema.parse(row.nearestMiss),
    matched_offer_id: row.matchedOfferId,
    matched_offer: row.matchedOffer === null ? null : offerCandidateSchema.parse(row.matchedOffer),
    receipt_id: row.receiptId,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export class PostgresTravelWatchRepository implements TravelWatchRepositoryPort {
  constructor(private readonly database: DatabaseConnection) {}

  async create(input: TravelWatch, idempotencyKey: string, requestHash: string): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const replay = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.creationIdempotencyKey, idempotencyKey)))[0];
      if (replay !== undefined) {
        if (replay.creationRequestHash !== requestHash) {
          throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was used with another watch request");
        }
        return fromRow(replay);
      }
      const inserted = (await transaction.insert(travelWatches).values({
        watchId: input.watch_id,
        conversationId: input.conversation_id,
        principalId: input.principal_id,
        agentId: input.agent_id,
        mode: input.mode,
        status: input.status,
        criteria: input.criteria,
        criteriaHash: input.criteria_hash,
        mandateId: input.mandate_id,
        authority: input.authority,
        nextCheckAt: input.next_check_at === null ? null : new Date(input.next_check_at),
        lastCheckedAt: input.last_checked_at === null ? null : new Date(input.last_checked_at),
        expiresAt: new Date(input.expires_at),
        attemptCount: input.attempt_count,
        consecutiveFailures: input.consecutive_failures,
        lastOutcome: input.last_outcome,
        nearestMiss: input.nearest_miss,
        matchedOfferId: input.matched_offer_id,
        matchedOffer: input.matched_offer,
        receiptId: input.receipt_id,
        version: input.version,
        creationRequestHash: requestHash,
        creationIdempotencyKey: idempotencyKey,
        createdAt: new Date(input.created_at),
        updatedAt: new Date(input.updated_at),
      }).returning())[0]!;
      return fromRow(inserted);
    });
  }

  async get(watchId: string): Promise<TravelWatch | undefined> {
    const row = (await this.database.db.select().from(travelWatches)
      .where(eq(travelWatches.watchId, watchId)))[0];
    return row === undefined ? undefined : fromRow(row);
  }

  async getLatestForConversation(conversationId: string): Promise<TravelWatch | undefined> {
    const row = (await this.database.db.select().from(travelWatches)
      .where(eq(travelWatches.conversationId, conversationId))
      .orderBy(desc(travelWatches.createdAt), desc(travelWatches.watchId)).limit(1))[0];
    return row === undefined ? undefined : fromRow(row);
  }

  async activate(watchId: string, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status === "ACTIVE") return fromRow(row);
      if (row.status !== "AWAITING_LIVENESS") {
        throw new PublicApiError(409, "invalid_request", "Travel watch is not awaiting liveness");
      }
      const updated = (await transaction.update(travelWatches).set({
        status: "ACTIVE",
        nextCheckAt: now,
        leaseExpiresAt: null,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      return fromRow(updated);
    });
  }

  async expedite(watchId: string, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status !== "ACTIVE") {
        throw new PublicApiError(409, "invalid_request", "Only an active travel watch can be simulated");
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        throw new PublicApiError(409, "invalid_request", "Travel watch has expired");
      }
      const updated = (await transaction.update(travelWatches).set({
        nextCheckAt: now,
        leaseExpiresAt: null,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      return fromRow(updated);
    });
  }

  async claimDue(now: Date): Promise<TravelWatch | undefined> {
    return this.database.transaction(async (transaction) => {
      await transaction.update(travelWatches).set({
        status: "EXPIRED",
        nextCheckAt: null,
        leaseExpiresAt: null,
        version: sql`${travelWatches.version} + 1`,
        updatedAt: now,
      }).where(and(
        or(eq(travelWatches.status, "ACTIVE"), eq(travelWatches.status, "CHECKING")),
        lte(travelWatches.expiresAt, now),
      ));
      const row = (await transaction.select().from(travelWatches).where(or(
        and(
          eq(travelWatches.status, "ACTIVE"),
          isNotNull(travelWatches.nextCheckAt),
          lte(travelWatches.nextCheckAt, now),
        ),
        and(
          eq(travelWatches.status, "CHECKING"),
          isNotNull(travelWatches.leaseExpiresAt),
          lte(travelWatches.leaseExpiresAt, now),
        ),
      )).orderBy(asc(travelWatches.nextCheckAt), asc(travelWatches.createdAt))
        .limit(1).for("update", { skipLocked: true }))[0];
      if (row === undefined) return undefined;
      const updated = (await transaction.update(travelWatches).set({
        status: "CHECKING",
        nextCheckAt: null,
        lastCheckedAt: now,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        attemptCount: row.attemptCount + 1,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, row.watchId)).returning())[0]!;
      return fromRow(updated);
    });
  }

  async reschedule(watchId: string, result: FlightSearchResult, nextCheckAt: Date, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status !== "CHECKING") throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
      const criteria = travelWatchCriteriaSchema.parse(row.criteria);
      const nearest = result.nearest_miss === null ? null : travelWatchNearestMissSchema.parse({
        offer_id: result.nearest_miss.offer_id,
        unit_total: result.nearest_miss.total,
        party_total: {
          amount: result.nearest_miss.total.amount * criteria.passenger_count,
          currency: result.nearest_miss.total.currency,
        },
      });
      const updated = (await transaction.update(travelWatches).set({
        status: "ACTIVE",
        nextCheckAt,
        leaseExpiresAt: null,
        lastOutcome: result.outcome,
        nearestMiss: nearest,
        matchedOfferId: null,
        matchedOffer: null,
        consecutiveFailures: 0,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      await transaction.insert(travelWatchChecks).values({
        checkId: randomUUID(),
        watchId,
        attempt: row.attemptCount,
        outcome: result.outcome,
        nearestMiss: nearest,
        observedAt: new Date(result.observed_at),
        completedAt: now,
      });
      return fromRow(updated);
    });
  }

  async stagePurchase(watchId: string, offer: OfferCandidate, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status !== "CHECKING") throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
      const matchedOffer = offerCandidateSchema.parse(offer);
      const updated = (await transaction.update(travelWatches).set({
        lastOutcome: "MATCH_FOUND",
        matchedOfferId: matchedOffer.offer_id,
        matchedOffer,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      return fromRow(updated);
    });
  }

  async completePurchase(watchId: string, offerId: string, receiptId: string, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status === "COMPLETED" && row.matchedOfferId === offerId && row.receiptId === receiptId) return fromRow(row);
      if (row.status !== "CHECKING") throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
      const updated = (await transaction.update(travelWatches).set({
        status: "COMPLETED",
        nextCheckAt: null,
        leaseExpiresAt: null,
        lastOutcome: "MATCH_FOUND",
        matchedOfferId: offerId,
        receiptId,
        consecutiveFailures: 0,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      await transaction.insert(travelWatchChecks).values({
        checkId: randomUUID(),
        watchId,
        attempt: row.attemptCount,
        outcome: "PURCHASED",
        matchedOfferId: offerId,
        receiptId,
        observedAt: row.lastCheckedAt ?? now,
        completedAt: now,
      });
      return fromRow(updated);
    });
  }

  async failCheck(watchId: string, errorCode: string, nextCheckAt: Date | null, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status !== "CHECKING") throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
      const updated = (await transaction.update(travelWatches).set({
        status: nextCheckAt === null ? "FAILED" : "ACTIVE",
        nextCheckAt,
        leaseExpiresAt: null,
        consecutiveFailures: row.consecutiveFailures + 1,
        ...(errorCode === "checkout_stale" ? { matchedOfferId: null, matchedOffer: null } : {}),
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      await transaction.insert(travelWatchChecks).values({
        checkId: randomUUID(),
        watchId,
        attempt: row.attemptCount,
        outcome: "ERROR",
        errorCode,
        observedAt: row.lastCheckedAt ?? now,
        completedAt: now,
      });
      return fromRow(updated);
    });
  }

  async cancel(watchId: string, now: Date): Promise<TravelWatch> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select().from(travelWatches)
        .where(eq(travelWatches.watchId, watchId)).for("update"))[0];
      if (row === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
      if (row.status === "CANCELLED") return fromRow(row);
      if (row.status === "COMPLETED" || row.status === "EXPIRED") {
        throw new PublicApiError(409, "invalid_request", "Terminal travel watch cannot be cancelled");
      }
      const updated = (await transaction.update(travelWatches).set({
        status: "CANCELLED",
        nextCheckAt: null,
        leaseExpiresAt: null,
        version: row.version + 1,
        updatedAt: now,
      }).where(eq(travelWatches.watchId, watchId)).returning())[0]!;
      return fromRow(updated);
    });
  }
}
