import {
  normalizedAuthorizationSchema,
  sha256CanonicalJson,
  type AgentRequestProof,
  type ClockPort,
  type Mandate,
  type NormalizedCheckout,
  type OfferCandidate,
  type OrderReceipt,
  type PaymentResult,
  type PurchaseIntent,
} from "../../contracts/v1/index.js";
import { listVuelaYaOffers } from "../vuelaya/catalog.js";
import type { VuelaYaCatalogPort } from "../vuelaya/catalog.js";
import type { TravelBotConversation, TravelBotToolsPort } from "./types.js";

interface MerchantPort {
  createCheckout(input: PurchaseIntent): Promise<NormalizedCheckout>;
}

interface MandateApplicationPort {
  createDraft(input: {
    mandate_id: string;
    principal_id: string;
    agent_id: string;
    allowed_merchant_ids: string[];
    allowed_merchant_categories: string[];
    route: { origin: string; destination: string };
    cabin: NonNullable<TravelBotConversation["intent"]["cabin"]>;
    max_per_purchase: NonNullable<TravelBotConversation["intent"]["max_total_budget"]>;
    max_aggregate: NonNullable<TravelBotConversation["intent"]["max_total_budget"]>;
    max_uses: number;
    valid_from: string;
    expires_at: string;
    credential_id: string;
  }, idempotencyKey: string, correlationId: string): Promise<{ mandate: Mandate }>;
  activate(mandateId: string, idempotencyKey: string, correlationId: string): Promise<Mandate>;
  loadActiveMandate(mandateId: string): Promise<Extract<Mandate, { status: "ACTIVE" }>>;
}

interface VerifyApplicationPort {
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

export interface AgentProofFactoryPort {
  sign(input: {
    body: unknown;
    agent_id: string;
    nonce: string;
    issued_at: string;
    expires_at: string;
  }): Promise<AgentRequestProof>;
}

interface ReceiptReaderPort {
  findByAuthorization(checkoutId: string, authorizationId: string): Promise<OrderReceipt | undefined>;
  getReceipt(receiptId: string): Promise<OrderReceipt>;
}

export interface ApplicationTravelBotToolsOptions {
  merchant: MerchantPort;
  mandates: MandateApplicationPort;
  verify: VerifyApplicationPort;
  payments: { pay(authorizationId: string, correlationId: string): Promise<PaymentResult> };
  receipts: ReceiptReaderPort;
  proofFactory: AgentProofFactoryPort;
  clock: ClockPort;
  credentialId: string;
  audit: { getTimeline(correlationId: string): Promise<{ events: Array<{ event_type: string }> }> };
  catalog?: VuelaYaCatalogPort;
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${sha256CanonicalJson(value).slice(0, 32)}`;
}

function assertCompleteIntent(conversation: TravelBotConversation) {
  const { intent } = conversation;
  if (
    intent.origin_iata === null
    || intent.destination_iata === null
    || intent.departure_date === null
    || intent.passenger_count === null
    || intent.cabin === null
  ) throw new Error("TravelBot tool received an incomplete intent");
  return intent as typeof intent & {
    origin_iata: string;
    destination_iata: string;
    departure_date: string;
    passenger_count: number;
    cabin: NonNullable<typeof intent.cabin>;
    max_total_budget: typeof intent.max_total_budget;
  };
}

export class ApplicationTravelBotTools implements TravelBotToolsPort {
  constructor(private readonly options: ApplicationTravelBotToolsOptions) {}

  async findOffers(intent: TravelBotConversation["intent"]): Promise<OfferCandidate[]> {
    return this.options.catalog?.search(intent) ?? listVuelaYaOffers();
  }

  async createCheckout(input: Parameters<NonNullable<TravelBotToolsPort["createCheckout"]>>[0]) {
    const intent = assertCompleteIntent(input.conversation);
    if (input.conversation.state !== "AWAITING_OFFER_SELECTION") {
      throw new Error("create_checkout is unavailable in the current state");
    }
    this.options.catalog?.remember?.([input.offer]);
    const checkout = await this.options.merchant.createCheckout({
      intent_id: stableId("intent", {
        conversation_id: input.conversation.conversation_id,
        offer_id: input.offer.offer_id,
        quantity: intent.passenger_count,
      }),
      agent_id: input.conversation.agent_id,
      merchant_id: input.offer.merchant_id,
      offer_id: input.offer.offer_id,
      quantity: intent.passenger_count,
      requested_at: this.options.clock.now().toISOString(),
    });
    return {
      checkout_id: checkout.terms.checkout_id,
      checkout_hash: checkout.checkout_hash,
      merchant_id: checkout.terms.merchant_id,
      total: checkout.terms.total,
    };
  }

  async prepareAuthority(input: Parameters<NonNullable<TravelBotToolsPort["prepareAuthority"]>>[0]) {
    const intent = assertCompleteIntent(input.conversation);
    if (input.conversation.state !== "AWAITING_OFFER_SELECTION") {
      throw new Error("prepare_authority is unavailable in the current state");
    }
    const mandateId = stableId("mandate", {
      conversation_id: input.conversation.conversation_id,
      checkout_hash: input.checkout.checkout_hash,
    });
    const now = this.options.clock.now();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const authorityLimit = intent.max_total_budget ?? input.checkout.total;
    const { mandate } = await this.options.mandates.createDraft({
      mandate_id: mandateId,
      principal_id: input.conversation.principal_id,
      agent_id: input.conversation.agent_id,
      allowed_merchant_ids: [input.checkout.merchant_id],
      allowed_merchant_categories: [],
      route: { origin: intent.origin_iata, destination: intent.destination_iata },
      cabin: intent.cabin,
      max_per_purchase: authorityLimit,
      max_aggregate: authorityLimit,
      max_uses: 1,
      valid_from: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      credential_id: this.options.credentialId,
    }, input.idempotency_key, input.correlation_id);
    return {
      mandate_id: mandate.terms.mandate_id,
      status: mandate.status === "ACTIVE" ? "ACTIVE" as const : "DRAFT" as const,
    };
  }

  async activateAuthority(input: Parameters<NonNullable<TravelBotToolsPort["activateAuthority"]>>[0]) {
    const approval = input.conversation.operation.pending_approval;
    const confirmation = input.conversation.intent.confirmation;
    if (
      input.conversation.state !== "AWAITING_AUTHORITY_CONFIRMATION"
      || approval === null
      || confirmation?.decision !== "CONFIRMED"
      || confirmation.approval_id !== approval.approval_id
      || confirmation.checkout_hash !== approval.checkout_hash
      || confirmation.merchant_id !== approval.merchant_id
      || confirmation.amount !== approval.amount
      || confirmation.currency !== approval.currency
      || confirmation.mandate_id !== input.mandate_id
    ) throw new Error("Authority confirmation binding is invalid or stale");
    await this.options.mandates.activate(input.mandate_id, input.idempotency_key, input.correlation_id);
  }

  async requestPurchase(input: Parameters<NonNullable<TravelBotToolsPort["requestPurchase"]>>[0]) {
    const intent = assertCompleteIntent(input.conversation);
    const operation = input.conversation.operation;
    const approval = operation.pending_approval;
    const confirmation = input.conversation.intent.confirmation;
    const offer = input.conversation.offers.find(({ offer_id: id }) => id === intent.selected_offer_id);
    if (
      input.conversation.state !== "AWAITING_AUTHORITY_CONFIRMATION"
      || approval === null
      || confirmation?.decision !== "CONFIRMED"
      || offer === undefined
      || operation.checkout_id === null
      || operation.checkout_hash !== confirmation.checkout_hash
      || operation.mandate_id !== confirmation.mandate_id
    ) throw new Error("Purchase confirmation binding is invalid or stale");
    this.options.catalog?.remember?.([offer]);
    const checkout = await this.options.merchant.createCheckout({
      intent_id: stableId("intent", {
        conversation_id: input.conversation.conversation_id,
        offer_id: offer.offer_id,
        quantity: intent.passenger_count,
      }),
      agent_id: input.conversation.agent_id,
      merchant_id: offer.merchant_id,
      offer_id: offer.offer_id,
      quantity: intent.passenger_count,
      requested_at: this.options.clock.now().toISOString(),
    });
    if (
      checkout.terms.checkout_id !== operation.checkout_id
      || checkout.checkout_hash !== operation.checkout_hash
      || checkout.terms.total.amount !== approval.amount
      || checkout.terms.total.currency !== approval.currency
    ) return { status: "FAILED" as const, reason_code: "checkout_stale" };
    const mandate = await this.options.mandates.loadActiveMandate(operation.mandate_id);
    const authorization = normalizedAuthorizationSchema.parse({
      principal_id: input.conversation.principal_id,
      agent_id: input.conversation.agent_id,
      mandate_id: mandate.terms.mandate_id,
      allowed_merchant_ids: [checkout.terms.merchant_id],
      checkout_hash: checkout.checkout_hash,
      max_amount: mandate.terms.max_per_purchase,
      expires_at: mandate.terms.expires_at,
      max_uses: 1,
      proof_type: "AP2",
      proof_reference: stableId("proof", approval.approval_id),
      proof_hash: sha256CanonicalJson({
        approval_id: approval.approval_id,
        checkout_hash: checkout.checkout_hash,
        mandate_id: mandate.terms.mandate_id,
      }),
    });
    const requestBody = { authorization, checkout };
    const issuedAt = this.options.clock.now();
    const proof = await this.options.proofFactory.sign({
      body: requestBody,
      agent_id: input.conversation.agent_id,
      nonce: stableId("nonce", approval.approval_id),
      issued_at: issuedAt.toISOString(),
      expires_at: new Date(issuedAt.getTime() + 5 * 60 * 1_000).toISOString(),
    });
    const decision = await this.options.verify.verify(
      { request_body: requestBody, proof },
      stableId("verify", approval.approval_id),
      input.correlation_id,
    );
    if (decision.decision !== "ALLOW" || decision.authorization_id === undefined) {
      return { status: "DENIED" as const, reason_code: decision.reasons[0] ?? "verify_denied" };
    }
    const payment = await this.options.payments.pay(decision.authorization_id, input.correlation_id);
    if (payment.status !== "APPROVED") {
      return { status: "FAILED" as const, reason_code: `payment_${payment.status.toLowerCase()}`, authorization_id: decision.authorization_id };
    }
    const receipt = await this.options.receipts.findByAuthorization(
      checkout.terms.checkout_id,
      decision.authorization_id,
    );
    if (receipt === undefined) throw new Error("Approved payment did not create a receipt");
    return {
      status: "COMPLETED" as const,
      authorization_id: decision.authorization_id,
      receipt_id: receipt.receipt_id,
    };
  }

  async getReceipt(conversation: TravelBotConversation) {
    if (conversation.state !== "COMPLETED" || conversation.operation.receipt_id === null) {
      throw new Error("get_receipt is unavailable in the current state");
    }
    const receipt = await this.options.receipts.getReceipt(conversation.operation.receipt_id);
    return { receipt_id: receipt.receipt_id, status: receipt.status, total: receipt.total };
  }

  async getAuditTimeline(conversation: TravelBotConversation) {
    if (conversation.state !== "COMPLETED") {
      throw new Error("get_audit_timeline is unavailable in the current state");
    }
    const correlationId = conversation.messages
      .filter(({ role }) => role === "USER")
      .at(-1)?.correlation_id;
    if (correlationId === undefined) throw new Error("Completed conversation has no correlation ID");
    const timeline = await this.options.audit.getTimeline(correlationId);
    return {
      correlation_id: correlationId,
      event_count: timeline.events.length,
      event_types: [...new Set(timeline.events.map(({ event_type: type }) => type))],
    };
  }
}
