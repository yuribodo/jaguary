import type { FastifyPluginAsync } from "fastify";

import {
  authorizedCheckoutSchema,
  PublicApiError,
  type AuthorizedCheckout,
  type PurchaseIntent,
} from "../../contracts/v1/index.js";

import { getVuelaYaProfile, listVuelaYaOffers } from "./catalog.js";
import type { VuelaYaMerchant } from "./merchant.js";
import type { VuelaYaOrderStore } from "./order-store.js";

const LOCAL_ENDPOINTS = [
  ["/merchant/flights", "offers"],
  ["/ucp/v1/checkout", "create-checkout"],
  ["/ucp/v1/checkout/{id}", "checkout"],
  ["/ucp/v1/checkout/{id}/complete", "complete-checkout"],
  ["/ucp/v1/orders/{id}", "order"],
] as const;

const REQUIRED_CAPABILITIES = [
  "dev.ucp.shopping.checkout",
  "dev.ucp.common.payment.ap2_mandate",
];

function requireAp2Capabilities(header: string | string[] | undefined): void {
  const selected = new Set(
    (Array.isArray(header) ? header.join(",") : (header ?? ""))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const missing = REQUIRED_CAPABILITIES.filter((capability) => !selected.has(capability));
  if (missing.length > 0) {
    throw new PublicApiError(400, "invalid_request", "AP2 capability downgrade is not allowed", {
      missing_capabilities: missing,
    });
  }
}

interface VuelaYaRoutesOptions {
  merchant: VuelaYaMerchant;
  orders?: VuelaYaOrderStore;
}

export const vuelaYaRoutes: FastifyPluginAsync<VuelaYaRoutesOptions> = async (app, options) => {
  app.get("/.well-known/ucp", async (request, reply) => {
    const origin = `${request.protocol}://${request.headers.host ?? "localhost:3001"}`;
    const links = LOCAL_ENDPOINTS
      .map(([path, relation]) => `<${origin}${path}>; rel="${relation}"`)
      .join(", ");
    void reply.header("link", links);
    return getVuelaYaProfile();
  });

  app.get("/merchant/flights", async () => listVuelaYaOffers());

  app.post("/ucp/v1/checkout", async (request, reply) => {
    requireAp2Capabilities(request.headers["ucp-capabilities"]);
    const checkout = await options.merchant.createCheckout(request.body as PurchaseIntent);
    void reply.status(201);
    return checkout;
  });

  app.get<{ Params: { id: string } }>("/ucp/v1/checkout/:id", async (request) => (
    options.merchant.getCheckout(request.params.id)
  ));

  app.post<{ Params: { id: string } }>(
    "/ucp/v1/checkout/:id/complete",
    async (request) => {
      requireAp2Capabilities(request.headers["ucp-capabilities"]);
      const input = request.body as AuthorizedCheckout;
      if (input?.checkout?.terms?.checkout_id !== undefined && input.checkout.terms.checkout_id !== request.params.id) {
        throw new PublicApiError(400, "invalid_request", "Path checkout does not match request body");
      }
      const parsed = authorizedCheckoutSchema.safeParse(input);
      if (!parsed.success) {
        throw new PublicApiError(400, "validation_error", "Checkout completion is invalid");
      }
      const receipt = await options.orders?.findByAuthorization(
        parsed.data.checkout.terms.checkout_id,
        parsed.data.authorization.authorization_id,
      );
      if (receipt === undefined) {
        throw new PublicApiError(
          409,
          "invalid_request",
          "Checkout can only complete after confirmed payment approval",
        );
      }
      return receipt;
    },
  );

  app.get<{ Params: { id: string } }>("/ucp/v1/orders/:id", async (request) => {
    const persisted = await options.orders?.findById(request.params.id);
    if (persisted !== undefined) return persisted;
    return options.merchant.getOrder(request.params.id);
  });
};
