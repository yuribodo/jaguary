import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { PublicApiError, travelWatchModeSchema } from "../../contracts/v1/index.js";
import type { TravelWatchService } from "./watch.js";
import type { TravelWatchSimulatorPort } from "./watch-simulation.js";

const conversationParamsSchema = z.object({ id: z.uuid() }).strict();
const watchParamsSchema = z.object({ id: z.uuid() }).strict();
const createWatchBodySchema = z.object({
  mode: travelWatchModeSchema.extract(["AUTO_PURCHASE"]),
  expires_at: z.iso.datetime({ offset: true }),
}).strict();

function idempotencyKey(headers: Record<string, unknown>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string") throw new TypeError("HTTP conventions did not validate Idempotency-Key");
  return value;
}

export interface TravelWatchRoutesOptions {
  service: Pick<TravelWatchService, "create" | "get" | "getLatestForConversation" | "activate" | "cancel">;
  simulator?: TravelWatchSimulatorPort;
}

export const travelWatchRoutes: FastifyPluginAsync<TravelWatchRoutesOptions> = async (app, options) => {
  app.post<{ Params: { id: string } }>("/v1/conversations/:id/watches", async (request, reply) => {
    const params = conversationParamsSchema.safeParse(request.params);
    const body = createWatchBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new PublicApiError(400, "validation_error", "Travel watch request is invalid");
    }
    const result = await options.service.create({
      conversation_id: params.data.id,
      mode: body.data.mode,
      expires_at: body.data.expires_at,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/v1/travel-watches/:id", async (request) => {
    const params = watchParamsSchema.safeParse(request.params);
    if (!params.success) throw new PublicApiError(404, "not_found", "Travel watch not found");
    return options.service.get(params.data.id);
  });

  app.get<{ Params: { id: string } }>("/v1/conversations/:id/watch", async (request) => {
    const params = conversationParamsSchema.safeParse(request.params);
    if (!params.success) throw new PublicApiError(404, "not_found", "Conversation not found");
    return options.service.getLatestForConversation(params.data.id);
  });

  app.post<{ Params: { id: string } }>("/v1/travel-watches/:id/activate", async (request) => {
    const params = watchParamsSchema.safeParse(request.params);
    if (!params.success || !z.object({}).strict().safeParse(request.body ?? {}).success) {
      throw new PublicApiError(400, "validation_error", "Travel watch activation is invalid");
    }
    return options.service.activate({
      watch_id: params.data.id,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
  });

  app.post<{ Params: { id: string } }>("/v1/travel-watches/:id/cancel", async (request) => {
    const params = watchParamsSchema.safeParse(request.params);
    if (!params.success || !z.object({}).strict().safeParse(request.body ?? {}).success) {
      throw new PublicApiError(400, "validation_error", "Travel watch cancellation is invalid");
    }
    return options.service.cancel({
      watch_id: params.data.id,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
  });

  if (options.simulator !== undefined) {
    app.post<{ Params: { id: string } }>("/v1/dev/travel-watches/:id/simulate-match", async (request) => {
      const params = watchParamsSchema.safeParse(request.params);
      if (!params.success || !z.object({}).strict().safeParse(request.body ?? {}).success) {
        throw new PublicApiError(400, "validation_error", "Travel watch simulation is invalid");
      }
      return options.simulator!.simulateMatch(params.data.id, idempotencyKey(request.headers));
    });
  }
};
