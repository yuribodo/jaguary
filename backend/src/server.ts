import "dotenv/config";

import { buildApp } from "./app.js";
import { ConfigurationError, loadEnv } from "./config/env.js";
import {
  Aes256GcmApprovalStateProtector,
  Es256AgentProofFactory,
  LangfuseTelemetryAdapter,
  NoopLlmTelemetry,
} from "./modules/travelbot/index.js";
import {
  GoogleFlightsSearchProvider,
  UnavailableFlightSearchProvider,
  VuelaYaCatalog,
} from "./modules/vuelaya/index.js";

async function start(): Promise<void> {
  const env = loadEnv();
  const telemetry = env.langfuse.enabled
    ? new LangfuseTelemetryAdapter({
      publicKey: env.langfuse.publicKey,
      secretKey: env.langfuse.secretKey,
      baseUrl: env.langfuse.baseUrl,
      environment: env.NODE_ENV,
      ...(env.RELEASE === undefined ? {} : { release: env.RELEASE }),
    })
    : new NoopLlmTelemetry();
  const runtimeClock = { now: () => new Date() };
  const flightProvider = env.flightSearch.enabled
    ? new GoogleFlightsSearchProvider({
      apiKey: env.flightSearch.apiKey,
      timeoutMs: env.flightSearch.timeoutMs,
      deepSearch: env.flightSearch.deepSearch,
      clock: runtimeClock,
    })
    : new UnavailableFlightSearchProvider();
  const app = await buildApp({
    corsOrigin: env.CORS_ORIGIN,
    databaseUrl: env.DATABASE_URL,
    logger: { level: env.LOG_LEVEL },
    llmTelemetry: telemetry,
    clock: runtimeClock,
    flightCatalog: new VuelaYaCatalog(flightProvider, [], {
      clock: runtimeClock,
      ttlMs: 5 * 60_000,
      maxEntries: 100,
    }),
    ...(env.openai.enabled && env.travelbot.enabled ? {
      openAI: {
        apiKey: env.openai.apiKey,
        model: env.openai.model,
        requestTimeoutMs: env.openai.requestTimeoutMs,
      },
      travelBotProofFactory: new Es256AgentProofFactory({
        privateJwk: env.travelbot.privateJwk,
        keyId: env.travelbot.keyId,
        buildFingerprint: env.travelbot.buildFingerprint,
      }),
      travelBotCredentialId: env.travelbot.credentialId,
      travelBotApprovalStateProtector: new Aes256GcmApprovalStateProtector(
        env.travelbot.approvalEncryptionKey,
      ),
    } : {}),
  });

  async function shutdown(signal: NodeJS.Signals) {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: env.HOST, port: env.PORT });
}

start().catch((error: unknown) => {
  const message = error instanceof ConfigurationError
    ? error.message
    : "Server startup failed. Check database availability and sanitized configuration.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
