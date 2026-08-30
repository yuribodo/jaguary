import { timingSafeEqual } from "node:crypto";

import {
  PublicApiError,
  principalSessionViewSchema,
  type PrincipalIdentityProviderPort,
  type PrincipalSessionRepositoryPort,
  type PrincipalSessionView,
  type SanitizedPrincipal,
  type VerifiedExternalIdentity,
} from "../../contracts/v1/index.js";
import { AuthCrypto, randomOpaqueToken, sha256Text } from "./crypto.js";
import type { DemoPrincipalAuthProvider } from "./demo-provider.js";

export interface StoredLoginTransaction {
  transactionId: string;
  provider: string;
  nonce: string;
  codeVerifier: string;
  redirectPath: string;
  expiresAt: Date;
}
export interface PrincipalAuthRepositoryPort {
  createLoginTransaction(input: {
    provider: string; state: string; nonce: string; codeVerifier: string; redirectPath: string; now: Date; expiresAt: Date;
  }): Promise<void>;
  consumeLoginTransaction(stateHash: string, now: Date): Promise<StoredLoginTransaction | undefined>;
  resolveExternalIdentity(identity: VerifiedExternalIdentity, now: Date): Promise<SanitizedPrincipal>;
  ensureDemoPrincipal(now: Date): Promise<SanitizedPrincipal>;
}

export interface AuthServiceOptions {
  mode: "demo" | "oidc";
  providers: Record<string, PrincipalIdentityProviderPort>;
  authRepository: PrincipalAuthRepositoryPort;
  sessions: PrincipalSessionRepositoryPort;
  crypto: AuthCrypto;
  clock: { now(): Date };
  callbackUrl: string;
  sessionTtlSeconds: number;
  loginTransactionTtlSeconds: number;
  allowedRedirectPaths?: readonly string[];
  demoProvider?: DemoPrincipalAuthProvider;
}

export class PrincipalAuthService {
  readonly #allowedRedirectPaths: Set<string>;
  constructor(private readonly options: AuthServiceOptions) {
    this.#allowedRedirectPaths = new Set(options.allowedRedirectPaths ?? ["/", "/auth/callback", "/trust"]);
  }

  async start(providerName: string, redirectPath = "/auth/callback"): Promise<string> {
    const provider = this.options.providers[providerName];
    if (provider === undefined) throw new PublicApiError(404, "not_found", "Login provider is unavailable");
    if (!this.#allowedRedirectPaths.has(redirectPath)) {
      throw new PublicApiError(400, "invalid_request", "Login redirect is not allowlisted");
    }
    const state = randomOpaqueToken();
    const nonce = randomOpaqueToken();
    const codeVerifier = randomOpaqueToken(48);
    const codeChallenge = Buffer.from(sha256Text(codeVerifier), "hex").toString("base64url");
    const now = this.options.clock.now();
    await this.options.authRepository.createLoginTransaction({
      provider: providerName,
      state,
      nonce,
      codeVerifier,
      redirectPath,
      now,
      expiresAt: new Date(now.getTime() + this.options.loginTransactionTtlSeconds * 1000),
    });
    return (await provider.createAuthorizationRequest({
      state, nonce, codeChallenge, callbackUrl: this.options.callbackUrl,
    })).url;
  }

  async callback(providerName: string, state: string, code: string) {
    const transaction = await this.options.authRepository.consumeLoginTransaction(sha256Text(state), this.options.clock.now());
    if (transaction === undefined || transaction.provider !== providerName) {
      throw new PublicApiError(400, "invalid_request", "Login transaction is invalid or expired");
    }
    const provider = this.options.providers[providerName];
    if (provider === undefined) throw new PublicApiError(404, "not_found", "Login provider is unavailable");
    const identity = await provider.verifyCallback({
      code,
      codeVerifier: transaction.codeVerifier,
      expectedNonce: transaction.nonce,
      callbackUrl: this.options.callbackUrl,
    });
    const now = this.options.clock.now();
    const principal = await this.options.authRepository.resolveExternalIdentity(identity, now);
    const issued = await this.options.sessions.create({
      principal, assurance: "OIDC", now,
      expiresAt: new Date(now.getTime() + this.options.sessionTtlSeconds * 1000),
    });
    return { issued, redirectPath: transaction.redirectPath };
  }

  async createDemoSession() {
    if (this.options.mode !== "demo" || this.options.demoProvider === undefined) throw new PublicApiError(404, "not_found", "Demo authentication is unavailable");
    const now = this.options.clock.now();
    const principal = await this.options.demoProvider.authenticate(this.options.authRepository, now);
    return this.options.sessions.create({
      principal, assurance: "DEMO", now,
      expiresAt: new Date(now.getTime() + this.options.sessionTtlSeconds * 1000),
    });
  }

  async getSession(token: string | undefined): Promise<PrincipalSessionView> {
    if (token === undefined) return { authenticated: false };
    const session = await this.options.sessions.getByTokenHash(sha256Text(token), this.options.clock.now());
    if (session === undefined) return { authenticated: false };
    const csrfToken = this.options.crypto.csrfToken(token);
    if (!safeEqual(sha256Text(csrfToken), session.csrfTokenHash)) return { authenticated: false };
    return principalSessionViewSchema.parse({
      authenticated: true,
      principal: session.principal,
      assurance: session.assurance,
      demo: session.assurance === "DEMO",
      csrf_token: csrfToken,
      expires_at: session.expiresAt.toISOString(),
    });
  }

  async requireSession(token: string | undefined, csrfToken?: string) {
    if (token === undefined) throw new PublicApiError(401, "invalid_request", "Authentication is required");
    const session = await this.options.sessions.getByTokenHash(sha256Text(token), this.options.clock.now());
    if (session === undefined) throw new PublicApiError(401, "invalid_request", "Authentication is required");
    if (csrfToken !== undefined && !safeEqual(sha256Text(csrfToken), session.csrfTokenHash)) {
      throw new PublicApiError(403, "invalid_request", "CSRF validation failed");
    }
    return session;
  }

  async logout(token: string | undefined, csrfToken: string | undefined): Promise<void> {
    const session = await this.requireSession(token, csrfToken ?? "");
    await this.options.sessions.revoke(session.sessionId, this.options.clock.now());
  }

  async rotateSession(sessionId: string) {
    return this.options.sessions.rotate(sessionId, this.options.clock.now());
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookie(token: string, secure: boolean, maxAgeSeconds: number): string {
  return [`bound_session=${encodeURIComponent(token)}`, "Path=/", `Max-Age=${maxAgeSeconds}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}
export const clearedSessionCookie = "bound_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  const match = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith("bound_session="));
  if (match === undefined) return undefined;
  try { return decodeURIComponent(match.slice("bound_session=".length)); } catch { return undefined; }
}
