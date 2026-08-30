import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { correlationIdSchema, identifierSchema, PublicApiError } from "../../contracts/v1/index.js";
import { readSessionCookie, type PrincipalAuthService } from "../auth/index.js";
import type { TravelBotService } from "./service.js";
import type { VoiceSessionIssuerPort } from "./voice.js";

const internalCreateConversationBodySchema = z.object({
  principal_id: identifierSchema,
  agent_id: identifierSchema,
}).strict();

const authenticatedCreateConversationBodySchema = z.object({
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
  service: Pick<TravelBotService, "createConversation" | "discardConversation" | "getConversation" | "postMessage">;
  events?: TravelBotEventSource;
  auth?: PrincipalAuthService;
  allowedOrigin?: string;
  voice?: VoiceSessionIssuerPort;
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

async function mutablePrincipalSession(request: FastifyRequest, options: TravelBotRoutesOptions) {
  if (options.auth === undefined || options.allowedOrigin === undefined) {
    throw new PublicApiError(404, "not_found", "Authenticated conversation mutation is unavailable");
  }
  if (request.headers.origin !== options.allowedOrigin) {
    throw new PublicApiError(403, "invalid_request", "Request origin is not allowed");
  }
  const csrf = request.headers["x-csrf-token"];
  return options.auth.requireSession(
    readSessionCookie(request.headers.cookie),
    typeof csrf === "string" ? csrf : "",
  );
}

async function readPrincipalSession(request: FastifyRequest, options: TravelBotRoutesOptions) {
  if (options.auth === undefined) return undefined;
  return options.auth.requireSession(readSessionCookie(request.headers.cookie));
}

async function ownedConversation(
  request: FastifyRequest,
  options: TravelBotRoutesOptions,
  conversationId: string,
  mutable: boolean,
) {
  const session = mutable
    ? await mutablePrincipalSession(request, options)
    : await readPrincipalSession(request, options);
  const conversation = await options.service.getConversation(conversationId);
  if (session !== undefined && conversation.principal_id !== session.principal.principal_id) {
    throw new PublicApiError(404, "not_found", "Conversation not found");
  }
  return conversation;
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
    const parsed = options.auth === undefined
      ? internalCreateConversationBodySchema.safeParse(request.body)
      : authenticatedCreateConversationBodySchema.safeParse(request.body);
    if (!parsed.success) throw new PublicApiError(400, "validation_error", "Conversation request is invalid");
    const principalId = options.auth === undefined
      ? (parsed.data as z.infer<typeof internalCreateConversationBodySchema>).principal_id
      : (await mutablePrincipalSession(request, options)).principal.principal_id;
    const result = await options.service.createConversation({
      ...parsed.data,
      principal_id: principalId,
      idempotency_key: idempotencyKey(request.headers),
      correlation_id: request.id,
    });
    return reply.status(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/v1/conversations/:id", async (request) => {
    const parsed = conversationParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new PublicApiError(404, "not_found", "Conversation not found");
    return ownedConversation(request, options, parsed.data.id, false);
  });

  app.delete<{ Params: { id: string } }>("/v1/conversations/:id", async (request, reply) => {
    requireCorrelationId(request.headers);
    const parsed = conversationParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new PublicApiError(404, "not_found", "Conversation not found");
    const session = await mutablePrincipalSession(request, options);
    await options.service.discardConversation(parsed.data.id, session.principal.principal_id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/v1/conversations/:id/voice-sessions", async (request, reply) => {
    requireCorrelationId(request.headers);
    const params = conversationParamsSchema.safeParse(request.params);
    if (!params.success || options.voice === undefined) {
      throw new PublicApiError(404, "not_found", "Voice mode is unavailable");
    }
    const session = await mutablePrincipalSession(request, options);
    const conversation = await options.service.getConversation(params.data.id);
    if (conversation.principal_id !== session.principal.principal_id) {
      throw new PublicApiError(404, "not_found", "Conversation not found");
    }
    const secret = await options.voice.createClientSecret(session.principal.principal_id);
    return reply.header("cache-control", "no-store").status(201).send(secret);
  });

  app.post<{ Params: { id: string } }>("/v1/conversations/:id/messages", async (request, reply) => {
    requireCorrelationId(request.headers);
    const params = conversationParamsSchema.safeParse(request.params);
    const body = postMessageBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new PublicApiError(400, "validation_error", "Conversation message is invalid");
    }
    if (options.auth !== undefined) await ownedConversation(request, options, params.data.id, true);
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
