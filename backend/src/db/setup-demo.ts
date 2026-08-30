import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";
import { parse } from "dotenv";

import { createDatabase } from "./database.js";
import { configureLocalTravelBotEnvironment, LocalDemoConfigurationError } from "./local-demo-config.js";
import { migrateDatabase } from "./migrate.js";
import { loadEnv } from "../config/env.js";
import { canonicalizeJson, type AgentRegistration, type Es256PublicJwk } from "../contracts/v1/index.js";
import { agents, paymentCredentials, principals } from "./schema.js";
import { DrizzleAgentIdentityRegistry, loadAgentIdentity } from "../modules/identity/registry.js";

const backendDirectory = fileURLToPath(new URL("../..", import.meta.url));
const environmentPath = fileURLToPath(new URL("../../.env", import.meta.url));
const examplePath = fileURLToPath(new URL("../../.env.example", import.meta.url));

async function readEnvironment(): Promise<string> {
  try {
    return await readFile(environmentPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return readFile(examplePath, "utf8");
  }
}

async function persistEnvironment(content: string): Promise<void> {
  const temporaryPath = `${environmentPath}.setup-${process.pid}`;
  await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, environmentPath);
}

export async function seedLocalDemoDatabase(input: {
  databaseUrl: string;
  keyId: string;
  buildFingerprint: string;
  credentialId: string;
  publicJwk: Es256PublicJwk;
}): Promise<void> {
  await migrateDatabase(input.databaseUrl);
  const database = createDatabase({ connectionString: input.databaseUrl });
  const now = new Date();
  try {
    await database.db.insert(principals).values({
      principalId: "principal_jaguary_platform",
      displayName: "Jaguary Platform",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: principals.principalId,
      set: { displayName: "Jaguary Platform", updatedAt: now },
    });

    const registration: AgentRegistration = {
      agent_id: "agent_travelbot",
      principal_id: "principal_jaguary_platform",
      display_name: "TravelBot",
      status: "ACTIVE",
      build_fingerprint: input.buildFingerprint,
      verification_key: {
        key_id: input.keyId,
        algorithm: "ES256",
        public_jwk: input.publicJwk,
      },
    };
    const existingAgent = await loadAgentIdentity(database.db, registration.agent_id);
    if (existingAgent === undefined) {
      const registry = new DrizzleAgentIdentityRegistry(database, { now: () => now });
      await registry.register(registration, {
        correlationId: "corr_local_demo_setup",
        idempotencyKey: "idem_local_demo_agent_setup",
      });
    } else {
      const existingRegistration: AgentRegistration = {
        agent_id: existingAgent.agent_id,
        principal_id: existingAgent.principal_id,
        display_name: existingAgent.display_name,
        status: existingAgent.status,
        build_fingerprint: existingAgent.build_fingerprint,
        verification_key: existingAgent.verification_key,
      };
      if (canonicalizeJson(existingRegistration) !== canonicalizeJson(registration)) {
        throw new LocalDemoConfigurationError(
          "The registered local TravelBot does not match backend/.env; restore its original local keys or recreate the development database",
        );
      }
    }
    await database.db.update(agents)
      .set({ accessScope: "PUBLIC", updatedAt: now })
      .where(eq(agents.agentId, "agent_travelbot"));

    await database.db.insert(paymentCredentials).values({
      credentialId: input.credentialId,
      principalId: "principal_jaguary_platform",
      display: "Demo Visa •••• 4242",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  } finally {
    await database.close();
  }
}

async function main(): Promise<void> {
  const source = await readEnvironment();
  const configured = configureLocalTravelBotEnvironment(source);
  if (configured.generated) await persistEnvironment(configured.content);

  const environment = loadEnv({ ...process.env, ...parse(configured.content) });
  if (environment.NODE_ENV === "production") {
    throw new LocalDemoConfigurationError("Local demo setup is disabled in production");
  }
  await seedLocalDemoDatabase({
    databaseUrl: environment.DATABASE_URL,
    keyId: configured.material.TRAVELBOT_AGENT_KEY_ID,
    buildFingerprint: configured.material.TRAVELBOT_AGENT_BUILD_FINGERPRINT,
    credentialId: configured.material.TRAVELBOT_DEMO_CREDENTIAL_ID,
    publicJwk: configured.material.publicJwk,
  });

  process.stdout.write([
    `Local demo environment and database are ready in ${backendDirectory}.`,
    configured.generated
      ? "Generated local TravelBot signing and encryption material in backend/.env."
      : "Kept the existing complete local TravelBot material in backend/.env.",
    "Add OPENAI_API_KEY, OPENAI_MODEL, and SERPAPI_API_KEY to backend/.env manually for live chat and flights.",
    "Didit, Langfuse, and Yuno remain optional.",
    "Run pnpm dev from the repository root.",
    "",
  ].join("\n"));
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof LocalDemoConfigurationError
      ? error.message
      : "Local demo setup failed. Check Docker, PostgreSQL, and the sanitized environment configuration.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
