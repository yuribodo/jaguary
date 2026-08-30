import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { correlationIdSchema, PublicApiError } from "../../contracts/v1/index.js";
import { readSessionCookie, sessionCookie, type PrincipalAuthService } from "../auth/index.js";
import type { AgentTrustService } from "./service.js";

export interface TrustRoutesOptions { service: AgentTrustService; auth: PrincipalAuthService; allowedOrigin: string; secureCookies: boolean; sessionTtlSeconds: number }
const rateWindows = new WeakMap<object, Map<string, { count: number; resetAt: number }>>();
function rateLimit(app: object, request: FastifyRequest, bucket: string, maximum = 10): void {
  const now = Date.now();
  let windows = rateWindows.get(app);
  if (windows === undefined) { windows = new Map(); rateWindows.set(app, windows); }
  const key = `${bucket}:${request.ip}`;
  const current = windows.get(key);
  if (current === undefined || now >= current.resetAt) { windows.set(key, { count: 1, resetAt: now + 60_000 }); return; }
  current.count += 1;
  if (current.count > maximum) throw new PublicApiError(429, "invalid_request", "Too many trust requests");
}
function origin(request: FastifyRequest, allowed: string) { if (request.headers.origin !== allowed) throw new PublicApiError(403, "invalid_request", "Request origin is not allowed"); }
function correlation(request: FastifyRequest): string { const value = request.headers["x-correlation-id"]; if (typeof value !== "string" || !correlationIdSchema.safeParse(value).success) throw new PublicApiError(400, "invalid_request", "A valid X-Correlation-Id is required"); return value; }
function idempotency(request: FastifyRequest): string { const value = request.headers["idempotency-key"]; if (typeof value !== "string") throw new Error("HTTP convention did not validate Idempotency-Key"); return value; }
async function mutableSession(request: FastifyRequest, options: TrustRoutesOptions) { origin(request, options.allowedOrigin); const csrf = request.headers["x-csrf-token"]; return options.auth.requireSession(readSessionCookie(request.headers.cookie), typeof csrf === "string" ? csrf : ""); }
async function readSession(request: FastifyRequest, options: TrustRoutesOptions) { return options.auth.requireSession(readSessionCookie(request.headers.cookie)); }

export const trustRoutes: FastifyPluginAsync<TrustRoutesOptions> = async (app, options) => {
  app.post("/trust/v1/agents/:agentId/attestation-sessions", {
    schema: { params: { type: "object", required: ["agentId"], additionalProperties: false, properties: { agentId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" } } }, body: { type: "object", required: ["consent"], additionalProperties: false, properties: { consent: { const: true } } } },
  }, async (request, reply) => {
    rateLimit(app, request, "attestation-start");
    const session = await mutableSession(request, options); const { agentId } = request.params as { agentId: string };
    const result = await options.service.start(session, agentId, { consent: (request.body as { consent: boolean }).consent, idempotencyKey: idempotency(request), correlationId: correlation(request) });
    if (result.status === "VERIFIED") {
      const rotated = await options.auth.rotateSession(session.sessionId);
      void reply.header("set-cookie", sessionCookie(rotated.token, options.secureCookies, options.sessionTtlSeconds));
    }
    return reply.code(201).send(result);
  });
  app.get("/trust/v1/agents/:agentId/assurance", async (request) => options.service.assurance(await readSession(request, options), (request.params as { agentId: string }).agentId));
  app.post("/trust/v1/agents/:agentId/attestations/refresh", async (request, reply) => {
    rateLimit(app, request, "attestation-refresh", 20);
    const session = await mutableSession(request, options);
    const result = await options.service.refresh(session, (request.params as { agentId: string }).agentId, correlation(request));
    if (result.attestation_status === "VERIFIED") {
      const rotated = await options.auth.rotateSession(session.sessionId);
      void reply.header("set-cookie", sessionCookie(rotated.token, options.secureCookies, options.sessionTtlSeconds));
    }
    return result;
  });
  app.post("/trust/v1/attestations/webhooks/:provider", async (request) => {
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers[key] = value;
    return options.service.webhook((request.params as { provider: string }).provider, JSON.stringify(request.body ?? {}), headers, request.id);
  });
  app.get("/trust/v1/agents/:agentId/passport", async (request) => {
    rateLimit(app, request, "passport", 30);
    return options.service.passport(await readSession(request, options), (request.params as { agentId: string }).agentId, request.id);
  });
  app.get("/trust/v1/passports/.well-known/jwks.json", async () => options.service.jwks());
  app.post("/trust/v1/passports/verify", {
    schema: { body: { type: "object", required: ["passport", "audience"], additionalProperties: false, properties: { passport: { type: "string", minLength: 64, maxLength: 8192 }, audience: { type: "string", minLength: 1, maxLength: 128 } } } },
  }, async (request) => ({ valid: true, claims: await options.service.verifyPassport((request.body as { passport: string; audience: string }).passport, (request.body as { passport: string; audience: string }).audience, request.id) }));
};
