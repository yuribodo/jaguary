import type { DatabaseConnection } from "../../db/database.js";
import {
  authorizations,
  checkouts,
  mandates,
  nonces,
  orders,
  payments,
  travelApprovals,
  travelConversations,
  travelIntentSnapshots,
  travelMessages,
  travelModelRuns,
  travelSseEvents,
  travelToolExecutions,
} from "../../db/schema.js";

/**
 * BE-12 local demo hook. It clears transactional/chat state while preserving
 * the registered demo identity and its vault-backed credential reference.
 */
export async function resetLocalDemoTransactions(database: DatabaseConnection): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.delete(travelApprovals);
    await transaction.delete(travelToolExecutions);
    await transaction.delete(travelSseEvents);
    await transaction.delete(travelIntentSnapshots);
    await transaction.delete(travelModelRuns);
    await transaction.delete(travelMessages);
    await transaction.delete(travelConversations);
    await transaction.delete(orders);
    await transaction.delete(payments);
    await transaction.delete(authorizations);
    await transaction.delete(nonces);
    await transaction.delete(checkouts);
    await transaction.delete(mandates);
    // The append-only audit ledger is intentionally retained.
  });
}
