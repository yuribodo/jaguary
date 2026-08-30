import { randomUUID } from "node:crypto";

import {
  PublicApiError,
  sha256CanonicalJson,
  type ClockPort,
  type ConditionalFlightConstraints,
  type CreateMandateDraftInput,
  type Mandate,
  type OfferCandidate,
  travelWatchModeSchema,
  travelWatchStatusSchema,
  type TravelWatchAuthority,
  type TravelWatchCriteria,
  type TravelWatchMode,
  type TravelWatchNearestMiss,
  type TravelWatchStatus,
} from "../../contracts/v1/index.js";
import type { TravelBotConversation, TravelBotRepositoryPort } from "./types.js";
import type { FlightSearchOutcome, FlightSearchResult } from "../vuelaya/google-flights.js";

export const travelWatchModes = travelWatchModeSchema.options;
export const travelWatchStatuses = travelWatchStatusSchema.options;

export interface TravelWatch {
  watch_id: string;
  conversation_id: string;
  principal_id: string;
  agent_id: string;
  mode: TravelWatchMode;
  status: TravelWatchStatus;
  criteria: TravelWatchCriteria;
  criteria_hash: string;
  mandate_id: string;
  authority: TravelWatchAuthority;
  next_check_at: string | null;
  last_checked_at: string | null;
  expires_at: string;
  attempt_count: number;
  consecutive_failures: number;
  last_outcome: FlightSearchOutcome | null;
  nearest_miss: TravelWatchNearestMiss | null;
  matched_offer_id: string | null;
  matched_offer: OfferCandidate | null;
  receipt_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTravelWatchCommand {
  conversation_id: string;
  mode: TravelWatchMode;
  expires_at: string;
  idempotency_key: string;
  correlation_id: string;
}

export interface TravelWatchRepositoryPort {
  create(input: TravelWatch, idempotencyKey: string, requestHash: string): Promise<TravelWatch>;
  get(watchId: string): Promise<TravelWatch | undefined>;
  getLatestForConversation(conversationId: string): Promise<TravelWatch | undefined>;
  activate(watchId: string, now: Date): Promise<TravelWatch>;
  expedite(watchId: string, now: Date): Promise<TravelWatch>;
  claimDue(now: Date): Promise<TravelWatch | undefined>;
  stagePurchase(watchId: string, offer: OfferCandidate, now: Date): Promise<TravelWatch>;
  reschedule(watchId: string, result: FlightSearchResult, nextCheckAt: Date, now: Date): Promise<TravelWatch>;
  failCheck(watchId: string, errorCode: string, nextCheckAt: Date | null, now: Date): Promise<TravelWatch>;
  completePurchase(watchId: string, offerId: string, receiptId: string, now: Date): Promise<TravelWatch>;
  cancel(watchId: string, now: Date): Promise<TravelWatch>;
}

interface WatchMandatesPort {
  createDraft(
    input: CreateMandateDraftInput,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<{ mandate: Mandate }>;
  activate(mandateId: string, idempotencyKey: string, correlationId: string): Promise<Mandate>;
  revoke?(mandateId: string, idempotencyKey: string, correlationId: string): Promise<Mandate>;
}

export interface TravelWatchServiceOptions {
  repository: TravelWatchRepositoryPort;
  conversations: Pick<TravelBotRepositoryPort, "get">;
  mandates: WatchMandatesPort;
  clock: ClockPort;
  credentialId: string;
  merchantId: string;
}

function completeCriteria(conversation: TravelBotConversation): TravelWatchCriteria {
  const intent = conversation.intent;
  if (
    intent.origin_iata === null
    || intent.destination_iata === null
    || intent.departure_date === null
    || intent.passenger_count === null
    || intent.cabin === null
    || intent.max_total_budget === null
  ) throw new PublicApiError(409, "invalid_request", "Travel watch requires complete criteria");
  return {
    origin_iata: intent.origin_iata,
    destination_iata: intent.destination_iata,
    departure_date: intent.departure_date,
    passenger_count: intent.passenger_count,
    cabin: intent.cabin,
    max_total_budget: intent.max_total_budget,
  };
}

export function departureWindow(value: string): Omit<ConditionalFlightConstraints, "passenger_count"> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return {
    departure_not_before: `${value}T00:00:00.000Z`,
    departure_not_after: `${value}T23:59:59.999Z`,
  };
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (match === null) throw new PublicApiError(409, "invalid_request", "Travel watch departure date is invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    departure_not_before: `${value}-01T00:00:00.000Z`,
    departure_not_after: `${value}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`,
  };
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256CanonicalJson(value).slice(0, 32)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryTravelWatchRepository implements TravelWatchRepositoryPort {
  readonly #watches = new Map<string, TravelWatch>();
  readonly #idempotency = new Map<string, { watchId: string; requestHash: string }>();

  async create(input: TravelWatch, idempotencyKey: string, requestHash: string): Promise<TravelWatch> {
    const replay = this.#idempotency.get(idempotencyKey);
    if (replay !== undefined) {
      if (replay.requestHash !== requestHash) {
        throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was used with another watch request");
      }
      return clone(this.#watches.get(replay.watchId)!);
    }
    this.#watches.set(input.watch_id, clone(input));
    this.#idempotency.set(idempotencyKey, { watchId: input.watch_id, requestHash });
    return clone(input);
  }

  async get(watchId: string): Promise<TravelWatch | undefined> {
    const watch = this.#watches.get(watchId);
    return watch === undefined ? undefined : clone(watch);
  }

  async getLatestForConversation(conversationId: string): Promise<TravelWatch | undefined> {
    const watch = [...this.#watches.values()]
      .filter((candidate) => candidate.conversation_id === conversationId)
      .toSorted((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];
    return watch === undefined ? undefined : clone(watch);
  }

  async activate(watchId: string, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status === "ACTIVE") return clone(watch);
    if (watch.status !== "AWAITING_LIVENESS") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not awaiting liveness");
    }
    watch.status = "ACTIVE";
    watch.next_check_at = now.toISOString();
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async expedite(watchId: string, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status !== "ACTIVE") {
      throw new PublicApiError(409, "invalid_request", "Only an active travel watch can be simulated");
    }
    if (Date.parse(watch.expires_at) <= now.getTime()) {
      throw new PublicApiError(409, "invalid_request", "Travel watch has expired");
    }
    watch.next_check_at = now.toISOString();
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async claimDue(now: Date): Promise<TravelWatch | undefined> {
    const due = [...this.#watches.values()]
      .filter((watch) => watch.status === "ACTIVE" && watch.next_check_at !== null)
      .toSorted((left, right) => Date.parse(left.next_check_at!) - Date.parse(right.next_check_at!));
    for (const watch of due) {
      if (now.getTime() >= Date.parse(watch.expires_at)) {
        watch.status = "EXPIRED";
        watch.next_check_at = null;
        watch.version += 1;
        watch.updated_at = now.toISOString();
        continue;
      }
      if (Date.parse(watch.next_check_at!) > now.getTime()) return undefined;
      watch.status = "CHECKING";
      watch.next_check_at = null;
      watch.last_checked_at = now.toISOString();
      watch.attempt_count += 1;
      watch.version += 1;
      watch.updated_at = now.toISOString();
      return clone(watch);
    }
    return undefined;
  }

  async completePurchase(watchId: string, offerId: string, receiptId: string, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status === "COMPLETED" && watch.matched_offer_id === offerId && watch.receipt_id === receiptId) {
      return clone(watch);
    }
    if (watch.status !== "CHECKING") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
    }
    watch.status = "COMPLETED";
    watch.matched_offer_id = offerId;
    watch.receipt_id = receiptId;
    watch.next_check_at = null;
    watch.consecutive_failures = 0;
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async stagePurchase(watchId: string, offer: OfferCandidate, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status !== "CHECKING") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
    }
    watch.matched_offer_id = offer.offer_id;
    watch.matched_offer = clone(offer);
    watch.last_outcome = "MATCH_FOUND";
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async reschedule(watchId: string, result: FlightSearchResult, nextCheckAt: Date, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status !== "CHECKING") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
    }
    const nearest = result.nearest_miss;
    const partyAmount = nearest === null ? null : nearest.total.amount * watch.criteria.passenger_count;
    if (partyAmount !== null && !Number.isSafeInteger(partyAmount)) {
      throw new Error("Travel watch nearest total exceeds the safe integer range");
    }
    watch.status = "ACTIVE";
    watch.last_outcome = result.outcome;
    watch.nearest_miss = nearest === null ? null : {
      offer_id: nearest.offer_id,
      unit_total: clone(nearest.total),
      party_total: { amount: partyAmount!, currency: nearest.total.currency },
    };
    watch.next_check_at = nextCheckAt.toISOString();
    watch.consecutive_failures = 0;
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async failCheck(watchId: string, errorCode: string, nextCheckAt: Date | null, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status !== "CHECKING") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not executing a check");
    }
    watch.status = nextCheckAt === null ? "FAILED" : "ACTIVE";
    watch.next_check_at = nextCheckAt?.toISOString() ?? null;
    watch.consecutive_failures += 1;
    if (errorCode === "checkout_stale") {
      watch.matched_offer_id = null;
      watch.matched_offer = null;
    }
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }

  async cancel(watchId: string, now: Date): Promise<TravelWatch> {
    const watch = this.#watches.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    if (watch.status === "CANCELLED") return clone(watch);
    if (watch.status === "COMPLETED" || watch.status === "EXPIRED") {
      throw new PublicApiError(409, "invalid_request", "Terminal travel watch cannot be cancelled");
    }
    watch.status = "CANCELLED";
    watch.next_check_at = null;
    watch.version += 1;
    watch.updated_at = now.toISOString();
    return clone(watch);
  }
}

export class TravelWatchService {
  constructor(private readonly options: TravelWatchServiceOptions) {}

  async create(command: CreateTravelWatchCommand): Promise<TravelWatch> {
    if (command.mode !== "AUTO_PURCHASE") {
      throw new PublicApiError(400, "validation_error", "Only automatic purchase watches are available in this version");
    }
    const conversation = await this.options.conversations.get(command.conversation_id);
    if (conversation === undefined) throw new PublicApiError(404, "not_found", "Conversation not found");
    if (conversation.state !== "READY_TO_SEARCH") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is unavailable in the current conversation state");
    }
    const criteria = completeCriteria(conversation);
    const now = this.options.clock.now();
    const expiresAt = new Date(command.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new PublicApiError(400, "validation_error", "Travel watch expiry must be in the future");
    }
    const flightConstraints = {
      ...departureWindow(criteria.departure_date),
      passenger_count: criteria.passenger_count,
    };
    if (expiresAt.getTime() > Date.parse(flightConstraints.departure_not_after)) {
      throw new PublicApiError(400, "validation_error", "Travel watch cannot outlive its departure window");
    }
    const criteriaHash = sha256CanonicalJson(criteria);
    const mandateId = stableId("mandate_watch", {
      conversation_id: conversation.conversation_id,
      criteria_hash: criteriaHash,
      expires_at: expiresAt.toISOString(),
      mode: command.mode,
      creation_key: command.idempotency_key,
    });
    const authority = {
      max_per_purchase: clone(criteria.max_total_budget),
      max_uses: 1,
      expires_at: expiresAt.toISOString(),
      flight_constraints: flightConstraints,
    };
    await this.options.mandates.createDraft({
        mandate_id: mandateId,
        principal_id: conversation.principal_id,
        agent_id: conversation.agent_id,
        allowed_merchant_ids: [this.options.merchantId],
        allowed_merchant_categories: [],
        route: { origin: criteria.origin_iata, destination: criteria.destination_iata },
        cabin: criteria.cabin,
        flight_constraints: flightConstraints,
        max_per_purchase: criteria.max_total_budget,
        max_aggregate: criteria.max_total_budget,
        max_uses: 1,
        valid_from: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        credential_id: this.options.credentialId,
    }, `mandate_${command.idempotency_key}`, command.correlation_id);
    const requestHash = sha256CanonicalJson({
      conversation_id: command.conversation_id,
      mode: command.mode,
      expires_at: expiresAt.toISOString(),
    });
    const timestamp = now.toISOString();
    return this.options.repository.create({
      watch_id: randomUUID(),
      conversation_id: conversation.conversation_id,
      principal_id: conversation.principal_id,
      agent_id: conversation.agent_id,
      mode: command.mode,
      status: "AWAITING_LIVENESS",
      criteria,
      criteria_hash: criteriaHash,
      mandate_id: mandateId,
      authority,
      next_check_at: null,
      last_checked_at: null,
      expires_at: expiresAt.toISOString(),
      attempt_count: 0,
      consecutive_failures: 0,
      last_outcome: null,
      nearest_miss: null,
      matched_offer_id: null,
      matched_offer: null,
      receipt_id: null,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }, command.idempotency_key, requestHash);
  }

  async get(watchId: string): Promise<TravelWatch> {
    const watch = await this.options.repository.get(watchId);
    if (watch === undefined) throw new PublicApiError(404, "not_found", "Travel watch not found");
    return watch;
  }

  async getLatestForConversation(conversationId: string): Promise<TravelWatch | null> {
    return await this.options.repository.getLatestForConversation(conversationId) ?? null;
  }

  async activate(command: {
    watch_id: string;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<TravelWatch> {
    const watch = await this.get(command.watch_id);
    if (watch.status === "ACTIVE") return watch;
    if (watch.status !== "AWAITING_LIVENESS" || watch.mode !== "AUTO_PURCHASE") {
      throw new PublicApiError(409, "invalid_request", "Travel watch is not awaiting liveness");
    }
    const mandate = await this.options.mandates.activate(
      watch.mandate_id,
      `mandate_${command.idempotency_key}`,
      command.correlation_id,
    );
    if (mandate.status !== "ACTIVE" || !mandate.authority_valid) {
      throw new PublicApiError(409, "mandate_not_active", "Conditional mandate is not active");
    }
    return this.options.repository.activate(watch.watch_id, this.options.clock.now());
  }

  async cancel(command: {
    watch_id: string;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<TravelWatch> {
    const watch = await this.get(command.watch_id);
    if (watch.status === "CANCELLED") return watch;
    if (watch.status === "COMPLETED" || watch.status === "EXPIRED") {
      throw new PublicApiError(409, "invalid_request", "Terminal travel watch cannot be cancelled");
    }
    if (watch.mode === "AUTO_PURCHASE" && watch.status !== "AWAITING_LIVENESS") {
      if (this.options.mandates.revoke === undefined) throw new Error("Travel watch mandate revocation is unavailable");
      const mandate = await this.options.mandates.revoke(
        watch.mandate_id,
        `mandate_${command.idempotency_key}`,
        command.correlation_id,
      );
      if (!["REVOKED", "EXPIRED", "CONSUMED"].includes(mandate.status)) {
        throw new PublicApiError(409, "mandate_not_active", "Conditional mandate could not be revoked");
      }
    }
    return this.options.repository.cancel(watch.watch_id, this.options.clock.now());
  }
}

interface TravelWatchSearchPort {
  search(criteria: TravelWatchCriteria, watchId?: string): Promise<FlightSearchResult>;
}

interface TravelWatchPurchasePort {
  purchase(input: {
    watch: TravelWatch;
    offer: OfferCandidate;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<
    | { status: "COMPLETED"; receipt_id: string }
    | { status: "FAILED"; reason_code: string }
  >;
}

export interface TravelWatchWorkerOptions {
  repository: TravelWatchRepositoryPort;
  search: TravelWatchSearchPort;
  purchases: TravelWatchPurchasePort;
  clock: ClockPort;
  intervalMs?: number;
}

function matchingOffer(watch: TravelWatch, offers: readonly OfferCandidate[], now: Date): OfferCandidate | undefined {
  return offers.filter((offer) => (
    offer.fulfillment.origin === watch.criteria.origin_iata
    && offer.fulfillment.destination === watch.criteria.destination_iata
    && offer.fulfillment.departure_at.startsWith(watch.criteria.departure_date)
    && offer.fulfillment.cabin === watch.criteria.cabin
    && offer.total.currency === watch.criteria.max_total_budget.currency
    && offer.total.amount * watch.criteria.passenger_count <= watch.criteria.max_total_budget.amount
    && Date.parse(offer.available_until) > now.getTime()
    && Date.parse(offer.fulfillment.departure_at) > now.getTime()
  )).toSorted((left, right) => (
    left.total.amount - right.total.amount
    || Date.parse(left.fulfillment.departure_at) - Date.parse(right.fulfillment.departure_at)
    || left.offer_id.localeCompare(right.offer_id)
  ))[0];
}

export class TravelWatchWorker {
  constructor(private readonly options: TravelWatchWorkerOptions) {}

  async runDue(limit = 10): Promise<number> {
    let processed = 0;
    while (processed < limit) {
      const watch = await this.options.repository.claimDue(this.options.clock.now());
      if (watch === undefined) break;
      try {
        let executingWatch = watch;
        let offer = watch.matched_offer ?? undefined;
        if (offer === undefined) {
          const result = await this.options.search.search(watch.criteria, watch.watch_id);
          offer = matchingOffer(watch, result.matches, this.options.clock.now());
          if (offer === undefined) {
            const intervalMs = this.options.intervalMs ?? 2 * 60 * 60_000;
            await this.options.repository.reschedule(
              watch.watch_id,
              result,
              new Date(this.options.clock.now().getTime() + intervalMs),
              this.options.clock.now(),
            );
            processed += 1;
            continue;
          }
          executingWatch = await this.options.repository.stagePurchase(
            watch.watch_id,
            offer,
            this.options.clock.now(),
          );
        }
        const purchase = await this.options.purchases.purchase({
          watch: executingWatch,
          offer,
          idempotency_key: stableId("purchase_watch", {
            watch_id: watch.watch_id,
            criteria_hash: watch.criteria_hash,
            offer_id: offer.offer_id,
          }),
          correlation_id: stableId("corr_watch", { watch_id: watch.watch_id, attempt: watch.attempt_count }),
        });
        if (purchase.status !== "COMPLETED") {
          const retryable = purchase.reason_code === "checkout_stale";
          await this.options.repository.failCheck(
            watch.watch_id,
            purchase.reason_code,
            retryable ? new Date(this.options.clock.now().getTime() + 5 * 60_000) : null,
            this.options.clock.now(),
          );
          processed += 1;
          continue;
        }
        await this.options.repository.completePurchase(
          watch.watch_id,
          offer.offer_id,
          purchase.receipt_id,
          this.options.clock.now(),
        );
      } catch {
        const backoffMinutes = [5, 15, 60, 180][Math.min(watch.consecutive_failures, 3)]!;
        await this.options.repository.failCheck(
          watch.watch_id,
          "provider_unavailable",
          new Date(this.options.clock.now().getTime() + backoffMinutes * 60_000),
          this.options.clock.now(),
        );
      }
      processed += 1;
    }
    return processed;
  }
}
