import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createMandateDraftInputSchema,
  identifierSchema,
  PublicApiError,
} from "../../contracts/v1/index.js";
import type { MandateService } from "./service.js";

interface MandateRoutesOptions {
  service: MandateService;
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new PublicApiError(400, "validation_error", "Request validation failed");
  }
  return result.data;
}

function idempotencyKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string") throw new Error("HTTP conventions did not validate Idempotency-Key");
  return value;
}

export const mandateRoutes: FastifyPluginAsync<MandateRoutesOptions> = async (app, options) => {
  app.post("/v1/mandates", async (request, reply) => {
    const input = parseInput(createMandateDraftInputSchema, request.body);
    const result = await options.service.createDraft(
      input,
      idempotencyKey(request.headers),
      request.id,
    );
    void reply.status(result.replayed ? 200 : 201);
    return result.mandate;
  });

  app.get<{ Params: { id: string } }>("/v1/mandates/:id", async (request) => {
    const mandateId = parseInput(identifierSchema, request.params.id);
    return options.service.getMandate(mandateId);
  });

  app.post<{ Params: { id: string } }>("/v1/mandates/:id/activate", async (request) => {
    const mandateId = parseInput(identifierSchema, request.params.id);
    parseInput(z.object({}).strict(), request.body ?? {});
    return options.service.activate(mandateId, idempotencyKey(request.headers));
  });

  app.post<{ Params: { id: string } }>("/v1/mandates/:id/revoke", async (request) => {
    const mandateId = parseInput(identifierSchema, request.params.id);
    parseInput(z.object({}).strict(), request.body ?? {});
    return options.service.revoke(mandateId, idempotencyKey(request.headers), request.id);
  });
};
