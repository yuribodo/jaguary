import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { correlationIdSchema, identifierSchema, PublicApiError } from "../../contracts/v1/index.js";
import type { TravelBotService } from "./service.js";

const createConversationBodySchema = z.object({
  principal_id: identifierSchema,
  agent_id: identifierSchema,
}).strict();

const postMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(8_000),
}).strict();

const conversationParamsSchema = z.object({ id: z.uuid() }).strict();

export interface TravelBotSseEvent {
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
}

export interface TravelBotEventSource {
  listSseEvents(conversationId: string, afterSequence?: number): Promise<TravelBotSseEvent[]>;
}

interface TravelBotRoutesOptions {
  service: Pick<TravelBotService, "createConversation" | "getConversation" | "postMessage">;
  events?: TravelBotEventSource;
}

function idempotencyKey(headers: Record<string, unknown>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string") throw new TypeError("HTTP conventions did not validate Idempotency-Key");
  return value;
}

function requireCorrelationId(headers: Record<string, unknown>): void {
  const value = headers["x-correlation-id"];
  if (typeof value !== "string" || !correlationIdSchema.safeParse(value).success) {
    throw new PublicApiError(400, "validation_error", "X-Correlation-Id is required for TravelBot mutations");
  }
}

function parseAfterSequence(value: string | string[] | undefined): number {
  if (value === undefined) return 0;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined || !/^\d+$/.test(candidate)) {
    throw new PublicApiError(400, "validation_error", "Last-Event-ID must be an event sequence");
  }
  return Number(candidate);
}

function encodeSse(events: TravelBotSseEvent[]): string {
  return events.map((event) => (
    `id: ${event.sequence}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event.payload)}\n\n`
  )).join("");
}

export const travelBotRoutes: FastifyPluginAsync<TravelBotRoutesOptions> = async (app, options) => {
  app.post("/v1/conversations", async (request, reply) => {
    requireCorrelationId(request.headers);
    const parsed = createConversationBodySchema.safeParse(request.body);
    if (!parsed.success) throw new PublicApiError(400, "validation_error", "Conversation request is invalid");
    const result = await options.service.createConversation({
      ...parsed.data,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/v1/conversations/:id", async (request) => {
    const parsed = conversationParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new PublicApiError(404, "not_found", "Conversation not found");
    return options.service.getConversation(parsed.data.id);
  });

  app.post<{ Params: { id: string } }>("/v1/conversations/:id/messages", async (request, reply) => {
    requireCorrelationId(request.headers);
    const params = conversationParamsSchema.safeParse(request.params);
    const body = postMessageBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new PublicApiError(400, "validation_error", "Conversation message is invalid");
    }
    const result = await options.service.postMessage({
      conversation_id: params.data.id,
      content: body.data.content,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
    if (!request.headers.accept?.includes("text/event-stream")) return result;
    const afterSequence = parseAfterSequence(request.headers["last-event-id"]);
    const events = options.events === undefined
      ? []
      : await options.events.listSseEvents(params.data.id, afterSequence);
    return reply
      .header("cache-control", "no-cache, no-transform")
      .header("connection", "keep-alive")
      .type("text/event-stream; charset=utf-8")
      .send(encodeSse(events));
  });
};
