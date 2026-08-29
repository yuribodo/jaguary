import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";

import {
  canonicalizeJson,
  type AgentIdentityRegistryPort,
  type AgentRequestVerifierPort,
  type ClockPort,
  type PaymentExecutor,
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
import { mandateRoutes, MandateService } from "./modules/mandates/index.js";
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
}

const redactedLogPaths = [
  "DATABASE_URL",
  "databaseUrl",
  "connectionString",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body",
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
  });

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
  });

  await app.register(rootRoutes);
  await app.register(healthRoutes);
  const signer = options.signer ?? new EphemeralEs256Signer();
  const ledger = database === undefined
    ? undefined
    : new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const agentRegistry = options.agentRegistry
    ?? (database === undefined || ledger === undefined
      ? undefined
      : new DrizzleAgentIdentityRegistry(database, clock, ledger));
  const agentVerifier = agentRegistry === undefined
    ? undefined
    : (options.agentVerifier ?? new AgentRequestVerifier(agentRegistry, clock));
  if (agentRegistry !== undefined && agentVerifier !== undefined) {
    await app.register(agentIdentityRoutes, {
      registry: agentRegistry,
      verifier: agentVerifier,
    });
  }
  const receiptStore = database === undefined || ledger === undefined
    ? undefined
    : new PostgresReceiptStore(database, ledger);
  const merchant = new VuelaYaMerchant(signer, clock);
  await app.register(vuelaYaRoutes, {
    merchant,
    ...(receiptStore === undefined ? {} : { orders: receiptStore }),
  });
  let mandateService: MandateService | undefined;
  if (database !== undefined && ledger !== undefined) {
    mandateService = new MandateService(database, signer, clock, ledger);
    await app.register(mandateRoutes, {
      service: mandateService,
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
      reservationStore: new PostgresAuthorizationReservationStore(database, ledger),
      clock,
      humanApprovalRequired: options.humanApprovalRequired ?? (() => false),
    });
  }
  if (verifyOrchestrator !== undefined) {
    await app.register(verifyRoutes, { orchestrator: verifyOrchestrator });
  }
  if (ledger !== undefined) {
    await app.register(auditRoutes, { ledger, receipts: receiptStore });
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

  return app;
}
