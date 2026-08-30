import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import { PublicApiError } from "../../contracts/v1/index.js";
import { clearedSessionCookie, PrincipalAuthService, readSessionCookie, sessionCookie } from "./service.js";

export interface AuthRoutesOptions {
  service: PrincipalAuthService;
  mode: "demo" | "oidc";
  allowedOrigin: string;
  secureCookies: boolean;
  sessionTtlSeconds: number;
}

const rateWindows = new WeakMap<object, Map<string, { count: number; resetAt: number }>>();
function checkRateLimit(app: object, request: FastifyRequest, bucket: string): void {
  const now = Date.now();
  let windows = rateWindows.get(app);
  if (windows === undefined) { windows = new Map(); rateWindows.set(app, windows); }
  const key = `${bucket}:${request.ip}`;
  const current = windows.get(key);
  if (current === undefined || now >= current.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 10) throw new PublicApiError(429, "invalid_request", "Too many authentication attempts");
}

function requireOrigin(request: FastifyRequest, allowedOrigin: string): void {
  if (request.headers.origin !== allowedOrigin) {
    throw new PublicApiError(403, "invalid_request", "Request origin is not allowed");
  }
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  app.get("/auth/v1/login/:provider/start", {
    schema: {
      params: { type: "object", required: ["provider"], additionalProperties: false, properties: { provider: { type: "string", pattern: "^[a-z][a-z0-9_-]{1,31}$" } } },
      querystring: { type: "object", additionalProperties: false, properties: { return_to: { type: "string", maxLength: 256 } } },
    },
  }, async (request, reply) => {
    checkRateLimit(app, request, "login-start");
    const { provider } = request.params as { provider: string };
    const { return_to: returnTo } = request.query as { return_to?: string };
    const location = await options.service.start(provider, returnTo);
    return reply.code(302).header("location", location).send();
  });

  app.get("/auth/v1/login/:provider/callback", {
    schema: {
      params: { type: "object", required: ["provider"], additionalProperties: false, properties: { provider: { type: "string" } } },
      querystring: { type: "object", required: ["state", "code"], additionalProperties: false, properties: { state: { type: "string", minLength: 20, maxLength: 512 }, code: { type: "string", minLength: 1, maxLength: 4096 } } },
    },
  }, async (request, reply) => {
    checkRateLimit(app, request, "login-callback");
    const { provider } = request.params as { provider: string };
    const { state, code } = request.query as { state: string; code: string };
    const { issued, redirectPath } = await options.service.callback(provider, state, code);
    return reply.code(302)
      .header("set-cookie", sessionCookie(issued.token, options.secureCookies, options.sessionTtlSeconds))
      .header("location", new URL(redirectPath, options.allowedOrigin).toString())
      .send();
  });

  app.get("/auth/v1/session", async (request) => options.service.getSession(readSessionCookie(request.headers.cookie)));

  app.post("/auth/v1/logout", async (request, reply) => {
    checkRateLimit(app, request, "logout");
    requireOrigin(request, options.allowedOrigin);
    const csrf = request.headers["x-csrf-token"];
    await options.service.logout(readSessionCookie(request.headers.cookie), typeof csrf === "string" ? csrf : undefined);
    return reply.code(204).header("set-cookie", clearedSessionCookie).send();
  });

  if (options.mode === "demo") {
    app.post("/auth/v1/demo/session", async (request, reply) => {
      checkRateLimit(app, request, "demo-login");
      requireOrigin(request, options.allowedOrigin);
      const issued = await options.service.createDemoSession();
      const view = await options.service.getSession(issued.token);
      return reply.code(201)
        .header("set-cookie", sessionCookie(issued.token, options.secureCookies, options.sessionTtlSeconds))
        .send(view);
    });
  }
};
