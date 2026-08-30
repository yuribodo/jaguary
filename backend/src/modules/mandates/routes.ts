import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  createMandateDraftInputSchema,
  identifierSchema,
  PublicApiError,
} from "../../contracts/v1/index.js";
import type { MandateService } from "./service.js";
import { readSessionCookie, type PrincipalAuthService } from "../auth/index.js";
import type { MandateBiometricConsentService } from "./biometric-consent.js";

interface MandateRoutesOptions {
  service: MandateService;
  biometricConsent?: MandateBiometricConsentService;
  auth?: PrincipalAuthService;
  allowedOrigin?: string;
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

async function mutablePrincipalSession(request: FastifyRequest, options: MandateRoutesOptions) {
  if (options.auth === undefined || options.allowedOrigin === undefined) throw new PublicApiError(404, "not_found", "Biometric consent is unavailable");
  if (request.headers.origin !== options.allowedOrigin) throw new PublicApiError(403, "invalid_request", "Request origin is not allowed");
  const csrf = request.headers["x-csrf-token"];
  return options.auth.requireSession(readSessionCookie(request.headers.cookie), typeof csrf === "string" ? csrf : "");
}

export const mandateRoutes: FastifyPluginAsync<MandateRoutesOptions> = async (app, options) => {
  if (options.biometricConsent !== undefined) {
    app.post<{ Params: { id: string } }>("/v1/mandates/:id/biometric-consent-sessions", async (request, reply) => {
      const mandateId = parseInput(identifierSchema, request.params.id);
      const body = parseInput(z.object({ consent: z.literal(true) }).strict(), request.body);
      const session = await mutablePrincipalSession(request, options);
      const result = await options.biometricConsent!.start(session, mandateId, {
        consent: body.consent,
        idempotencyKey: idempotencyKey(request.headers),
        correlationId: request.id,
      });
      return reply.code(201).send(result);
    });

    app.post<{ Params: { id: string; consentId: string } }>("/v1/mandates/:id/biometric-consent-sessions/:consentId/refresh", async (request) => {
      const mandateId = parseInput(identifierSchema, request.params.id);
      const consentId = parseInput(identifierSchema, request.params.consentId);
      parseInput(z.object({}).strict(), request.body ?? {});
      const session = await mutablePrincipalSession(request, options);
      const result = await options.biometricConsent!.refresh(session, consentId, request.id);
      if (result.mandate_id !== mandateId) throw new PublicApiError(404, "not_found", "Biometric consent not found");
      return result;
    });
  }

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
    return options.service.activate(mandateId, idempotencyKey(request.headers), request.id);
  });

  app.post<{ Params: { id: string } }>("/v1/mandates/:id/revoke", async (request) => {
    const mandateId = parseInput(identifierSchema, request.params.id);
    parseInput(z.object({}).strict(), request.body ?? {});
    return options.service.revoke(mandateId, idempotencyKey(request.headers), request.id);
  });
};
