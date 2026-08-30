import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type {
  CreatePrincipalSession,
  IssuedPrincipalSession,
  PrincipalSession,
  PrincipalSessionRepositoryPort,
  SanitizedPrincipal,
  VerifiedExternalIdentity,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection, TransactionClient } from "../../db/database.js";
import { principalAuthIdentities, principalLoginTransactions, principals, principalSessions } from "../../db/schema.js";
import { AuthCrypto, randomOpaqueToken, sha256Text } from "./crypto.js";
import type { PrincipalAuthRepositoryPort, StoredLoginTransaction } from "./service.js";

class SecretCipher {
  readonly #key: Buffer;
  constructor(secret: string) { this.#key = createHash("sha256").update(`bound-auth:${secret}`).digest(); }
  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  }
  decrypt(value: string): string {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) throw new Error("Invalid encrypted login transaction");
    const decipher = createDecipheriv("aes-256-gcm", this.#key, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
  }
}

function maskVerifiedEmail(email: string): string | undefined {
  const [local, domain, extra] = email.split("@");
  if (local === undefined || domain === undefined || extra !== undefined || local.length === 0 || domain.length === 0) return undefined;
  return `${local[0]}***@${domain}`.slice(0, 128);
}

export class PostgresPrincipalAuthRepository implements PrincipalAuthRepositoryPort, PrincipalSessionRepositoryPort {
  readonly #cipher: SecretCipher;
  constructor(private readonly database: DatabaseConnection, private readonly crypto: AuthCrypto, encryptionSecret: string) {
    this.#cipher = new SecretCipher(encryptionSecret);
  }

  async createLoginTransaction(input: { provider: string; state: string; nonce: string; codeVerifier: string; redirectPath: string; now: Date; expiresAt: Date }): Promise<void> {
    await this.database.db.insert(principalLoginTransactions).values({
      transactionId: randomUUID(), provider: input.provider, stateHash: sha256Text(input.state), nonceHash: sha256Text(input.nonce),
      pkceVerifierHash: sha256Text(input.codeVerifier),
      pkceVerifierCiphertext: this.#cipher.encrypt(JSON.stringify({ nonce: input.nonce, codeVerifier: input.codeVerifier })),
      redirectPath: input.redirectPath, expiresAt: input.expiresAt, createdAt: input.now,
    });
  }

  async consumeLoginTransaction(stateHash: string, now: Date): Promise<StoredLoginTransaction | undefined> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.update(principalLoginTransactions).set({ consumedAt: now }).where(and(
        eq(principalLoginTransactions.stateHash, stateHash), isNull(principalLoginTransactions.consumedAt), gt(principalLoginTransactions.expiresAt, now),
      )).returning())[0];
      if (row === undefined) return undefined;
      const secrets = JSON.parse(this.#cipher.decrypt(row.pkceVerifierCiphertext)) as { nonce?: unknown; codeVerifier?: unknown };
      if (typeof secrets.nonce !== "string" || typeof secrets.codeVerifier !== "string"
        || sha256Text(secrets.nonce) !== row.nonceHash || sha256Text(secrets.codeVerifier) !== row.pkceVerifierHash) throw new Error("Login transaction integrity check failed");
      return { transactionId: row.transactionId, provider: row.provider, nonce: secrets.nonce, codeVerifier: secrets.codeVerifier, redirectPath: row.redirectPath, expiresAt: row.expiresAt };
    });
  }

  async resolveExternalIdentity(identity: VerifiedExternalIdentity, now: Date): Promise<SanitizedPrincipal> {
    const subjectHash = sha256Text(identity.subject);
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${identity.issuer}:${subjectHash}`}))`);
      const existing = (await transaction.select({ principalId: principals.principalId, displayName: principals.displayName, identityId: principalAuthIdentities.identityId })
        .from(principalAuthIdentities).innerJoin(principals, eq(principalAuthIdentities.principalId, principals.principalId))
        .where(and(eq(principalAuthIdentities.issuer, identity.issuer), eq(principalAuthIdentities.subjectHash, subjectHash))))[0];
      if (existing !== undefined) {
        await transaction.update(principalAuthIdentities).set({ lastAuthenticatedAt: now, updatedAt: now }).where(eq(principalAuthIdentities.identityId, existing.identityId));
        return { principal_id: existing.principalId, display_name: existing.displayName };
      }
      const principal: SanitizedPrincipal = { principal_id: `principal_${randomUUID()}`, display_name: identity.displayName.slice(0, 128) };
      await transaction.insert(principals).values({ principalId: principal.principal_id, displayName: principal.display_name, createdAt: now, updatedAt: now });
      await transaction.insert(principalAuthIdentities).values({
        identityId: randomUUID(), principalId: principal.principal_id, provider: identity.provider, issuer: identity.issuer, subjectHash,
        ...(identity.verifiedEmail === undefined ? {} : { verifiedEmailHash: sha256Text(identity.verifiedEmail.toLowerCase()), maskedEmail: maskVerifiedEmail(identity.verifiedEmail) }),
        assurance: "OIDC", lastAuthenticatedAt: now, createdAt: now, updatedAt: now,
      });
      return principal;
    });
  }

  async ensureDemoPrincipal(now: Date): Promise<SanitizedPrincipal> {
    await this.database.db.insert(principals).values({ principalId: "principal_marta", displayName: "Marta", createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: principals.principalId, set: { displayName: "Marta", updatedAt: now } });
    return { principal_id: "principal_marta", display_name: "Marta" };
  }

  async #create(database: DatabaseClient | TransactionClient, input: CreatePrincipalSession): Promise<IssuedPrincipalSession> {
    const token = randomOpaqueToken();
    const csrfToken = this.crypto.csrfToken(token);
    const session: PrincipalSession = {
      sessionId: randomUUID(), principal: input.principal, tokenHash: sha256Text(token), csrfTokenHash: sha256Text(csrfToken), assurance: input.assurance,
      issuedAt: input.now, expiresAt: input.expiresAt,
    };
    await database.insert(principalSessions).values({
      sessionId: session.sessionId, principalId: input.principal.principal_id, tokenHash: session.tokenHash, csrfTokenHash: session.csrfTokenHash,
      authMethod: input.assurance === "DEMO" ? "demo" : "google", assurance: input.assurance, rotatedFromSessionId: input.rotatedFromSessionId,
      issuedAt: input.now, lastSeenAt: input.now, expiresAt: input.expiresAt,
    });
    return { session, token, csrfToken };
  }
  async create(input: CreatePrincipalSession): Promise<IssuedPrincipalSession> { return this.#create(this.database.db, input); }

  async getByTokenHash(tokenHash: string, now: Date): Promise<PrincipalSession | undefined> {
    const row = (await this.database.db.select({ session: principalSessions, displayName: principals.displayName })
      .from(principalSessions).innerJoin(principals, eq(principalSessions.principalId, principals.principalId))
      .where(and(eq(principalSessions.tokenHash, tokenHash), isNull(principalSessions.revokedAt), gt(principalSessions.expiresAt, now))))[0];
    if (row === undefined) return undefined;
    return { sessionId: row.session.sessionId, principal: { principal_id: row.session.principalId, display_name: row.displayName }, tokenHash: row.session.tokenHash,
      csrfTokenHash: row.session.csrfTokenHash, assurance: row.session.assurance === "DEMO" ? "DEMO" : "OIDC", issuedAt: row.session.issuedAt, expiresAt: row.session.expiresAt };
  }

  async rotate(sessionId: string, now: Date): Promise<IssuedPrincipalSession> {
    return this.database.transaction(async (transaction) => {
      const row = (await transaction.select({ session: principalSessions, displayName: principals.displayName }).from(principalSessions)
        .innerJoin(principals, eq(principalSessions.principalId, principals.principalId)).where(eq(principalSessions.sessionId, sessionId)))[0];
      if (row === undefined || row.session.revokedAt !== null || now >= row.session.expiresAt) throw new Error("Session is not active");
      await transaction.update(principalSessions).set({ revokedAt: now }).where(and(eq(principalSessions.sessionId, sessionId), isNull(principalSessions.revokedAt)));
      return this.#create(transaction, { principal: { principal_id: row.session.principalId, display_name: row.displayName }, assurance: row.session.assurance === "DEMO" ? "DEMO" : "OIDC", now, expiresAt: row.session.expiresAt, rotatedFromSessionId: sessionId });
    });
  }
  async revoke(sessionId: string, now: Date): Promise<void> {
    await this.database.db.update(principalSessions).set({ revokedAt: now }).where(and(eq(principalSessions.sessionId, sessionId), isNull(principalSessions.revokedAt)));
  }
}
