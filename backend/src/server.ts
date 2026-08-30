import "dotenv/config";
import "fastify";

import { buildApp } from "./build-app.js";
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
    enableDevelopmentTravelWatchSimulation: env.NODE_ENV === "development",
    principalAuth: {
      mode: env.auth.mode,
      nodeEnvironment: env.NODE_ENV,
      allowedOrigin: env.CORS_ORIGIN,
      secureCookies: !["localhost", "127.0.0.1", "::1"].includes(new URL(env.CORS_ORIGIN).hostname),
      sessionTtlSeconds: env.auth.sessionTtlSeconds,
      loginTransactionTtlSeconds: env.auth.loginTransactionTtlSeconds,
      ...(env.auth.mode === "oidc" ? {
        issuer: env.auth.issuer,
        clientId: env.auth.clientId,
        clientSecret: env.auth.clientSecret,
        callbackUrl: env.auth.callbackUrl,
      } : {}),
    },
    agentTrust: {
      mode: env.kya.mode,
      provider: env.kya.provider,
      requestTimeoutMs: env.kya.requestTimeoutMs,
      attestationTtlSeconds: env.kya.attestationTtlSeconds,
      callbackUrl: new URL("/trust/callback", env.CORS_ORIGIN).toString(),
      passportIssuer: new URL(env.auth.mode === "oidc" ? env.auth.callbackUrl : `http://localhost:${env.PORT}`).origin,
      ...(env.kya.baseUrl === undefined ? {} : { baseUrl: env.kya.baseUrl }),
      ...(env.kya.apiKey === undefined ? {} : { apiKey: env.kya.apiKey }),
      ...(env.kya.workflowId === undefined ? {} : { workflowId: env.kya.workflowId }),
      ...(env.kya.biometricWorkflowId === undefined ? {} : {
        biometricWorkflowId: env.kya.biometricWorkflowId,
        biometricCallbackUrl: new URL("/biometric-callback", env.CORS_ORIGIN).toString(),
      }),
      ...(env.kya.webhookSecret === undefined ? {} : { webhookSecret: env.kya.webhookSecret }),
    },
    ...(env.openai.enabled && env.travelbot.enabled ? {
      openAI: {
        apiKey: env.openai.apiKey,
        model: env.openai.model,
        requestTimeoutMs: env.openai.requestTimeoutMs,
        realtimeModel: env.openai.realtimeModel,
        transcriptionModel: env.openai.transcriptionModel,
        voice: env.openai.voice,
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
