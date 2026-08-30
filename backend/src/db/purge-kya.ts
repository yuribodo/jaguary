import "dotenv/config";

import { loadEnv } from "../config/env.js";
import { createDatabase } from "./database.js";
import { purgeTerminalAgentAttestationEvidence } from "../modules/trust/retention.js";

const flag = process.argv.indexOf("--agent-id");
const agentId = flag >= 0 ? process.argv[flag + 1] : undefined;
if (agentId === undefined || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(agentId)) {
  process.stderr.write("Usage: pnpm --filter @bound/backend db:kya:purge -- --agent-id <agent_id>\n");
  process.exitCode = 2;
} else {
  const env = loadEnv();
  const database = createDatabase({ connectionString: env.DATABASE_URL });
  try {
    const removed = await purgeTerminalAgentAttestationEvidence(database, agentId);
    process.stdout.write(`Removed ${removed} terminal attestation evidence record(s). Append-only audit hashes were retained.\n`);
  } finally {
    await database.close();
  }
}
