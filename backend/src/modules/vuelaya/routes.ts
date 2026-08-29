import type { FastifyPluginAsync } from "fastify";

import {
  PublicApiError,
  type AuthorizedCheckout,
  type PurchaseIntent,
} from "../../contracts/v1/index.js";

import { getVuelaYaProfile, listVuelaYaOffers } from "./catalog.js";
import type { VuelaYaMerchant } from "./merchant.js";

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
    async (request, reply) => {
      requireAp2Capabilities(request.headers["ucp-capabilities"]);
      const input = request.body as AuthorizedCheckout;
      if (input?.checkout?.terms?.checkout_id !== undefined && input.checkout.terms.checkout_id !== request.params.id) {
        throw new PublicApiError(400, "invalid_request", "Path checkout does not match request body");
      }
      const existed = input?.authorization?.authorization_id === undefined
        ? false
        : options.merchant.hasCompletedCheckout(request.params.id, input.authorization.authorization_id);
      const receipt = await options.merchant.completeCheckout(input, request.id);
      void reply.status(existed ? 200 : 201);
      return receipt;
    },
  );

  app.get<{ Params: { id: string } }>("/ucp/v1/orders/:id", async (request) => (
    options.merchant.getOrder(request.params.id)
  ));
};
