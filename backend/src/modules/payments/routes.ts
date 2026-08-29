import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  identifierSchema,
  PublicApiError,
  type PaymentResult,
} from "../../contracts/v1/index.js";

export interface PaymentHandler {
  pay(authorizationId: string, correlationId: string): Promise<PaymentResult>;
}

interface PaymentRoutesOptions {
  service: PaymentHandler;
}

const emptyPaymentBodySchema = z.object({}).strict().optional();

export const paymentRoutes: FastifyPluginAsync<PaymentRoutesOptions> = async (app, options) => {
  app.post<{ Params: { id: string } }>("/authorizations/:id/pay", async (request) => {
    if (
      !identifierSchema.safeParse(request.params.id).success
      || !emptyPaymentBodySchema.safeParse(request.body).success
    ) {
      throw new PublicApiError(400, "validation_error", "Payment request is invalid");
    }
    return options.service.pay(request.params.id, request.id);
  });
};
