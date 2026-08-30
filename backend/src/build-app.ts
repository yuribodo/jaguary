import cors from "@fastify/cors";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";

import {
  canonicalizeJson,
  type AgentIdentityRegistryPort,
  type AgentRequestVerifierPort,
  type ClockPort,
  type PaymentExecutor,
  type PrincipalIdentityProviderPort,
  type SignerPort,
} from "./contracts/v1/index.js";
import { createDatabase, type DatabaseConnection } from "./db/database.js";
import { configureHttpConventions, generateCorrelationId } from "./http/conventions.js";
import { DrizzleAgentIdentityRegistry } from "./modules/identity/registry.js";
import { agentIdentityRoutes } from "./modules/identity/routes.js";
import { AgentRequestVerifier } from "./modules/identity/verifier.js";
import {
  auditRoutes,
  AuditLedgerService,
  PostgresAuditEventRepository,
  PostgresReceiptStore,
} from "./modules/ledger/index.js";
import {
  mandateRoutes,
  MandateBiometricConsentService,
  MandateService,
  type MandateBiometricConsentGate,
} from "./modules/mandates/index.js";
import {
  FakePaymentExecutor,
  PostgresPaymentClaimStore,
  PaymentService,
  paymentRoutes,
  type PaymentHandler,
} from "./modules/payments/index.js";
import {
  PostgresAuthorizationReservationStore,
  VerifyOrchestrator,
  verifyRoutes,
  type VerifyHandler,
  type VerifyRequestBody,
} from "./modules/verify/index.js";
import { verifyCheckoutIntegrity, VuelaYaMerchant } from "./modules/vuelaya/merchant.js";
import { vuelaYaRoutes } from "./modules/vuelaya/routes.js";
import { EphemeralEs256Signer } from "./modules/vuelaya/signer.js";
import { healthRoutes } from "./routes/health.js";
import { rootRoutes } from "./routes/root.js";
import {
  ApplicationTravelBotTools,
  ApplicationTravelWatchPurchases,
  NoopLlmTelemetry,
  OpenAIAgentsRuntime,
  OpenAIRealtimeVoiceSessionIssuer,
  PostgresTravelBotRepository,
  PostgresTravelWatchRepository,
  StateGuardedAgentToolExecutor,
  TravelBotService,
  TravelWatchService,
  DevelopmentTravelWatchSimulator,
  TravelWatchWorker,
  UnavailableAgentRuntime,
  travelBotRoutes,
  travelWatchRoutes,
  type AgentProofFactoryPort,
  type ApprovalStateProtectorPort,
  type LlmTelemetryPort,
  type TravelBotEventSource,
  type TravelWatchSimulatorPort,
  type VoiceSessionIssuerPort,
} from "./modules/travelbot/index.js";
import { VuelaYaCatalog, type VuelaYaCatalogPort } from "./modules/vuelaya/catalog.js";
import {
  AuthCrypto,
  authRoutes,
  GoogleOidcPrincipalProvider,
  PostgresPrincipalAuthRepository,
  PrincipalAuthService,
  DemoPrincipalAuthProvider,
} from "./modules/auth/index.js";
import {
  AgentTrustService,
  BoundAgentPassportService,
  DeterministicFakeAttestationProvider,
  DiditAgentAttestationProvider,
  PostgresAgentTrustRepository,
  trustRoutes,
} from "./modules/trust/index.js";

export interface BuildAppOptions {
  corsOrigin?: string;
  clock?: ClockPort;
  databaseUrl?: string;
  database?: DatabaseConnection;
  agentRegistry?: AgentIdentityRegistryPort;
  agentVerifier?: AgentRequestVerifierPort;
  logger?: FastifyServerOptions["logger"];
  signer?: SignerPort;
  paymentExecutor?: PaymentExecutor;
  paymentService?: PaymentHandler;
  verifyOrchestrator?: VerifyHandler;
  humanApprovalRequired?: (input: VerifyRequestBody) => boolean;
  travelBotService?: TravelBotService;
  travelBotEvents?: TravelBotEventSource;
  travelWatchService?: TravelWatchService;
  travelWatchSimulator?: TravelWatchSimulatorPort;
  enableDevelopmentTravelWatchSimulation?: boolean;
  travelWatchPollMs?: number;
  openAI?: {
    apiKey: string;
    model: string;
    requestTimeoutMs: number;
    realtimeModel: string;
    transcriptionModel: string;
    voice: "marin" | "cedar";
  };
  voiceSessionIssuer?: VoiceSessionIssuerPort;
  travelBotProofFactory?: AgentProofFactoryPort;
  travelBotCredentialId?: string;
  travelBotApprovalStateProtector?: ApprovalStateProtectorPort;
  llmTelemetry?: LlmTelemetryPort;
  flightCatalog?: VuelaYaCatalogPort;
  auth?: {
    service: PrincipalAuthService;
    mode: "demo" | "oidc";
    allowedOrigin: string;
    secureCookies: boolean;
    sessionTtlSeconds: number;
  };
  principalAuth?: {
    mode: "demo" | "oidc";
    allowedOrigin: string;
    secureCookies: boolean;
    sessionTtlSeconds: number;
    loginTransactionTtlSeconds: number;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
    callbackUrl?: string;
    requestTimeoutMs?: number;
    nodeEnvironment: "development" | "test" | "production";
  };
  trust?: { service: AgentTrustService; auth: PrincipalAuthService; allowedOrigin: string; secureCookies: boolean; sessionTtlSeconds: number };
  agentTrust?: {
    mode: "LOCAL" | "EXTERNAL_OPTIONAL" | "EXTERNAL_REQUIRED";
    provider: "fake" | "didit";
    requestTimeoutMs: number;
    attestationTtlSeconds: number;
    callbackUrl: string;
    passportIssuer: string;
    passportAudience?: string;
    baseUrl?: string;
    apiKey?: string;
    workflowId?: string;
    biometricWorkflowId?: string;
    biometricCallbackUrl?: string;
    webhookSecret?: string;
  };
}

const redactedLogPaths = [
  "DATABASE_URL",
  "databaseUrl",
  "connectionString",
  "req.headers.authorization",
  "req.url",
  "req.headers.cookie",
  "req.headers['x-csrf-token']",
  "req.headers['x-signature-v2']",
  "req.headers['x-api-key']",
  "req.body",
  "req.query",
  "res.headers['set-cookie']",
  "*.proof",
  "*.signature",
  "*.public_jwk",
  "*.private_jwk",
  "*.public_key",
  "*.private_key",
  "*.password",
  "*.secret",
  "*.token",
  "*.pan",
  "*.cvv",
  "OPENAI_API_KEY",
  "LANGFUSE_SECRET_KEY",
  "TRAVELBOT_AGENT_PRIVATE_JWK",
  "TRAVELBOT_APPROVAL_ENCRYPTION_KEY",
  "SERPAPI_API_KEY",
  "AUTH_OIDC_CLIENT_SECRET",
  "KYA_API_KEY",
  "KYA_WEBHOOK_SECRET",
  "*.authorization_code",
  "*.access_token",
  "*.id_token",
  "*.refresh_token",
  "*.csrf_token",
  "*.code_verifier",
  "*.state",
  "*.nonce",
  "*.vendor_data",
  "*.webhook_payload",
  "*.sdk_run_state",
];

function loggerOptions(logger: BuildAppOptions["logger"]): FastifyServerOptions["logger"] {
  if (logger === false) return false;
  if (logger === undefined || logger === true) {
    return { redact: { paths: redactedLogPaths, censor: "[REDACTED]" } };
  }
  return {
    ...logger,
    redact: { paths: redactedLogPaths, censor: "[REDACTED]" },
  };
}

const deterministicDemoClock: ClockPort = {
  now: () => new Date("2026-08-29T12:04:01.000Z"),
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: loggerOptions(options.logger),
    genReqId: generateCorrelationId,
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook("onRequest", async (request) => {
    request.log.info({ correlation_id: request.id, method: request.method }, "request received");
  });
  const telemetryWithShutdown = options.llmTelemetry as (LlmTelemetryPort & {
    shutdown?: () => Promise<void>;
  }) | undefined;
  if (telemetryWithShutdown?.shutdown !== undefined) {
    app.addHook("onClose", async () => {
      try {
        await telemetryWithShutdown.shutdown!();
      } catch {
        // Telemetry shutdown is best-effort and cannot affect API state.
      }
    });
  }

  const clock = options.clock ?? deterministicDemoClock;
  const database = options.database
    ?? (options.databaseUrl === undefined
      ? undefined
      : createDatabase({ connectionString: options.databaseUrl }));

  if (database !== undefined) {
    try {
      await database.checkHealth();
    } catch (error) {
      await database.close();
      throw error;
    }
    app.decorate("database", database);
    app.addHook("onClose", async () => database.close());
  }

  configureHttpConventions(app);

  await app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:3000",
    credentials: true,
    exposedHeaders: ["x-correlation-id"],
    methods: ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
  });

  await app.register(rootRoutes);
  await app.register(healthRoutes);
  const signer = options.signer ?? new EphemeralEs256Signer();
  const ledger = database === undefined
    ? undefined
    : new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  let configuredAuth = options.auth;
  if (configuredAuth === undefined && options.principalAuth !== undefined && database !== undefined) {
    const config = options.principalAuth;
    const secret = config.mode === "oidc" ? config.clientSecret! : "bound-development-demo-session-key";
    const authCrypto = new AuthCrypto(secret);
    const repository = new PostgresPrincipalAuthRepository(database, authCrypto, secret);
    const callbackUrl = config.callbackUrl ?? "http://localhost:3001/auth/v1/login/google/callback";
    const providers: Record<string, PrincipalIdentityProviderPort> = config.mode === "oidc" ? {
      google: new GoogleOidcPrincipalProvider({
        issuer: config.issuer!, clientId: config.clientId!, clientSecret: config.clientSecret!, requestTimeoutMs: config.requestTimeoutMs,
      }),
    } : {};
    configuredAuth = {
      service: new PrincipalAuthService({
        mode: config.mode, providers, authRepository: repository, sessions: repository, crypto: authCrypto, clock,
        callbackUrl, sessionTtlSeconds: config.sessionTtlSeconds, loginTransactionTtlSeconds: config.loginTransactionTtlSeconds,
        ...(config.mode === "demo" ? { demoProvider: new DemoPrincipalAuthProvider(config.nodeEnvironment, config.mode) } : {}),
      }),
      mode: config.mode,
      allowedOrigin: config.allowedOrigin,
      secureCookies: config.secureCookies,
      sessionTtlSeconds: config.sessionTtlSeconds,
    };
  }
  if (configuredAuth !== undefined) await app.register(authRoutes, configuredAuth);
  let configuredTrust = options.trust;
  let configuredDiditProvider: DiditAgentAttestationProvider | undefined;
  let configuredTrustRepository: PostgresAgentTrustRepository | undefined;
  let biometricConsentService: MandateBiometricConsentService | undefined;
  if (configuredTrust === undefined && options.agentTrust !== undefined && database !== undefined && ledger !== undefined && configuredAuth !== undefined) {
    const config = options.agentTrust;
    const encryptionSecret = config.provider === "didit" ? config.apiKey! : "bound-development-fake-kya-key";
    const repository = new PostgresAgentTrustRepository(database, ledger, {
      mode: config.mode, provider: config.provider, attestationTtlSeconds: config.attestationTtlSeconds, encryptionSecret,
    });
    const provider = config.provider === "didit"
      ? new DiditAgentAttestationProvider({ baseUrl: config.baseUrl!, apiKey: config.apiKey!, workflowId: config.workflowId!, biometricWorkflowId: config.biometricWorkflowId, webhookSecret: config.webhookSecret!,
        timeoutMs: config.requestTimeoutMs, allowedCallbackUrls: [config.callbackUrl, ...(config.biometricCallbackUrl === undefined ? [] : [config.biometricCallbackUrl])] })
      : new DeterministicFakeAttestationProvider(clock.now());
    if (provider instanceof DiditAgentAttestationProvider) {
      configuredDiditProvider = provider;
      configuredTrustRepository = repository;
    }
    const passports = await BoundAgentPassportService.create({ issuer: config.passportIssuer, audience: config.passportAudience ?? "bound-verify", ttlSeconds: Math.min(900, config.attestationTtlSeconds), now: clock.now });
    configuredTrust = { service: new AgentTrustService({
      provider,
      providerName: config.provider,
      repository,
      passports,
      clock,
      callbackUrl: config.callbackUrl,
      secondaryProviderEventConsumer: {
        applyProviderEvent: async (event, correlationId) => biometricConsentService?.applyProviderEvent(event, correlationId) ?? false,
      },
    }), auth: configuredAuth.service, allowedOrigin: configuredAuth.allowedOrigin, secureCookies: configuredAuth.secureCookies, sessionTtlSeconds: configuredAuth.sessionTtlSeconds };
  }
  if (configuredTrust !== undefined) await app.register(trustRoutes, configuredTrust);
  const agentRegistry = options.agentRegistry
    ?? (database === undefined || ledger === undefined
      ? undefined
      : new DrizzleAgentIdentityRegistry(database, clock, ledger));
  const agentVerifier = agentRegistry === undefined
    ? undefined
    : (options.agentVerifier ?? new AgentRequestVerifier(agentRegistry, clock, configuredTrust?.service.eligibility));
  if (agentRegistry !== undefined && agentVerifier !== undefined) {
    await app.register(agentIdentityRoutes, {
      registry: agentRegistry,
      verifier: agentVerifier,
    });
  }
  const receiptStore = database === undefined || ledger === undefined
    ? undefined
    : new PostgresReceiptStore(database, ledger);
  const flightCatalog = options.flightCatalog ?? new VuelaYaCatalog();
  const merchant = new VuelaYaMerchant(signer, clock, flightCatalog);
  await app.register(vuelaYaRoutes, {
    merchant,
    catalog: flightCatalog,
    ...(receiptStore === undefined ? {} : { orders: receiptStore }),
  });
  let mandateService: MandateService | undefined;
  if (database !== undefined && ledger !== undefined) {
    const biometricEnabled = configuredDiditProvider !== undefined
      && configuredTrustRepository !== undefined
      && configuredAuth !== undefined
      && options.agentTrust?.biometricWorkflowId !== undefined
      && options.agentTrust.biometricCallbackUrl !== undefined;
    const biometricGate: MandateBiometricConsentGate | undefined = biometricEnabled ? {
      consumeInTransaction: (transaction, input) => {
        if (biometricConsentService === undefined) throw new Error("Biometric consent service is unavailable");
        return biometricConsentService.consumeInTransaction(transaction, input);
      },
    } : undefined;
    mandateService = new MandateService(database, signer, clock, ledger, configuredTrust?.service.eligibility, biometricGate);
    if (biometricEnabled) {
      biometricConsentService = new MandateBiometricConsentService({
        database,
        mandates: mandateService,
        trust: configuredTrustRepository!,
        provider: configuredDiditProvider!,
        ledger,
        clock,
        callbackUrl: options.agentTrust!.biometricCallbackUrl!,
        encryptionSecret: options.agentTrust!.apiKey!,
      });
    }
    await app.register(mandateRoutes, {
      service: mandateService,
      ...(biometricConsentService === undefined || configuredAuth === undefined ? {} : {
        biometricConsent: biometricConsentService,
        auth: configuredAuth.service,
        allowedOrigin: configuredAuth.allowedOrigin,
      }),
    });
  }
  let verifyOrchestrator = options.verifyOrchestrator;
  if (
    verifyOrchestrator === undefined
    && database !== undefined
    && agentRegistry !== undefined
    && agentVerifier !== undefined
    && mandateService !== undefined
  ) {
    verifyOrchestrator = new VerifyOrchestrator({
      agentRegistry,
      agentVerifier,
      mandateLoader: mandateService,
      mandateSignatureVerifier: signer,
      checkoutVerifier: {
        async verify(checkout) {
          try {
            const authoritative = merchant.getCheckout(checkout.terms.checkout_id);
            return canonicalizeJson(authoritative) === canonicalizeJson(checkout)
              && await verifyCheckoutIntegrity(checkout, signer);
          } catch {
            return false;
          }
        },
      },
      reservationStore: new PostgresAuthorizationReservationStore(database, ledger, configuredTrust?.service.eligibility),
      clock,
      humanApprovalRequired: options.humanApprovalRequired ?? (() => false),
      eligibility: configuredTrust?.service.eligibility,
    });
  }
  if (verifyOrchestrator !== undefined) {
    await app.register(verifyRoutes, { orchestrator: verifyOrchestrator });
  }
  if (ledger !== undefined) {
    await app.register(auditRoutes, {
      ledger,
      receipts: receiptStore,
      ...(configuredAuth === undefined ? {} : { auth: configuredAuth.service }),
    });
  }
  const paymentExecutor = options.paymentExecutor ?? new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: clock.now().toISOString(),
  });
  const paymentService = options.paymentService
    ?? (database === undefined
      ? undefined
      : new PaymentService(new PostgresPaymentClaimStore(database, clock, ledger), paymentExecutor));
  if (paymentService !== undefined) {
    await app.register(paymentRoutes, { service: paymentService });
  }
  let travelBotService = options.travelBotService;
  let travelBotEvents = options.travelBotEvents;
  if (travelBotService === undefined && database !== undefined) {
    const telemetry = options.llmTelemetry ?? new NoopLlmTelemetry();
    const model = options.openAI?.model ?? "unavailable";
    const repository = new PostgresTravelBotRepository(database, model, configuredTrust?.service.eligibility);
    travelBotEvents = repository;
    if (
      options.openAI !== undefined
      && options.travelBotProofFactory !== undefined
      && options.travelBotCredentialId !== undefined
      && mandateService !== undefined
      && verifyOrchestrator !== undefined
      && paymentService !== undefined
      && receiptStore !== undefined
      && ledger !== undefined
    ) {
      const tools = new ApplicationTravelBotTools({
        merchant,
        mandates: mandateService,
        verify: verifyOrchestrator,
        payments: paymentService,
        receipts: receiptStore,
        proofFactory: options.travelBotProofFactory,
        clock,
        credentialId: options.travelBotCredentialId,
        audit: ledger,
        catalog: flightCatalog,
      });
      travelBotService = new TravelBotService({
        repository,
        runtime: new OpenAIAgentsRuntime({
          model: options.openAI.model,
          apiKey: options.openAI.apiKey,
          timeoutMs: options.openAI.requestTimeoutMs,
          telemetry,
          toolExecutor: new StateGuardedAgentToolExecutor(repository, tools, clock),
        }),
        tools,
        clock,
        model: options.openAI.model,
        approvalStateProtector: options.travelBotApprovalStateProtector,
        telemetry,
      });
    } else {
      travelBotService = new TravelBotService({
        repository,
        runtime: new UnavailableAgentRuntime(),
        tools: { findOffers: async (intent) => (await flightCatalog.search(intent)).matches },
        clock,
        model,
      });
    }
  }
  if (travelBotService !== undefined) {
    const voice = options.voiceSessionIssuer ?? (options.openAI === undefined ? undefined : new OpenAIRealtimeVoiceSessionIssuer({
      apiKey: options.openAI.apiKey,
      realtimeModel: options.openAI.realtimeModel,
      transcriptionModel: options.openAI.transcriptionModel,
      voice: options.openAI.voice,
      timeoutMs: options.openAI.requestTimeoutMs,
    }));
    await app.register(travelBotRoutes, {
      service: travelBotService,
      ...(travelBotEvents === undefined ? {} : { events: travelBotEvents }),
      ...(configuredAuth === undefined ? {} : {
        auth: configuredAuth.service,
        allowedOrigin: configuredAuth.allowedOrigin,
      }),
      ...(voice === undefined ? {} : { voice }),
    });
  }
  let travelWatchService = options.travelWatchService;
  let travelWatchSimulator = options.travelWatchSimulator;
  let travelWatchWorker: TravelWatchWorker | undefined;
  if (
    travelWatchService === undefined
    && database !== undefined
    && mandateService !== undefined
    && options.travelBotCredentialId !== undefined
  ) {
    const repository = new PostgresTravelWatchRepository(database);
    const conversations = new PostgresTravelBotRepository(
      database,
      options.openAI?.model ?? "unavailable",
      configuredTrust?.service.eligibility,
    );
    travelWatchService = new TravelWatchService({
      repository,
      conversations,
      mandates: mandateService,
      clock,
      credentialId: options.travelBotCredentialId,
      merchantId: (await merchant.discoverProfile()).merchant_id,
    });
    if (options.enableDevelopmentTravelWatchSimulation === true) {
      if (flightCatalog.queueNextSearchResult === undefined) {
        throw new Error("Development travel watch simulation requires a simulatable flight catalog");
      }
      const merchantProfile = await merchant.discoverProfile();
      travelWatchSimulator = new DevelopmentTravelWatchSimulator({
        repository,
        catalog: { queueNextSearchResult: flightCatalog.queueNextSearchResult.bind(flightCatalog) },
        clock,
        merchantId: merchantProfile.merchant_id,
        merchantUrl: merchantProfile.merchant_url,
      });
    }
    if (
      verifyOrchestrator !== undefined
      && paymentService !== undefined
      && receiptStore !== undefined
      && options.travelBotProofFactory !== undefined
    ) {
      travelWatchWorker = new TravelWatchWorker({
        repository,
        search: {
          search: (criteria, watchId) => flightCatalog.search({
            ...criteria,
            selected_offer_id: null,
            confirmation: null,
          }, watchId),
        },
        purchases: new ApplicationTravelWatchPurchases({
          merchant,
          mandates: mandateService,
          verify: verifyOrchestrator,
          payments: paymentService,
          receipts: receiptStore,
          proofFactory: options.travelBotProofFactory,
          clock,
          catalog: flightCatalog,
        }),
        clock,
      });
    }
  }
  if (travelWatchService !== undefined) {
    await app.register(travelWatchRoutes, {
      service: travelWatchService,
      ...(travelWatchSimulator === undefined ? {} : { simulator: travelWatchSimulator }),
    });
  }
  if (travelWatchWorker !== undefined) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await travelWatchWorker!.runDue();
      } catch (error) {
        app.log.error({ error: error instanceof Error ? error.message : "unknown" }, "travel watch worker tick failed");
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void tick(), options.travelWatchPollMs ?? 15_000);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }

  return app;
}
