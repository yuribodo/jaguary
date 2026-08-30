import { eq, inArray } from "drizzle-orm";

import { PublicApiError } from "../../contracts/v1/index.js";
import type { DatabaseConnection } from "../../db/database.js";
import { agentAttestationEvents, agentAttestations, mandateBiometricConsents } from "../../db/schema.js";

/**
 * Removes local provider references and event evidence after an attestation is
 * terminal. The append-only audit chain intentionally remains intact and
 * contains hashes/status only, so historical authorization evidence survives.
 */
export async function purgeTerminalAgentAttestationEvidence(database: DatabaseConnection, agentId: string): Promise<number> {
  return database.transaction(async (transaction) => {
    const rows = await transaction.select({ id: agentAttestations.attestationId, status: agentAttestations.status })
      .from(agentAttestations).where(eq(agentAttestations.agentId, agentId)).for("update");
    if (rows.some(({ status }) => status === "PENDING" || status === "VERIFIED")) {
      throw new PublicApiError(409, "invalid_request", "Active attestation evidence must be revoked or expired before deletion");
    }
    const ids = rows.map(({ id }) => id);
    if (ids.length === 0) return 0;
    await transaction.delete(mandateBiometricConsents).where(inArray(mandateBiometricConsents.onboardingAttestationId, ids));
    await transaction.delete(agentAttestationEvents).where(inArray(agentAttestationEvents.attestationId, ids));
    await transaction.delete(agentAttestations).where(inArray(agentAttestations.attestationId, ids));
    return ids.length;
  });
}
