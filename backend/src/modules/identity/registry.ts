import { eq } from "drizzle-orm";

import {
  agentIdentitySchema,
  agentRegistrationSchema,
  canonicalizeJson,
  PublicApiError,
  type AgentIdentity,
  type AgentIdentityRegistryPort,
  type AgentRegistration,
  type AgentRegistrationContext,
  type AgentRegistrationResult,
  type ClockPort,
  type Es256PublicJwk,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection } from "../../db/database.js";
import { agents } from "../../db/schema.js";
import {
  AuditLedgerService,
  PostgresAuditEventRepository,
  type AuditLedgerPort,
} from "../ledger/index.js";

type AgentRow = typeof agents.$inferSelect;

function deserializeJwk(serialized: string): Es256PublicJwk {
  try {
    return JSON.parse(serialized) as Es256PublicJwk;
  } catch {
    throw new Error("Stored agent public JWK is not valid JSON");
  }
}

function toIdentity(row: AgentRow): AgentIdentity {
  return agentIdentitySchema.parse({
    agent_id: row.agentId,
    principal_id: row.principalId,
    display_name: row.displayName,
    status: row.status,
    build_fingerprint: row.buildFingerprint,
    verification_key: {
      key_id: row.verificationKeyId,
      algorithm: row.verificationAlgorithm,
      public_jwk: deserializeJwk(row.verificationPublicKey),
    },
    created_at: row.createdAt.toISOString(),
  });
}

export async function loadAgentIdentity(
  database: DatabaseClient,
  agentId: string,
): Promise<AgentIdentity | undefined> {
  const rows = await database
    .select()
    .from(agents)
    .where(eq(agents.agentId, agentId))
    .limit(1);
  return rows[0] === undefined ? undefined : toIdentity(rows[0]);
}

function matchesRegistration(identity: AgentIdentity, registration: AgentRegistration): boolean {
  const storedRegistration: AgentRegistration = {
    agent_id: identity.agent_id,
    principal_id: identity.principal_id,
    display_name: identity.display_name,
    status: identity.status,
    build_fingerprint: identity.build_fingerprint,
    verification_key: identity.verification_key,
  };
  return canonicalizeJson(storedRegistration) === canonicalizeJson(registration);
}

export class DrizzleAgentIdentityRegistry implements AgentIdentityRegistryPort {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly clock: ClockPort,
    private readonly ledger: AuditLedgerPort = new AuditLedgerService(
      new PostgresAuditEventRepository(database.db),
    ),
  ) {}

  async register(
    input: AgentRegistration,
    context: AgentRegistrationContext,
  ): Promise<AgentRegistrationResult> {
    const parsed = agentRegistrationSchema.safeParse(input);
    if (!parsed.success) {
      throw new PublicApiError(400, "validation_error", "Agent registration is invalid");
    }
    const registration = parsed.data;
    const createdAt = this.clock.now();
    return this.database.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(agents)
        .values({
          agentId: registration.agent_id,
          principalId: registration.principal_id,
          displayName: registration.display_name,
          status: registration.status,
          buildFingerprint: registration.build_fingerprint,
          verificationKeyId: registration.verification_key.key_id,
          verificationAlgorithm: registration.verification_key.algorithm,
          verificationPublicKey: canonicalizeJson(registration.verification_key.public_jwk),
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0] !== undefined) {
        await this.ledger.append(transaction, {
          correlationId: context.correlationId,
          eventType: "agent.registered",
          subjectId: registration.agent_id,
          payload: {
            agent_id: registration.agent_id,
            principal_id: registration.principal_id,
            status: registration.status,
            build_fingerprint: registration.build_fingerprint,
            key_id: registration.verification_key.key_id,
            registered_at: createdAt.toISOString(),
          },
          recordedAt: createdAt,
        });
        return { agent: toIdentity(inserted[0]), created: true };
      }

      const [idempotentRows, agentRows] = await Promise.all([
        transaction.select().from(agents).where(eq(agents.idempotencyKey, context.idempotencyKey)).limit(1),
        transaction.select().from(agents).where(eq(agents.agentId, registration.agent_id)).limit(1),
      ]);
      const idempotentRow = idempotentRows[0];
      if (idempotentRow !== undefined) {
        const existing = toIdentity(idempotentRow);
        if (matchesRegistration(existing, registration)) {
          return { agent: existing, created: false };
        }
        throw new PublicApiError(
          409,
          "idempotency_conflict",
          "Idempotency-Key was already used for another agent registration",
        );
      }

      if (agentRows[0] !== undefined) {
        throw new PublicApiError(409, "invalid_request", "Agent ID is already registered");
      }
      throw new PublicApiError(409, "invalid_request", "Agent key ID is already registered");
    });
  }

  async get(agentId: string): Promise<AgentIdentity | undefined> {
    return loadAgentIdentity(this.database.db, agentId);
  }
}
