import {
  authorizedCheckoutSchema,
  canonicalizeJson,
  checkoutTermsFixture,
  checkoutTermsSchema,
  normalizedCheckoutSchema,
  orderReceiptSchema,
  offerCandidateFixture,
  purchaseIntentFixture,
  purchaseIntentSchema,
  PublicApiError,
  sha256CanonicalJson,
  type AuthorizedCheckout,
  type CheckoutTerms,
  type ClockPort,
  type CommerceProtocolAdapter,
  type NormalizedCheckout,
  type OrderReceipt,
  type PurchaseIntent,
  type SignerPort,
} from "../../contracts/v1/index.js";
import { VuelaYaCatalog, type VuelaYaCatalogPort } from "./catalog.js";

const encoder = new TextEncoder();

function validationError(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): PublicApiError {
  return new PublicApiError(400, "validation_error", "Request validation failed", {
    issues: issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
  });
}

export async function verifyCheckoutIntegrity(
  input: unknown,
  signer: SignerPort,
): Promise<boolean> {
  const parsed = normalizedCheckoutSchema.safeParse(input);
  if (!parsed.success) return false;

  const { terms, checkout_hash: checkoutHash, merchant_signature: signature } = parsed.data;
  if (sha256CanonicalJson(terms) !== checkoutHash) return false;
  return signer.verify(encoder.encode(canonicalizeJson(terms)), signature);
}

export class VuelaYaMerchant implements CommerceProtocolAdapter {
  readonly #checkouts = new Map<string, NormalizedCheckout>();
  readonly #orders = new Map<string, OrderReceipt>();
  readonly #ordersByAuthorization = new Map<string, OrderReceipt>();
  readonly #ordersByCheckout = new Map<string, OrderReceipt>();

  constructor(
    private readonly signer: SignerPort,
    private readonly clock: ClockPort,
    private readonly catalog: VuelaYaCatalogPort = new VuelaYaCatalog(),
  ) {}

  async discoverProfile() {
    const { getVuelaYaProfile } = await import("./catalog.js");
    return getVuelaYaProfile();
  }

  async createCheckout(input: PurchaseIntent): Promise<NormalizedCheckout> {
    const parsedIntent = purchaseIntentSchema.safeParse(input);
    if (!parsedIntent.success) throw validationError(parsedIntent.error.issues);
    const intent = parsedIntent.data;

    const offer = this.catalog.get(intent.offer_id);
    if (offer === undefined) {
      throw new PublicApiError(404, "not_found", "Offer not found", { offer_id: intent.offer_id });
    }
    if (intent.merchant_id !== offer.merchant_id) {
      throw new PublicApiError(400, "invalid_request", "PurchaseIntent merchant does not match offer");
    }
    if (this.clock.now().getTime() >= Date.parse(offer.available_until)) {
      throw new PublicApiError(410, "invalid_request", "Offer has expired", {
        offer_id: offer.offer_id,
      });
    }

    const items = offer.items.map((item) => {
      const amount = item.unit_price.amount * intent.quantity;
      if (!Number.isSafeInteger(amount)) {
        throw new PublicApiError(422, "invalid_request", "Checkout total exceeds the safe integer range");
      }
      return {
        ...item,
        quantity: intent.quantity,
        total: { amount, currency: item.unit_price.currency },
      };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.total.amount, 0);
    if (!Number.isSafeInteger(totalAmount)) {
      throw new PublicApiError(422, "invalid_request", "Checkout total exceeds the safe integer range");
    }

    const checkoutId = intent.intent_id === purchaseIntentFixture.intent_id && intent.quantity === 1
      ? checkoutTermsFixture.checkout_id
      : `checkout_${sha256CanonicalJson({
        intent_id: intent.intent_id,
        offer_id: intent.offer_id,
        quantity: intent.quantity,
      }).slice(0, 24)}`;
    const fixtureOffer = offer.offer_id === offerCandidateFixture.offer_id;
    const fulfillment = fixtureOffer ? offer.fulfillment : {
      ...offer.fulfillment,
      source_url: offer.source_url,
    };
    const existing = this.#checkouts.get(checkoutId);
    if (existing !== undefined) {
      if (this.clock.now().getTime() >= Date.parse(existing.terms.expires_at)) {
        throw new PublicApiError(410, "invalid_request", "Checkout has expired", {
          checkout_id: checkoutId,
        });
      }
      const expectedEconomics = {
        merchant_id: offer.merchant_id,
        merchant_url: offer.merchant_url,
        items,
        total: { amount: totalAmount, currency: offer.total.currency },
        fulfillment,
      };
      const persistedEconomics = {
        merchant_id: existing.terms.merchant_id,
        merchant_url: existing.terms.merchant_url,
        items: existing.terms.items,
        total: existing.terms.total,
        fulfillment: existing.terms.fulfillment,
      };
      if (canonicalizeJson(expectedEconomics) !== canonicalizeJson(persistedEconomics)) {
        throw new PublicApiError(409, "invalid_request", "Checkout economics changed for the same intent", {
          checkout_id: checkoutId,
        });
      }
      return structuredClone(existing);
    }
    const now = this.clock.now();
    const createdAt = offer.observed_at === undefined ? now : new Date(offer.observed_at);
    const expiresAt = new Date(Math.min(
      Date.parse(offer.available_until),
      createdAt.getTime() + 15 * 60_000,
    ));
    const terms: CheckoutTerms = checkoutTermsSchema.parse(fixtureOffer ? {
      ...checkoutTermsFixture,
      checkout_id: checkoutId,
      items,
      total: { amount: totalAmount, currency: offer.total.currency },
    } : {
      checkout_id: checkoutId,
      merchant_id: offer.merchant_id,
      merchant_url: offer.merchant_url,
      items,
      total: { amount: totalAmount, currency: offer.total.currency },
      fulfillment,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      protocol: checkoutTermsFixture.protocol,
    });
    const checkoutHash = sha256CanonicalJson(terms);
    const merchantSignature = await this.signer.sign(encoder.encode(canonicalizeJson(terms)), "ES256");
    const checkout = normalizedCheckoutSchema.parse({
      terms,
      checkout_hash: checkoutHash,
      merchant_signature: merchantSignature,
    });
    this.#checkouts.set(terms.checkout_id, structuredClone(checkout));
    return structuredClone(checkout);
  }

  getCheckout(checkoutId: string): NormalizedCheckout {
    const checkout = this.#checkouts.get(checkoutId);
    if (checkout === undefined) {
      throw new PublicApiError(404, "not_found", "Checkout not found", { checkout_id: checkoutId });
    }
    if (this.clock.now().getTime() >= Date.parse(checkout.terms.expires_at)) {
      throw new PublicApiError(410, "invalid_request", "Checkout has expired", { checkout_id: checkoutId });
    }
    return structuredClone(checkout);
  }

  hasCompletedCheckout(checkoutId: string, authorizationId: string): boolean {
    const byCheckout = this.#ordersByCheckout.get(checkoutId);
    const byAuthorization = this.#ordersByAuthorization.get(authorizationId);
    return byCheckout !== undefined
      && byAuthorization !== undefined
      && byCheckout.order_id === byAuthorization.order_id;
  }

  async completeCheckout(
    input: AuthorizedCheckout,
    correlationId = "corr_vuelaya_completion",
  ): Promise<OrderReceipt> {
    const parsed = authorizedCheckoutSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error.issues);
    const authorizedCheckout = parsed.data;
    const { checkout, authorization } = authorizedCheckout;
    const storedCheckout = this.getCheckout(checkout.terms.checkout_id);

    if (this.clock.now().getTime() >= Date.parse(authorization.expires_at)) {
      throw new PublicApiError(410, "invalid_request", "Reserved authorization has expired", {
        authorization_id: authorization.authorization_id,
      });
    }
    if (
      canonicalizeJson(storedCheckout) !== canonicalizeJson(checkout)
      || !(await verifyCheckoutIntegrity(checkout, this.signer))
    ) {
      throw new PublicApiError(
        422,
        "checkout_integrity_failure",
        "Checkout integrity verification failed",
      );
    }

    const existingForCheckout = this.#ordersByCheckout.get(checkout.terms.checkout_id);
    const existingForAuthorization = this.#ordersByAuthorization.get(authorization.authorization_id);
    if (existingForCheckout !== undefined || existingForAuthorization !== undefined) {
      if (
        existingForCheckout !== undefined
        && existingForAuthorization !== undefined
        && existingForCheckout.order_id === existingForAuthorization.order_id
      ) {
        return structuredClone(existingForCheckout);
      }
      throw new PublicApiError(409, "invalid_request", "Checkout or authorization already completed");
    }

    const orderId = `order_${authorization.authorization_id}`;
    const issuedAt = this.clock.now().toISOString();
    const payloadHash = sha256CanonicalJson({
      authorization_id: authorization.authorization_id,
      checkout_hash: checkout.checkout_hash,
      order_id: orderId,
      status: "CONFIRMED",
      total: checkout.terms.total,
    });
    const event = {
      event_id: `event_${authorization.authorization_id}`,
      correlation_id: correlationId,
      event_type: "order.confirmed",
      subject_id: orderId,
      payload_hash: payloadHash,
      previous_hash: null,
      recorded_at: issuedAt,
    } as const;
    const receipt = orderReceiptSchema.parse({
      receipt_id: `receipt_${authorization.authorization_id}`,
      order_id: orderId,
      checkout_id: checkout.terms.checkout_id,
      authorization_id: authorization.authorization_id,
      payment_id: `payment_authorization_${authorization.authorization_id}`,
      merchant_id: checkout.terms.merchant_id,
      status: "CONFIRMED",
      items: checkout.terms.items,
      total: checkout.terms.total,
      fulfillment: checkout.terms.fulfillment,
      issued_at: issuedAt,
      evidence: {
        ...event,
        event_hash: sha256CanonicalJson(event),
      },
    });
    this.#orders.set(orderId, structuredClone(receipt));
    this.#ordersByCheckout.set(checkout.terms.checkout_id, structuredClone(receipt));
    this.#ordersByAuthorization.set(authorization.authorization_id, structuredClone(receipt));
    return structuredClone(receipt);
  }

  getOrder(orderId: string): OrderReceipt {
    const receipt = this.#orders.get(orderId);
    if (receipt === undefined) {
      throw new PublicApiError(404, "not_found", "Order not found", { order_id: orderId });
    }
    return structuredClone(receipt);
  }
}
