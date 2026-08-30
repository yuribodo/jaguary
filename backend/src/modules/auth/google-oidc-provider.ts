import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";

import type {
  LoginAuthorization,
  LoginCallbackInput,
  LoginStartInput,
  PrincipalIdentityProviderPort,
  VerifiedExternalIdentity,
} from "../../contracts/v1/index.js";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}
export interface GoogleOidcPrincipalProviderOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
  now?: () => Date;
}

const GOOGLE_ENDPOINT_HOSTS = new Set(["accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com"]);

export class GoogleOidcPrincipalProvider implements PrincipalIdentityProviderPort {
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  #discovery?: Promise<Discovery>;
  constructor(private readonly options: GoogleOidcPrincipalProviderOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.requestTimeoutMs ?? 5_000;
  }

  async #getDiscovery(): Promise<Discovery> {
    this.#discovery ??= this.#loadDiscovery();
    return this.#discovery;
  }
  async #loadDiscovery(): Promise<Discovery> {
    try {
      const issuer = this.options.issuer.replace(/\/$/, "");
      const response = await this.#fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(this.#timeoutMs), headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("discovery response rejected");
      const value = await response.json() as Partial<Discovery>;
      if (value.issuer !== issuer) throw new Error("issuer mismatch");
      for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
        const candidate = value[field];
        if (typeof candidate !== "string") throw new Error("missing endpoint");
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || !GOOGLE_ENDPOINT_HOSTS.has(url.hostname)) throw new Error("unapproved endpoint");
      }
      return value as Discovery;
    } catch {
      this.#discovery = undefined;
      throw new Error("OIDC discovery validation failed");
    }
  }

  async createAuthorizationRequest(input: LoginStartInput): Promise<LoginAuthorization> {
    const discovery = await this.#getDiscovery();
    const url = new URL(discovery.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: input.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString() };
  }

  async verifyCallback(input: LoginCallbackInput): Promise<VerifiedExternalIdentity> {
    try {
      const discovery = await this.#getDiscovery();
      const response = await this.#fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: input.code,
          redirect_uri: input.callbackUrl,
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          code_verifier: input.codeVerifier,
        }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) throw new Error("token exchange rejected");
      const tokenResponse = await response.json() as Record<string, unknown>;
      if (typeof tokenResponse.id_token !== "string") throw new Error("missing id token");
      const jwksResponse = await this.#fetch(discovery.jwks_uri, { signal: AbortSignal.timeout(this.#timeoutMs), headers: { accept: "application/json" } });
      if (!jwksResponse.ok) throw new Error("jwks rejected");
      const jwks = await jwksResponse.json() as JSONWebKeySet;
      const verified = await jwtVerify(tokenResponse.id_token, createLocalJWKSet(jwks), {
        algorithms: ["RS256"],
        issuer: this.options.issuer.replace(/\/$/, ""),
        audience: this.options.clientId,
        currentDate: this.options.now?.() ?? new Date(),
      });
      const { payload } = verified;
      if (payload.nonce !== input.expectedNonce || typeof payload.sub !== "string" || payload.sub.length === 0) throw new Error("claims mismatch");
      const displayName = typeof payload.name === "string" && payload.name.trim().length > 0 ? payload.name.trim().slice(0, 128) : "Bound principal";
      return {
        provider: "google",
        issuer: discovery.issuer,
        subject: payload.sub,
        displayName,
        ...(payload.email_verified === true && typeof payload.email === "string" ? { verifiedEmail: payload.email } : {}),
        assurance: "OIDC",
      };
    } catch {
      throw new Error("OIDC callback validation failed");
    }
  }
}
