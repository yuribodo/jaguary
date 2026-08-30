import { randomUUID } from "node:crypto";

import type {
  CreatePrincipalSession,
  IssuedPrincipalSession,
  PrincipalSession,
  PrincipalSessionRepositoryPort,
  SanitizedPrincipal,
  VerifiedExternalIdentity,
} from "../../contracts/v1/index.js";
import { AuthCrypto, randomOpaqueToken, sha256Text } from "./crypto.js";
import type { PrincipalAuthRepositoryPort, StoredLoginTransaction } from "./service.js";

export class InMemoryPrincipalAuthStore implements PrincipalAuthRepositoryPort, PrincipalSessionRepositoryPort {
  readonly sessions = new Map<string, PrincipalSession>();
  readonly tokenHashes = new Set<string>();
  readonly #transactions = new Map<string, StoredLoginTransaction>();
  readonly #principals = new Map<string, SanitizedPrincipal>();
  readonly #identities = new Map<string, string>();
  constructor(private readonly crypto: AuthCrypto) {}

  async createLoginTransaction(input: { provider: string; state: string; nonce: string; codeVerifier: string; redirectPath: string; now: Date; expiresAt: Date }): Promise<void> {
    this.#transactions.set(sha256Text(input.state), {
      transactionId: randomUUID(), provider: input.provider, nonce: input.nonce, codeVerifier: input.codeVerifier,
      redirectPath: input.redirectPath, expiresAt: input.expiresAt,
    });
  }
  async consumeLoginTransaction(stateHash: string, now: Date): Promise<StoredLoginTransaction | undefined> {
    const transaction = this.#transactions.get(stateHash);
    this.#transactions.delete(stateHash);
    return transaction === undefined || now >= transaction.expiresAt ? undefined : transaction;
  }
  async resolveExternalIdentity(identity: VerifiedExternalIdentity): Promise<SanitizedPrincipal> {
    const key = `${identity.issuer}:${sha256Text(identity.subject)}`;
    const existingId = this.#identities.get(key);
    if (existingId !== undefined) return this.#principals.get(existingId)!;
    const principal = { principal_id: `principal_${randomUUID()}`, display_name: identity.displayName };
    this.#principals.set(principal.principal_id, principal);
    this.#identities.set(key, principal.principal_id);
    return principal;
  }
  async ensureDemoPrincipal(): Promise<SanitizedPrincipal> {
    const principal = { principal_id: "principal_marta", display_name: "Marta" };
    this.#principals.set(principal.principal_id, principal);
    return principal;
  }
  async create(input: CreatePrincipalSession): Promise<IssuedPrincipalSession> {
    const token = randomOpaqueToken();
    const csrfToken = this.crypto.csrfToken(token);
    const session: PrincipalSession = {
      sessionId: randomUUID(), principal: input.principal, tokenHash: sha256Text(token), csrfTokenHash: sha256Text(csrfToken),
      assurance: input.assurance, issuedAt: input.now, expiresAt: input.expiresAt,
    };
    this.sessions.set(session.sessionId, session);
    this.tokenHashes.add(session.tokenHash);
    return { session, token, csrfToken };
  }
  async getByTokenHash(tokenHash: string, now: Date): Promise<PrincipalSession | undefined> {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash && session.revokedAt === undefined && now < session.expiresAt);
  }
  async rotate(sessionId: string, now: Date): Promise<IssuedPrincipalSession> {
    const current = this.sessions.get(sessionId);
    if (current === undefined) throw new Error("Session not found");
    current.revokedAt = now;
    return this.create({ principal: current.principal, assurance: current.assurance, now, expiresAt: current.expiresAt, rotatedFromSessionId: sessionId });
  }
  async revoke(sessionId: string, now: Date): Promise<void> {
    const current = this.sessions.get(sessionId);
    if (current !== undefined) current.revokedAt = now;
  }
}
