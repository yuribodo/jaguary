import {
  normalizedAuthorizationSchema,
  PublicApiError,
  sha256CanonicalJson,
  type ActiveMandate,
  type AgentRequestProof,
  type ClockPort,
  type NormalizedCheckout,
  type OfferCandidate,
  type OrderReceipt,
  type PaymentResult,
  type PurchaseIntent,
} from "../../contracts/v1/index.js";
import type { VuelaYaCatalogPort } from "../vuelaya/catalog.js";
import type { AgentProofFactoryPort } from "./application-tools.js";
import type { TravelWatch } from "./watch.js";

interface WatchMerchantPort {
  createCheckout(input: PurchaseIntent): Promise<NormalizedCheckout>;
}

interface WatchMandateReaderPort {
  loadActiveMandate(mandateId: string): Promise<ActiveMandate>;
}

interface WatchVerifyPort {
  verify(request: {
    request_body: {
      authorization: ReturnType<typeof normalizedAuthorizationSchema.parse>;
      checkout: NormalizedCheckout;
    };
    proof: AgentRequestProof;
  }, idempotencyKey: string, correlationId: string): Promise<{
    decision: "ALLOW" | "DENY" | "ESCALATE";
    reasons: string[];
    authorization_id?: string;
  }>;
}

interface WatchReceiptReaderPort {
  findByAuthorization(checkoutId: string, authorizationId: string): Promise<OrderReceipt | undefined>;
}

export interface ApplicationTravelWatchPurchasesOptions {
  merchant: WatchMerchantPort;
  mandates: WatchMandateReaderPort;
  verify: WatchVerifyPort;
  payments: { pay(authorizationId: string, correlationId: string): Promise<PaymentResult> };
  receipts: WatchReceiptReaderPort;
  proofFactory: AgentProofFactoryPort;
  clock: ClockPort;
  catalog?: Pick<VuelaYaCatalogPort, "remember">;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256CanonicalJson(value).slice(0, 32)}`;
}

function matchesAuthorizedWatch(watch: TravelWatch, offer: OfferCandidate, now: Date): boolean {
  const total = offer.total.amount * watch.criteria.passenger_count;
  const constraints = watch.authority.flight_constraints;
  const departure = Date.parse(offer.fulfillment.departure_at);
  return Number.isSafeInteger(total)
    && watch.mode === "AUTO_PURCHASE"
    && watch.status === "CHECKING"
    && offer.fulfillment.origin === watch.criteria.origin_iata
    && offer.fulfillment.destination === watch.criteria.destination_iata
    && offer.fulfillment.cabin === watch.criteria.cabin
    && departure >= Date.parse(constraints.departure_not_before)
    && departure <= Date.parse(constraints.departure_not_after)
    && departure > now.getTime()
    && offer.total.currency === watch.authority.max_per_purchase.currency
    && total <= watch.authority.max_per_purchase.amount;
}

export class ApplicationTravelWatchPurchases {
  constructor(private readonly options: ApplicationTravelWatchPurchasesOptions) {}

  async purchase(input: {
    watch: TravelWatch;
    offer: OfferCandidate;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<
    | { status: "COMPLETED"; receipt_id: string }
    | { status: "FAILED"; reason_code: string }
  > {
    if (!matchesAuthorizedWatch(input.watch, input.offer, this.options.clock.now())) {
      return { status: "FAILED", reason_code: "watch_scope_mismatch" };
    }
    this.options.catalog?.remember?.([input.offer]);
    let checkout: NormalizedCheckout;
    try {
      checkout = await this.options.merchant.createCheckout({
        intent_id: stableId("intent_watch", {
          watch_id: input.watch.watch_id,
          criteria_hash: input.watch.criteria_hash,
          offer_id: input.offer.offer_id,
        }),
        agent_id: input.watch.agent_id,
        merchant_id: input.offer.merchant_id,
        offer_id: input.offer.offer_id,
        quantity: input.watch.criteria.passenger_count,
        requested_at: this.options.clock.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof PublicApiError && [404, 409, 410].includes(error.statusCode)) {
        return { status: "FAILED", reason_code: "checkout_stale" };
      }
      throw error;
    }
    const constraints = input.watch.authority.flight_constraints;
    const departure = Date.parse(checkout.terms.fulfillment.departure_at);
    if (
      checkout.terms.total.currency !== input.watch.authority.max_per_purchase.currency
      || checkout.terms.total.amount > input.watch.authority.max_per_purchase.amount
      || checkout.terms.fulfillment.origin !== input.watch.criteria.origin_iata
      || checkout.terms.fulfillment.destination !== input.watch.criteria.destination_iata
      || checkout.terms.fulfillment.cabin !== input.watch.criteria.cabin
      || departure < Date.parse(constraints.departure_not_before)
      || departure > Date.parse(constraints.departure_not_after)
      || departure <= this.options.clock.now().getTime()
      || checkout.terms.items.some(({ quantity }) => quantity !== constraints.passenger_count)
    ) return { status: "FAILED", reason_code: "checkout_stale" };

    const mandate = await this.options.mandates.loadActiveMandate(input.watch.mandate_id);
    const authorization = normalizedAuthorizationSchema.parse({
      principal_id: input.watch.principal_id,
      agent_id: input.watch.agent_id,
      mandate_id: mandate.terms.mandate_id,
      allowed_merchant_ids: [checkout.terms.merchant_id],
      checkout_hash: checkout.checkout_hash,
      max_amount: mandate.terms.max_per_purchase,
      expires_at: mandate.terms.expires_at,
      max_uses: mandate.terms.max_uses,
      proof_type: "AP2",
      proof_reference: stableId("proof_watch", {
        watch_id: input.watch.watch_id,
        criteria_hash: input.watch.criteria_hash,
      }),
      proof_hash: sha256CanonicalJson({
        watch_id: input.watch.watch_id,
        criteria_hash: input.watch.criteria_hash,
        mandate_terms_hash: mandate.terms_hash,
        checkout_hash: checkout.checkout_hash,
      }),
    });
    const requestBody = { authorization, checkout };
    const issuedAt = this.options.clock.now();
    const proof = await this.options.proofFactory.sign({
      body: requestBody,
      agent_id: input.watch.agent_id,
      nonce: stableId("nonce_watch", {
        watch_id: input.watch.watch_id,
        checkout_hash: checkout.checkout_hash,
      }),
      issued_at: issuedAt.toISOString(),
      expires_at: new Date(issuedAt.getTime() + 5 * 60_000).toISOString(),
    });
    const decision = await this.options.verify.verify(
      { request_body: requestBody, proof },
      stableId("verify_watch", input.idempotency_key),
      input.correlation_id,
    );
    if (decision.decision !== "ALLOW" || decision.authorization_id === undefined) {
      return { status: "FAILED", reason_code: decision.reasons[0] ?? "verify_denied" };
    }
    const payment = await this.options.payments.pay(decision.authorization_id, input.correlation_id);
    if (payment.status !== "APPROVED") {
      return { status: "FAILED", reason_code: `payment_${payment.status.toLowerCase()}` };
    }
    const receipt = await this.options.receipts.findByAuthorization(
      checkout.terms.checkout_id,
      decision.authorization_id,
    );
    if (receipt === undefined) throw new Error("Approved watch payment did not create a receipt");
    return { status: "COMPLETED", receipt_id: receipt.receipt_id };
  }
}
