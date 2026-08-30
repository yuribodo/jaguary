import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { eq, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";

import { buildApp } from "../src/build-app.js";
import {
  agentRequestProofFixture,
  approvedPaymentFixture,
  authorizationDecisionSchema,
  canonicalizeJson,
  checkoutTermsFixture,
  mandateFixture,
  mandateSchema,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  normalizedCheckoutSchema,
  offerCandidateFixture,
  orderReceiptSchema,
  paymentResultSchema,
  purchaseIntentFixture,
  PublicApiError,
  reservedAuthorizationFixture,
  reservedAuthorizationSchema,
  sha256CanonicalJson,
  travelBotFixture,
  type PaymentExecutor,
  type PaymentResultStatus,
  type CreateMandateDraftInput,
  type AuthorizationStatus,
} from "../src/contracts/v1/index.js";
import {
  createDatabase,
  type DatabaseConnection,
  type TransactionClient,
} from "../src/db/database.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { DrizzleAgentIdentityRegistry } from "../src/modules/identity/registry.js";
import { AgentRequestVerifier } from "../src/modules/identity/verifier.js";
import {
  agents,
  agentAttestationEvents,
  auditEvents,
  authorizations,
  checkouts,
  mandates,
  nonces,
  orders,
  paymentCredentials,
  payments,
  principals,
  principalSessions,
  travelConversations,
  travelIntentSnapshots,
  travelMessages,
  travelModelRuns,
  travelSseEvents,
  travelToolExecutions,
} from "../src/db/schema.js";
import { EphemeralEs256Signer } from "../src/modules/vuelaya/index.js";
import { DemoPaymentCredentialResolver, MandateService } from "../src/modules/mandates/index.js";
import {
  AuditLedgerService,
  PostgresAuditEventRepository,
  PostgresReceiptStore,
  validateAuditChain,
} from "../src/modules/ledger/index.js";
import {
  FakePaymentExecutor,
  PostgresPaymentClaimStore,
  PaymentService,
} from "../src/modules/payments/index.js";
import { PostgresAuthorizationReservationStore, VerifyOrchestrator } from "../src/modules/verify/index.js";
import { verifyCheckoutIntegrity, VuelaYaMerchant } from "../src/modules/vuelaya/merchant.js";
import { createTestAgentSigner } from "./support/agent-signing.js";
import {
  PostgresTravelBotRepository,
  PostgresTravelWatchRepository,
  ApplicationTravelBotTools,
  TravelBotService,
  TravelWatchService,
  TravelWatchWorker,
  type AgentRuntimePort,
} from "../src/modules/travelbot/index.js";
import { listVuelaYaOffers } from "../src/modules/vuelaya/catalog.js";
import { AuthCrypto, PostgresPrincipalAuthRepository, sha256Text } from "../src/modules/auth/index.js";
import { agentBindingHash, PostgresAgentTrustRepository, purgeTerminalAgentAttestationEvidence } from "../src/modules/trust/index.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? test.skip : test;

let administrationPool: Pool | undefined;
let database: DatabaseConnection | undefined;

async function insertMandateReferences(transaction: TransactionClient): Promise<void> {
  await transaction.insert(principals).values({
    principalId: travelBotFixture.principal_id,
    displayName: "Marta",
    createdAt: new Date(travelBotFixture.created_at),
    updatedAt: new Date(travelBotFixture.created_at),
  });
  await transaction.insert(agents).values({
    agentId: travelBotFixture.agent_id,
    principalId: travelBotFixture.principal_id,
    displayName: travelBotFixture.display_name,
    status: travelBotFixture.status,
    buildFingerprint: travelBotFixture.build_fingerprint,
    verificationKeyId: travelBotFixture.verification_key.key_id,
    verificationAlgorithm: travelBotFixture.verification_key.algorithm,
    verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
    correlationId: "corr_seed_agent_001",
    idempotencyKey: "idem_seed_agent_001",
    createdAt: new Date(travelBotFixture.created_at),
  });
  await transaction.insert(paymentCredentials).values({
    credentialId: mandateFixture.terms.credential_id,
    principalId: mandateFixture.terms.principal_id,
    display: mandateFixture.payment_credential.display,
  });
}

function activeMandateRow(termsHash = mandateFixture.terms_hash): typeof mandates.$inferInsert {
  return {
    mandateId: mandateFixture.terms.mandate_id,
    version: mandateFixture.terms.version,
    principalId: mandateFixture.terms.principal_id,
    agentId: mandateFixture.terms.agent_id,
    allowedMerchantIds: mandateFixture.terms.allowed_merchant_ids,
    allowedMerchantCategories: mandateFixture.terms.allowed_merchant_categories,
    routeOrigin: mandateFixture.terms.route.origin,
    routeDestination: mandateFixture.terms.route.destination,
    cabin: mandateFixture.terms.cabin,
    maxPerPurchaseAmount: mandateFixture.terms.max_per_purchase.amount,
    maxPerPurchaseCurrency: mandateFixture.terms.max_per_purchase.currency,
    maxAggregateAmount: mandateFixture.terms.max_aggregate.amount,
    maxAggregateCurrency: mandateFixture.terms.max_aggregate.currency,
    maxUses: mandateFixture.terms.max_uses,
    validFrom: new Date(mandateFixture.terms.valid_from),
    expiresAt: new Date(mandateFixture.terms.expires_at),
    credentialId: mandateFixture.terms.credential_id,
    status: mandateFixture.status,
    termsHash,
    principalSignatureAlgorithm: mandateFixture.principal_signature.algorithm,
    principalSignatureKeyId: mandateFixture.principal_signature.key_id,
    principalSignatureValue: mandateFixture.principal_signature.value,
    creationRequestHash: mandateFixture.terms_hash,
    correlationId: "corr_seed_mandate_001",
    idempotencyKey: "idem_seed_mandate_001",
    createdAt: new Date(mandateFixture.created_at),
    activatedAt: new Date(mandateFixture.activated_at),
  };
}

function mandateDraftRequest(
  mandateId: string,
  overrides: Partial<Omit<CreateMandateDraftInput, "mandate_id">> = {},
): CreateMandateDraftInput {
  return {
    mandate_id: mandateId,
    principal_id: mandateFixture.terms.principal_id,
    agent_id: mandateFixture.terms.agent_id,
    allowed_merchant_ids: mandateFixture.terms.allowed_merchant_ids,
    allowed_merchant_categories: mandateFixture.terms.allowed_merchant_categories,
    route: mandateFixture.terms.route,
    cabin: mandateFixture.terms.cabin,
    max_per_purchase: mandateFixture.terms.max_per_purchase,
    max_aggregate: mandateFixture.terms.max_aggregate,
    max_uses: mandateFixture.terms.max_uses,
    valid_from: mandateFixture.terms.valid_from,
    expires_at: mandateFixture.terms.expires_at,
    credential_id: mandateFixture.terms.credential_id,
    ...overrides,
  };
}

async function seedAuthorizationGraph(termsHash = mandateFixture.terms_hash): Promise<void> {
  assert.ok(database);

  await database.transaction(async (tx) => {
    await insertMandateReferences(tx);
    await tx.insert(mandates).values(activeMandateRow(termsHash));
    await tx.insert(checkouts).values({
      checkoutId: checkoutTermsFixture.checkout_id,
      merchantId: checkoutTermsFixture.merchant_id,
      merchantUrl: checkoutTermsFixture.merchant_url,
      items: [...checkoutTermsFixture.items],
      totalAmount: checkoutTermsFixture.total.amount,
      currency: checkoutTermsFixture.total.currency,
      fulfillment: checkoutTermsFixture.fulfillment,
      protocolName: checkoutTermsFixture.protocol.name,
      protocolVersion: checkoutTermsFixture.protocol.version,
      checkoutHash: normalizedCheckoutFixture.checkout_hash,
      merchantSignatureAlgorithm: normalizedCheckoutFixture.merchant_signature.algorithm,
      merchantSignatureKeyId: normalizedCheckoutFixture.merchant_signature.key_id,
      merchantSignatureValue: normalizedCheckoutFixture.merchant_signature.value,
      correlationId: "corr_seed_checkout_001",
      idempotencyKey: "idem_seed_checkout_001",
      createdAt: new Date(checkoutTermsFixture.created_at),
      expiresAt: new Date(checkoutTermsFixture.expires_at),
    });
    await tx.insert(authorizations).values({
      authorizationId: reservedAuthorizationFixture.authorization_id,
      mandateId: reservedAuthorizationFixture.mandate_id,
      checkoutId: reservedAuthorizationFixture.checkout_id,
      checkoutHash: reservedAuthorizationFixture.checkout_hash,
      principalId: reservedAuthorizationFixture.principal_id,
      agentId: reservedAuthorizationFixture.agent_id,
      merchantId: reservedAuthorizationFixture.merchant_id,
      allowedMerchantIds: normalizedAuthorizationFixture.allowed_merchant_ids,
      maxAmount: normalizedAuthorizationFixture.max_amount.amount,
      maxAmountCurrency: normalizedAuthorizationFixture.max_amount.currency,
      maxUses: normalizedAuthorizationFixture.max_uses,
      reservedAmount: reservedAuthorizationFixture.reserved_amount.amount,
      currency: reservedAuthorizationFixture.reserved_amount.currency,
      status: reservedAuthorizationFixture.status,
      proofType: normalizedAuthorizationFixture.proof_type,
      proofReference: normalizedAuthorizationFixture.proof_reference,
      proofHash: normalizedAuthorizationFixture.proof_hash,
      requestHash: sha256CanonicalJson({
        authorization: normalizedAuthorizationFixture,
        checkout: normalizedCheckoutFixture,
      }),
      policyVersion: "bound.verify.v1",
      evidenceHash: "e".repeat(64),
      correlationId: "corr_seed_authorization_001",
      idempotencyKey: "idem_seed_authorization_001",
      reservedAt: new Date(reservedAuthorizationFixture.reserved_at),
      expiresAt: new Date(reservedAuthorizationFixture.expires_at),
    });
  });
}

async function seedReservedAuthorizationAuditEvent(evidenceHash = "e".repeat(64)): Promise<void> {
  assert.ok(database);
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  await database.transaction((transaction) => ledger.append(transaction, {
    correlationId: "corr_seed_authorization_001",
    eventType: "authorization.reserved",
    subjectId: reservedAuthorizationFixture.authorization_id,
    payload: {
      authorization_id: reservedAuthorizationFixture.authorization_id,
      mandate_id: reservedAuthorizationFixture.mandate_id,
      checkout_id: reservedAuthorizationFixture.checkout_id,
      principal_id: reservedAuthorizationFixture.principal_id,
      agent_id: reservedAuthorizationFixture.agent_id,
      merchant_id: reservedAuthorizationFixture.merchant_id,
      decision: "ALLOW",
      policy_version: "bound.verify.v1",
      evidence_hash: evidenceHash,
      reserved_amount: reservedAuthorizationFixture.reserved_amount,
      reserved_at: reservedAuthorizationFixture.reserved_at,
      expires_at: reservedAuthorizationFixture.expires_at,
      payment_executor_called: false,
    },
    recordedAt: new Date(reservedAuthorizationFixture.reserved_at),
    deduplicationKey: "authorization:seed-dispute-test:reserved",
  }));
}

async function seedMandateReferences(): Promise<void> {
  assert.ok(database);
  await database.transaction(insertMandateReferences);
}

interface VerifyScenarioOptions {
  maxUses?: number;
  maxAggregateAmount?: number;
  humanApprovalRequired?: boolean;
  paymentExecutor?: PaymentExecutor;
}

async function createVerifyScenario(
  t: { after(callback: () => Promise<void>): void },
  options: VerifyScenarioOptions = {},
) {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  const agentSigner = await createTestAgentSigner();
  const authoritySigner = new EphemeralEs256Signer();
  let now = new Date("2026-08-29T12:04:01.000Z");
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    signer: authoritySigner,
    clock: { now: () => now },
    humanApprovalRequired: () => options.humanApprovalRequired ?? false,
    paymentExecutor: options.paymentExecutor,
  });
  t.after(async () => app.close());

  await database.db.insert(principals).values({
    principalId: agentSigner.agent.principal_id,
    displayName: "Verify scenario principal",
    createdAt: now,
    updatedAt: now,
  });

  const registration = await app.inject({
    method: "POST",
    url: "/trust/v1/agents",
    headers: { "idempotency-key": "idem_scenario_agent_register_001" },
    payload: {
      agent_id: agentSigner.agent.agent_id,
      principal_id: agentSigner.agent.principal_id,
      display_name: agentSigner.agent.display_name,
      status: agentSigner.agent.status,
      build_fingerprint: agentSigner.agent.build_fingerprint,
      verification_key: agentSigner.agent.verification_key,
    },
  });
  assert.equal(registration.statusCode, 201);
  const credentialId = "credential_verify_scenario_001";
  await database.db.insert(paymentCredentials).values({
    credentialId,
    principalId: agentSigner.agent.principal_id,
    display: "Visa •••• 4242",
  });
  const mandateId = "mandate_verify_scenario_001";
  const draft = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: { "idempotency-key": "idem_scenario_mandate_create_001" },
    payload: {
      ...mandateDraftRequest(mandateId),
      principal_id: agentSigner.agent.principal_id,
      agent_id: agentSigner.agent.agent_id,
      credential_id: credentialId,
      max_uses: options.maxUses ?? 1,
      max_aggregate: {
        amount: options.maxAggregateAmount ?? 15000,
        currency: "USD",
      },
    },
  });
  assert.equal(draft.statusCode, 201);
  const activation = await app.inject({
    method: "POST",
    url: `/v1/mandates/${mandateId}/activate`,
    headers: { "idempotency-key": "idem_scenario_mandate_activate_001" },
    payload: {},
  });
  assert.equal(activation.statusCode, 200);
  const checkoutResponse = await app.inject({
    method: "POST",
    url: "/ucp/v1/checkout",
    headers: {
      "idempotency-key": "idem_scenario_checkout_create_001",
      "ucp-capabilities": "dev.ucp.shopping.checkout,dev.ucp.common.payment.ap2_mandate",
    },
    payload: { ...purchaseIntentFixture, agent_id: agentSigner.agent.agent_id },
  });
  assert.equal(checkoutResponse.statusCode, 201);
  const checkout = normalizedCheckoutSchema.parse(checkoutResponse.json());
  const requestBody = {
    authorization: {
      ...normalizedAuthorizationFixture,
      principal_id: agentSigner.agent.principal_id,
      agent_id: agentSigner.agent.agent_id,
      mandate_id: mandateId,
      checkout_hash: checkout.checkout_hash,
      max_uses: options.maxUses ?? 1,
      proof_reference: "proof_verify_scenario_001",
      proof_hash: sha256CanonicalJson({ mandate_id: mandateId, checkout_hash: checkout.checkout_hash }),
    },
    checkout,
  };

  async function createProof(
    body = requestBody,
    nonce = "nonce_verify_scenario_001",
  ) {
    return agentSigner.sign(body, { route: "/verify", nonce });
  }

  async function sendVerify(input: {
    body?: typeof requestBody;
    nonce?: string;
    idempotencyKey?: string;
    proof?: Awaited<ReturnType<typeof createProof>>;
  } = {}) {
    const body = input.body ?? requestBody;
    const proof = input.proof ?? await createProof(body, input.nonce);
    return app.inject({
      method: "POST",
      url: "/verify",
      headers: {
        "idempotency-key": input.idempotencyKey ?? "idem_verify_scenario_commit_001",
        "x-correlation-id": "corr_verify_scenario_001",
      },
      payload: { request_body: body, proof },
    });
  }

  return {
    app,
    mandateId,
    requestBody,
    checkout,
    agentSigner,
    createProof,
    sendVerify,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

type VerifyScenario = Awaited<ReturnType<typeof createVerifyScenario>>;
type VerifyRequestInput = Parameters<VerifyScenario["sendVerify"]>[0];

async function createPaymentScenario(
  t: { after(callback: () => Promise<void>): void },
  outcome: PaymentResultStatus = "APPROVED",
) {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  await seedAuthorizationGraph();
  const executor = new FakePaymentExecutor({
    outcome,
    occurredAt: "2026-08-29T12:04:02.000Z",
  });
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    paymentExecutor: executor,
  });
  t.after(async () => app.close());

  async function sendPay(
    idempotencyKey: string,
    authorizationId = reservedAuthorizationFixture.authorization_id,
    correlationId?: string,
  ) {
    return app.inject({
      method: "POST",
      url: `/authorizations/${authorizationId}/pay`,
      headers: {
        "idempotency-key": idempotencyKey,
        ...(correlationId === undefined ? {} : { "x-correlation-id": correlationId }),
      },
      payload: {},
    });
  }

  return {
    executor,
    sendPay,
  };
}

async function sendConcurrentVerifies(
  scenario: VerifyScenario,
  inputs: readonly [VerifyRequestInput, VerifyRequestInput],
) {
  const responses = await Promise.all(inputs.map((input) => scenario.sendVerify(input)));
  return responses.map((response) => authorizationDecisionSchema.parse(response.json()));
}

async function assertReplayDenied(
  scenario: VerifyScenario,
  firstInput: VerifyRequestInput,
  replayInput: VerifyRequestInput,
): Promise<void> {
  const first = authorizationDecisionSchema.parse((await scenario.sendVerify(firstInput)).json());
  const replay = authorizationDecisionSchema.parse((await scenario.sendVerify(replayInput)).json());

  assert.equal(first.decision, "ALLOW");
  assert.equal(replay.decision, "DENY");
  assert.equal(replay.reasons.includes("replay_detected"), true);
  assert.ok(database);
  assert.equal((await database.db.select().from(authorizations)).length, 1);
  assert.equal((await database.db.select().from(nonces)).length, 1);
}

async function seedPriorAuthorization(
  scenario: VerifyScenario,
  input: {
    suffix: string;
    status: AuthorizationStatus;
    amount: number;
    expiresAt: string;
  },
): Promise<void> {
  assert.ok(database);
  const checkoutId = `checkout_prior_${input.suffix}`;
  const checkoutHash = sha256CanonicalJson({ checkout_id: checkoutId });
  await database.transaction(async (transaction) => {
    await transaction.insert(checkouts).values({
      checkoutId,
      merchantId: scenario.checkout.terms.merchant_id,
      merchantUrl: scenario.checkout.terms.merchant_url,
      items: scenario.checkout.terms.items,
      totalAmount: input.amount,
      currency: "USD",
      fulfillment: scenario.checkout.terms.fulfillment,
      protocolName: scenario.checkout.terms.protocol.name,
      protocolVersion: scenario.checkout.terms.protocol.version,
      checkoutHash,
      merchantSignatureAlgorithm: scenario.checkout.merchant_signature.algorithm,
      merchantSignatureKeyId: scenario.checkout.merchant_signature.key_id,
      merchantSignatureValue: scenario.checkout.merchant_signature.value,
      correlationId: `corr_prior_${input.suffix}`,
      idempotencyKey: `idem_prior_checkout_${input.suffix}`,
      createdAt: new Date("2026-08-29T12:00:00.000Z"),
      expiresAt: new Date("2026-08-29T12:30:00.000Z"),
    });
    await transaction.insert(authorizations).values({
      authorizationId: `authorization_prior_${input.suffix}`,
      mandateId: scenario.mandateId,
      checkoutId,
      checkoutHash,
      principalId: scenario.agentSigner.agent.principal_id,
      agentId: scenario.agentSigner.agent.agent_id,
      merchantId: scenario.checkout.terms.merchant_id,
      allowedMerchantIds: [scenario.checkout.terms.merchant_id],
      maxAmount: 15000,
      maxAmountCurrency: "USD",
      maxUses: scenario.requestBody.authorization.max_uses,
      reservedAmount: input.amount,
      currency: "USD",
      status: input.status,
      proofType: "AP2",
      proofReference: `proof_prior_${input.suffix}`,
      proofHash: sha256CanonicalJson({ proof: input.suffix }),
      requestHash: sha256CanonicalJson({ request: input.suffix }),
      policyVersion: "bound.verify.v1",
      evidenceHash: sha256CanonicalJson({ evidence: input.suffix }),
      correlationId: `corr_prior_${input.suffix}`,
      idempotencyKey: `idem_prior_authorization_${input.suffix}`,
      reservedAt: new Date("2026-08-29T12:00:00.000Z"),
      expiresAt: new Date(input.expiresAt),
    });
  });
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === code) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

before(async () => {
  if (testDatabaseUrl === undefined) return;

  administrationPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
  await administrationPool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await administrationPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await administrationPool.query("CREATE SCHEMA public");
  await migrateDatabase(testDatabaseUrl);
  database = createDatabase({ connectionString: testDatabaseUrl, max: 4 });
});

after(async () => {
  await database?.close();
  await administrationPool?.end();
});

beforeEach(async () => {
  if (administrationPool === undefined) return;
  await administrationPool.query(`
    TRUNCATE TABLE
      purchase_disputes,
      agent_attestation_events,
      agent_attestations,
      principal_sessions,
      principal_login_transactions,
      principal_auth_identities,
      principals,
      travel_approvals,
      travel_tool_executions,
      travel_watch_checks,
      travel_watches,
      travel_sse_events,
      travel_model_runs,
      travel_intent_snapshots,
      travel_messages,
      travel_conversations,
      orders,
      audit_events,
      payments,
      authorizations,
      nonces,
      checkouts,
      mandates,
      payment_credentials,
      agents
    RESTART IDENTITY CASCADE
  `);
});

integrationTest("an empty PostgreSQL database migrates from zero", async () => {
  assert.ok(testDatabaseUrl);
  assert.ok(administrationPool);

  const result = await administrationPool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  assert.deepEqual(
    result.rows.map(({ table_name }) => table_name),
    [
      "agent_attestation_events",
      "agent_attestations",
      "agents",
      "audit_events",
      "authorizations",
      "checkouts",
      "mandate_biometric_consents",
      "mandates",
      "nonces",
      "orders",
      "payment_credentials",
      "payments",
      "principal_auth_identities",
      "principal_login_transactions",
      "principal_sessions",
      "principals",
      "purchase_disputes",
      "travel_approvals",
      "travel_conversations",
      "travel_intent_snapshots",
      "travel_messages",
      "travel_model_runs",
      "travel_sse_events",
      "travel_tool_executions",
      "travel_watch_checks",
      "travel_watches",
    ],
  );
});

integrationTest("opaque principal sessions persist only token hashes and rotate atomically", async () => {
  assert.ok(database);
  const now = new Date("2026-08-29T12:00:00.000Z");
  const crypto = new AuthCrypto("integration-auth-encryption-secret");
  const repository = new PostgresPrincipalAuthRepository(database, crypto, "integration-auth-encryption-secret");
  const principal = await repository.ensureDemoPrincipal(now);
  const issued = await repository.create({ principal, assurance: "DEMO", now, expiresAt: new Date(now.getTime() + 3600_000) });

  const stored = (await database.db.select().from(principalSessions).where(eq(principalSessions.sessionId, issued.session.sessionId)))[0]!;
  assert.equal(stored.tokenHash, sha256Text(issued.token));
  assert.notEqual(stored.tokenHash, issued.token);
  assert.equal(JSON.stringify(stored).includes(issued.token), false);

  const rotated = await repository.rotate(issued.session.sessionId, new Date(now.getTime() + 1000));
  assert.equal(await repository.getByTokenHash(sha256Text(issued.token), new Date(now.getTime() + 1001)), undefined);
  assert.equal((await repository.getByTokenHash(sha256Text(rotated.token), new Date(now.getTime() + 1001)))?.principal.principal_id, "principal_marta");
  await repository.revoke(rotated.session.sessionId, new Date(now.getTime() + 2000));
  assert.equal(await repository.getByTokenHash(sha256Text(rotated.token), new Date(now.getTime() + 2001)), undefined);
});

integrationTest("signed provider events deduplicate concurrently, ignore older state and support Bound revocation", async () => {
  assert.ok(database);
  const now = new Date("2026-08-29T12:00:00.000Z");
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`INSERT INTO principals (principal_id, display_name, created_at, updated_at) VALUES (${travelBotFixture.principal_id}, 'Marta', ${now}, ${now})`);
    await transaction.insert(agents).values({
      agentId: travelBotFixture.agent_id, principalId: travelBotFixture.principal_id, displayName: travelBotFixture.display_name,
      status: "ACTIVE", buildFingerprint: travelBotFixture.build_fingerprint, verificationKeyId: travelBotFixture.verification_key.key_id,
      verificationAlgorithm: "ES256", verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
      correlationId: "corr_kya_agent_seed", idempotencyKey: "idem_kya_agent_seed", createdAt: now,
    });
  });
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const repository = new PostgresAgentTrustRepository(database, ledger, { mode: "EXTERNAL_REQUIRED", provider: "fake", attestationTtlSeconds: 3600, encryptionSecret: "integration-kya-secret" });
  const bindingHash = agentBindingHash({ agentId: travelBotFixture.agent_id, principalId: travelBotFixture.principal_id, keyId: travelBotFixture.verification_key.key_id, buildFingerprint: travelBotFixture.build_fingerprint });
  await repository.createAssessment({
    attestationId: "attestation_integration_001", agentId: travelBotFixture.agent_id, principalId: travelBotFixture.principal_id,
    keyId: travelBotFixture.verification_key.key_id, buildFingerprint: travelBotFixture.build_fingerprint, provider: "fake",
    providerAssessmentId: "fake_assessment_integration_001", bindingHash, evidenceHash: "a".repeat(64),
    correlationId: "corr_kya_started", idempotencyKey: "idem_kya_started_001", now,
  });
  const verifiedEvent = {
    provider: "fake" as const, assessmentId: "fake_assessment_integration_001", eventId: "provider_event_verified_001",
    subjectReference: "opaque-provider-subject", status: "VERIFIED" as const, claims: ["OPERATOR_IDENTITY" as const],
    evidenceHash: "b".repeat(64), providerCreatedAt: new Date(now.getTime() + 10_000),
  };
  const concurrent = await Promise.all([
    repository.applyProviderEvent({ event: verifiedEvent, now: new Date(now.getTime() + 11_000), correlationId: "corr_kya_webhook_1" }),
    repository.applyProviderEvent({ event: verifiedEvent, now: new Date(now.getTime() + 11_001), correlationId: "corr_kya_webhook_2" }),
  ]);
  assert.deepEqual(concurrent.map(({ applied }) => applied).sort(), [false, true]);
  assert.equal((await database.db.select({ count: sql<number>`count(*)::int` }).from(agentAttestationEvents))[0]!.count, 1);

  const older = await repository.applyProviderEvent({ event: { ...verifiedEvent, eventId: "provider_event_old_001", status: "REJECTED", claims: [], providerCreatedAt: new Date(now.getTime() + 5000), evidenceHash: "c".repeat(64) }, now: new Date(now.getTime() + 12_000), correlationId: "corr_kya_old" });
  assert.equal(older.applied, false);
  assert.equal(older.trust.attestation_status, "VERIFIED");
  assert.equal((await repository.revokeCurrent(travelBotFixture.agent_id, new Date(now.getTime() + 13_000), "corr_kya_revoke")).attestation_status, "REVOKED");
  const auditCount = (await database.db.select({ count: sql<number>`count(*)::int` }).from(auditEvents))[0]!.count;
  assert.equal(await purgeTerminalAgentAttestationEvidence(database, travelBotFixture.agent_id), 1);
  assert.equal((await database.db.select({ count: sql<number>`count(*)::int` }).from(agentAttestationEvents))[0]!.count, 0);
  assert.equal((await database.db.select({ count: sql<number>`count(*)::int` }).from(auditEvents))[0]!.count, auditCount);
});

integrationTest("a platform-owned TravelBot creates a conversation for another customer", async () => {
  assert.ok(database);
  const now = new Date("2026-08-30T06:53:59.000Z");
  await database.transaction(async (transaction) => {
    await transaction.insert(principals).values([
      { principalId: "principal_platform", displayName: "Jaguary", createdAt: now, updatedAt: now },
      { principalId: "principal_alice", displayName: "Alice", createdAt: now, updatedAt: now },
    ]);
    await transaction.insert(agents).values({
      agentId: travelBotFixture.agent_id,
      principalId: "principal_platform",
      displayName: travelBotFixture.display_name,
      status: "ACTIVE",
      buildFingerprint: travelBotFixture.build_fingerprint,
      verificationKeyId: travelBotFixture.verification_key.key_id,
      verificationAlgorithm: "ES256",
      verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
      correlationId: "corr_platform_agent_seed",
      idempotencyKey: "idem_platform_agent_seed",
      createdAt: now,
    });
  });
  const repository = new PostgresTravelBotRepository(database, "fake-integration-model");
  const conversation = await repository.create({
    principal_id: "principal_alice",
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_platform_conversation_001",
    correlation_id: "corr_platform_conversation_001",
  }, now);

  assert.equal(conversation.principal_id, "principal_alice");
  assert.equal(conversation.agent_id, travelBotFixture.agent_id);
});

integrationTest("public TravelBot stores a separate onboarding reference for each customer", async () => {
  assert.ok(database);
  const now = new Date("2026-08-30T07:00:00.000Z");
  await database.transaction(async (transaction) => {
    await transaction.insert(principals).values([
      { principalId: "principal_jaguary_platform", displayName: "Jaguary Platform", createdAt: now, updatedAt: now },
      { principalId: "principal_alice", displayName: "Alice", createdAt: now, updatedAt: now },
      { principalId: "principal_bob", displayName: "Bob", createdAt: now, updatedAt: now },
    ]);
    await transaction.insert(agents).values({
      agentId: travelBotFixture.agent_id,
      principalId: "principal_jaguary_platform",
      accessScope: "PUBLIC",
      displayName: travelBotFixture.display_name,
      status: "ACTIVE",
      buildFingerprint: travelBotFixture.build_fingerprint,
      verificationKeyId: travelBotFixture.verification_key.key_id,
      verificationAlgorithm: "ES256",
      verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
      correlationId: "corr_public_agent_seed",
      idempotencyKey: "idem_public_agent_seed",
      createdAt: now,
    });
  });
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const repository = new PostgresAgentTrustRepository(database, ledger, {
    mode: "EXTERNAL_REQUIRED",
    provider: "fake",
    attestationTtlSeconds: 3600,
    encryptionSecret: "public-agent-integration-secret",
  });
  const createCustomerAssessment = (principalId: string, suffix: string) => repository.createAssessment({
    attestationId: `attestation_${suffix}`,
    agentId: travelBotFixture.agent_id,
    principalId,
    keyId: travelBotFixture.verification_key.key_id,
    buildFingerprint: travelBotFixture.build_fingerprint,
    provider: "fake",
    providerAssessmentId: `fake_assessment_${suffix}`,
    bindingHash: agentBindingHash({
      agentId: travelBotFixture.agent_id,
      principalId,
      keyId: travelBotFixture.verification_key.key_id,
      buildFingerprint: travelBotFixture.build_fingerprint,
    }),
    evidenceHash: suffix === "alice" ? "a".repeat(64) : "b".repeat(64),
    correlationId: `corr_${suffix}_onboarding`,
    idempotencyKey: `idem_${suffix}_onboarding`,
    now,
  });

  await createCustomerAssessment("principal_alice", "alice");
  await createCustomerAssessment("principal_bob", "bob");

  const alice = await repository.getCurrentForPrincipal(travelBotFixture.agent_id, "principal_alice", now);
  const bob = await repository.getCurrentForPrincipal(travelBotFixture.agent_id, "principal_bob", now);
  const aliceByEvidence = await repository.getCurrentByEvidenceReferenceHash(travelBotFixture.agent_id, "a".repeat(64), now);
  const platform = await repository.getCurrent(travelBotFixture.agent_id, now);
  assert.equal(alice.attestation_id, "attestation_alice");
  assert.equal(aliceByEvidence.attestation_id, "attestation_alice");
  assert.equal(bob.attestation_id, "attestation_bob");
  assert.notEqual(alice.binding_hash, bob.binding_hash);
  assert.equal(platform.principal_id, "principal_jaguary_platform");
  assert.equal(platform.mode, "LOCAL");
  assert.equal(platform.attestation_id, null);
});

integrationTest("the demo credential template resolves to an isolated customer reference", async () => {
  assert.ok(database);
  const now = new Date("2026-08-30T06:53:59.000Z");
  await database.db.insert(principals).values([
    { principalId: "principal_platform", displayName: "Jaguary", createdAt: now, updatedAt: now },
    { principalId: "principal_alice", displayName: "Alice", createdAt: now, updatedAt: now },
  ]);
  await database.db.insert(paymentCredentials).values({
    credentialId: "cred_demo_platform",
    principalId: "principal_platform",
    display: "Demo payment •••• 4242",
    createdAt: now,
    updatedAt: now,
  });
  await database.db.insert(agents).values({
    agentId: travelBotFixture.agent_id,
    principalId: "principal_platform",
    displayName: travelBotFixture.display_name,
    status: "ACTIVE",
    buildFingerprint: travelBotFixture.build_fingerprint,
    verificationKeyId: travelBotFixture.verification_key.key_id,
    verificationAlgorithm: "ES256",
    verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
    correlationId: "corr_demo_credential_agent_seed",
    idempotencyKey: "idem_demo_credential_agent_seed",
    createdAt: now,
  });
  const resolver = new DemoPaymentCredentialResolver("cred_demo_platform");
  const [first, replay] = await database.transaction(async (transaction) => [
    await resolver.resolve(transaction, "cred_demo_platform", "principal_alice", now),
    await resolver.resolve(transaction, "cred_demo_platform", "principal_alice", now),
  ]);

  assert.ok(first);
  assert.deepEqual(replay, first);
  assert.notEqual(first.credentialId, "cred_demo_platform");
  assert.equal((await database.db.select().from(paymentCredentials).where(eq(paymentCredentials.credentialId, first.credentialId)))[0]?.principalId, "principal_alice");

  const service = new MandateService(
    database,
    new EphemeralEs256Signer(),
    { now: () => now },
    undefined,
    undefined,
    undefined,
    resolver,
  );
  const draftInput = mandateDraftRequest("mandate_demo_credential_alice", {
    principal_id: "principal_alice",
    agent_id: travelBotFixture.agent_id,
    credential_id: "cred_demo_platform",
    valid_from: now.toISOString(),
    expires_at: new Date(now.getTime() + 86_400_000).toISOString(),
  });
  await assert.rejects(
    service.createDraft(draftInput, "idem_public_demo_credential_denied", "corr_public_demo_credential_denied"),
    (error: unknown) => error instanceof PublicApiError && error.code === "invalid_request",
  );
  const created = await service.createDraft(
    draftInput,
    "idem_internal_demo_credential_allowed",
    "corr_internal_demo_credential_allowed",
    { allowDemoCredentialTemplate: true },
  );
  assert.equal(created.mandate.terms.credential_id, first.credentialId);
});

integrationTest("TravelBot persists sanitized idempotent turns, tool executions and recoverable SSE events", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const repository = new PostgresTravelBotRepository(database, "fake-integration-model");
  let modelRuns = 0;
  const runtime: AgentRuntimePort = {
    async run() {
      modelRuns += 1;
      return {
        proposal: {
          origin_iata: "GRU",
          destination_iata: "COR",
          departure_date: "2026-09-15",
          passenger_count: 1,
          cabin: "ECONOMY",
          max_total_budget: { amount: 15000, currency: "USD" },
          selected_offer_id: null,
          explicit_confirmation: null,
          ambiguities: [],
          requested_action: "FIND_OFFERS",
        },
        assistant_message: "Local offer found.",
      };
    },
  };
  const service = new TravelBotService({
    repository,
    runtime,
    tools: {
      findOffers: async () => listVuelaYaOffers(),
      createCheckout: async ({ offer }) => ({
        checkout_id: "checkout_travelbot_integration_001",
        checkout_hash: "c".repeat(64),
        merchant_id: offer.merchant_id,
        total: offer.total,
      }),
      prepareAuthority: async () => ({ mandate_id: "mandate_chat_integration_001", status: "DRAFT" }),
    },
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    model: "fake-integration-model",
  });
  const conversation = await service.createConversation({
    principal_id: travelBotFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_travelbot_integration_create_001",
    correlation_id: "corr_travelbot_integration_create_001",
  });
  const command = {
    conversation_id: conversation.conversation_id,
    content: "GRU to COR; api_key=sk-supersecret123456",
    idempotency_key: "idem_travelbot_integration_message_001",
    correlation_id: "corr_travelbot_integration_message_001",
  };
  const first = await service.postMessage(command);
  const replay = await service.postMessage(command);
  assert.deepEqual(replay, first);
  assert.equal(modelRuns, 1);
  assert.equal(first.state, "AWAITING_AUTHORITY_CONFIRMATION");
  const messages = await database.db.select().from(travelMessages);
  assert.equal(messages.some(({ content }) => content.includes("sk-supersecret")), false);
  assert.equal((await database.db.select().from(travelModelRuns)).length, 1);
  assert.equal((await database.db.select().from(travelToolExecutions)).length, 3);
  const events = await repository.listSseEvents(conversation.conversation_id, 1);
  assert.equal(events.length, 4);
  assert.equal(events.at(-1)?.event_type, "turn.completed");
});

integrationTest("TravelBot discards a completed conversation and all of its durable child records", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const repository = new PostgresTravelBotRepository(database, "fake-discard-model");
  const service = new TravelBotService({
    repository,
    runtime: {
      async run() {
        return {
          proposal: {
            origin_iata: null,
            destination_iata: null,
            departure_date: null,
            passenger_count: null,
            cabin: null,
            max_total_budget: null,
            selected_offer_id: null,
            explicit_confirmation: null,
            ambiguities: [],
            requested_action: "NONE" as const,
          },
          assistant_message: "Tell me about your trip.",
        };
      },
    },
    tools: { findOffers: async () => [] },
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
  });
  const conversation = await service.createConversation({
    principal_id: travelBotFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_travelbot_discard_create_001",
    correlation_id: "corr_travelbot_discard_create_001",
  });
  await service.postMessage({
    conversation_id: conversation.conversation_id,
    content: "Help me begin a trip.",
    idempotency_key: "idem_travelbot_discard_message_001",
    correlation_id: "corr_travelbot_discard_message_001",
  });

  assert.equal(await repository.discard(conversation.conversation_id, "principal_someone_else"), "NOT_FOUND");
  assert.equal(await repository.discard(conversation.conversation_id, travelBotFixture.principal_id), "DELETED");
  assert.equal(await repository.get(conversation.conversation_id), undefined);
  assert.equal((await database.db.select().from(travelConversations)).length, 0);
  assert.equal((await database.db.select().from(travelMessages)).length, 0);
  assert.equal((await database.db.select().from(travelModelRuns)).length, 0);
  assert.equal((await database.db.select().from(travelIntentSnapshots)).length, 0);
  assert.equal((await database.db.select().from(travelSseEvents)).length, 0);
});

integrationTest("TravelBot persists distinct calls to the same tool within one model run", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const repository = new PostgresTravelBotRepository(database, "fake-repeated-tool-model");
  const conversation = await repository.create({
    principal_id: travelBotFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_repeated_tool_create_001",
    correlation_id: "corr_repeated_tool_create_001",
  }, new Date("2026-08-29T12:04:01.000Z"));
  const claimed = await repository.claimTurn({
    conversation_id: conversation.conversation_id,
    content: "I select the available offer.",
    idempotency_key: "idem_repeated_tool_message_001",
    correlation_id: "corr_repeated_tool_message_001",
  }, new Date("2026-08-29T12:04:01.000Z"));
  assert.equal(claimed.kind, "CLAIMED");
  if (claimed.kind !== "CLAIMED") return;

  await repository.recordToolExecutions(claimed.claim.run_id, [
    {
      tool_call_id: "call_model_create_checkout",
      tool_name: "create_checkout",
      status: "COMPLETED",
      arguments: { offer_id: offerCandidateFixture.offer_id },
      result: { status: "OK", reference_id: offerCandidateFixture.offer_id },
    },
    {
      tool_call_id: "call_application_create_checkout",
      tool_name: "create_checkout",
      status: "COMPLETED",
      arguments: { offer_id: offerCandidateFixture.offer_id },
      result: { checkout_id: "checkout_test_repeated_tool" },
    },
  ], new Date("2026-08-29T12:04:01.000Z"));

  const persisted = await database.db.select().from(travelToolExecutions)
    .where(eq(travelToolExecutions.runId, claimed.claim.run_id));
  assert.equal(persisted.length, 2);
});

integrationTest("TravelBot serializes concurrent messages on one conversation", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const repository = new PostgresTravelBotRepository(database, "fake-concurrency-model");
  const runtime: AgentRuntimePort = {
    async run() {
      await new Promise((resolve) => setTimeout(resolve, 75));
      return {
        proposal: {
          origin_iata: null,
          destination_iata: null,
          departure_date: null,
          passenger_count: null,
          cabin: null,
          max_total_budget: null,
          selected_offer_id: null,
          explicit_confirmation: null,
          ambiguities: [],
          requested_action: "NONE",
        },
        assistant_message: "Provide the details.",
      };
    },
  };
  const service = new TravelBotService({
    repository,
    runtime,
    tools: { findOffers: async () => [] },
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
  });
  const conversation = await service.createConversation({
    principal_id: travelBotFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_travelbot_concurrent_create_001",
    correlation_id: "corr_travelbot_concurrent_create_001",
  });
  const results = await Promise.allSettled([1, 2].map((suffix) => service.postMessage({
    conversation_id: conversation.conversation_id,
    content: `message ${suffix}`,
    idempotency_key: `idem_travelbot_concurrent_message_00${suffix}`,
    correlation_id: `corr_travelbot_concurrent_message_00${suffix}`,
  })));
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
});

integrationTest("a crashed TravelBot run lease is reclaimed with the same run and message", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const repository = new PostgresTravelBotRepository(database, "fake-restart-model");
  const startedAt = new Date("2026-08-29T12:04:01.000Z");
  const conversation = await repository.create({
    principal_id: travelBotFixture.principal_id,
    agent_id: travelBotFixture.agent_id,
    idempotency_key: "idem_travelbot_restart_create_001",
    correlation_id: "corr_travelbot_restart_create_001",
  }, startedAt);
  const command = {
    conversation_id: conversation.conversation_id,
    content: "message before restart",
    idempotency_key: "idem_travelbot_restart_message_001",
    correlation_id: "corr_travelbot_restart_message_001",
  };
  const first = await repository.claimTurn(command, startedAt);
  assert.equal(first.kind, "CLAIMED");
  await assert.rejects(repository.claimTurn(command, new Date(startedAt.getTime() + 29_000)));
  const reclaimed = await repository.claimTurn(command, new Date(startedAt.getTime() + 31_000));
  assert.equal(reclaimed.kind, "CLAIMED");
  if (first.kind === "CLAIMED" && reclaimed.kind === "CLAIMED") {
    assert.equal(reclaimed.claim.run_id, first.claim.run_id);
  }
  assert.equal((await database.db.select().from(travelMessages)).length, 1);
  assert.equal((await database.db.select().from(travelModelRuns)).length, 1);
});

integrationTest("canonical GRU to COR chat completes through Verify, fake payment, receipt and audit", async () => {
  assert.ok(database);
  const now = new Date("2026-08-29T12:04:01.000Z");
  const clock = { now: () => now };
  const authoritySigner = new EphemeralEs256Signer();
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const registry = new DrizzleAgentIdentityRegistry(database, clock, ledger);
  const agentSigner = await createTestAgentSigner();
  await database.db.insert(principals).values({
    principalId: agentSigner.agent.principal_id,
    displayName: "TravelBot test operator",
    createdAt: now,
    updatedAt: now,
  });
  await registry.register({
    agent_id: agentSigner.agent.agent_id,
    principal_id: agentSigner.agent.principal_id,
    display_name: agentSigner.agent.display_name,
    status: agentSigner.agent.status,
    build_fingerprint: agentSigner.agent.build_fingerprint,
    verification_key: agentSigner.agent.verification_key,
  }, {
    idempotencyKey: "idem_chat_happy_agent_001",
    correlationId: "corr_chat_happy_agent_001",
  });
  const credentialId = "credential_chat_happy_001";
  await database.db.insert(paymentCredentials).values({
    credentialId,
    principalId: agentSigner.agent.principal_id,
    display: "Visa •••• 4242",
  });
  const merchant = new VuelaYaMerchant(authoritySigner, clock);
  const mandatesService = new MandateService(database, authoritySigner, clock, ledger);
  const verifier = new VerifyOrchestrator({
    agentRegistry: registry,
    agentVerifier: new AgentRequestVerifier(registry, clock),
    mandateLoader: mandatesService,
    mandateSignatureVerifier: authoritySigner,
    checkoutVerifier: {
      async verify(checkout) {
        try {
          return canonicalizeJson(merchant.getCheckout(checkout.terms.checkout_id)) === canonicalizeJson(checkout)
            && await verifyCheckoutIntegrity(checkout, authoritySigner);
        } catch {
          return false;
        }
      },
    },
    reservationStore: new PostgresAuthorizationReservationStore(database, ledger),
    clock,
    humanApprovalRequired: () => false,
  });
  const receipts = new PostgresReceiptStore(database, ledger);
  const paymentService = new PaymentService(
    new PostgresPaymentClaimStore(database, clock, ledger),
    new FakePaymentExecutor({ outcome: "APPROVED", occurredAt: now.toISOString() }),
  );
  const tools = new ApplicationTravelBotTools({
    merchant,
    mandates: mandatesService,
    verify: verifier,
    payments: paymentService,
    receipts,
    proofFactory: {
      sign: async (input) => agentSigner.sign(input.body, {
        method: "POST",
        route: "/verify",
        agent_id: input.agent_id,
        nonce: input.nonce,
        issued_at: input.issued_at,
        expires_at: input.expires_at,
      }),
    },
    clock,
    credentialId,
    audit: ledger,
  });
  const runtime: AgentRuntimePort = {
    async run(request) {
      const base = {
        origin_iata: null,
        destination_iata: null,
        departure_date: null,
        passenger_count: null,
        cabin: null,
        max_total_budget: null,
        selected_offer_id: null,
        explicit_confirmation: null,
        ambiguities: [],
        requested_action: "NONE" as const,
      };
      if (request.user_message === "complete request") {
        return {
          proposal: {
            ...base,
            origin_iata: "GRU",
            destination_iata: "COR",
            departure_date: "2026-09-15",
            passenger_count: 1,
            cabin: "ECONOMY",
            max_total_budget: { amount: 15000, currency: "USD" },
            requested_action: "FIND_OFFERS",
          },
          assistant_message: "Searching for an offer.",
        };
      }
      if (request.user_message === "seleciono") {
        return {
          proposal: {
            ...base,
            selected_offer_id: offerCandidateFixture.offer_id,
            requested_action: "CREATE_CHECKOUT",
          },
          assistant_message: "Preparando checkout.",
        };
      }
      return {
        proposal: { ...base, explicit_confirmation: "CONFIRM", requested_action: "REQUEST_PURCHASE" },
        assistant_message: "Confirmado.",
      };
    },
  };
  const repository = new PostgresTravelBotRepository(database, "fake-happy-model");
  const chat = new TravelBotService({ repository, runtime, tools, clock, model: "fake-happy-model" });
  const conversation = await chat.createConversation({
    principal_id: agentSigner.agent.principal_id,
    agent_id: agentSigner.agent.agent_id,
    idempotency_key: "idem_chat_happy_create_001",
    correlation_id: "corr_chat_happy_create_001",
  });
  await chat.postMessage({
    conversation_id: conversation.conversation_id,
    content: "complete request",
    idempotency_key: "idem_chat_happy_request_001",
    correlation_id: "corr_chat_happy_request_001",
  });
  const completed = await chat.postMessage({
    conversation_id: conversation.conversation_id,
    content: "confirmo",
    idempotency_key: "idem_chat_happy_confirm_001",
    correlation_id: "corr_chat_happy_confirm_001",
  });
  assert.equal(completed.state, "COMPLETED");
  assert.ok(completed.operation.authorization_id);
  assert.ok(completed.operation.receipt_id);
  assert.equal((await database.db.select().from(payments)).length, 1);
  assert.equal((await database.db.select().from(orders)).length, 1);
  const timeline = await ledger.getTimeline("corr_chat_happy_confirm_001");
  assert.equal(timeline.events.some(({ event_type: type }) => type === "payment.approved"), true);
  assert.equal(timeline.events.some(({ event_type: type }) => type === "order.confirmed"), true);
});

integrationTest("a successful transaction commits all writes", async () => {
  assert.ok(database);

  await database.transaction(async (tx) => {
    await tx.insert(principals).values({
      principalId: "principal_commit",
      displayName: "Commit test principal",
      createdAt: new Date("2026-08-29T12:00:00.000Z"),
      updatedAt: new Date("2026-08-29T12:00:00.000Z"),
    });
    await tx.insert(paymentCredentials).values({
      credentialId: "credential_commit",
      principalId: "principal_commit",
      display: "Visa •••• 4242",
    });
  });

  const rows = await database.db
    .select()
    .from(paymentCredentials)
    .where(eq(paymentCredentials.credentialId, "credential_commit"));
  assert.equal(rows.length, 1);
});

integrationTest("agent registration is persistent, readable and idempotent", async () => {
  assert.ok(database);
  const registry = new DrizzleAgentIdentityRegistry(database, {
    now: () => new Date(travelBotFixture.created_at),
  });
  await database.db.insert(principals).values({
    principalId: travelBotFixture.principal_id,
    displayName: "Marta",
    createdAt: new Date(travelBotFixture.created_at),
    updatedAt: new Date(travelBotFixture.created_at),
  });
  const registration = {
    agent_id: travelBotFixture.agent_id,
    principal_id: travelBotFixture.principal_id,
    display_name: travelBotFixture.display_name,
    status: travelBotFixture.status,
    build_fingerprint: travelBotFixture.build_fingerprint,
    verification_key: travelBotFixture.verification_key,
  };
  const context = {
    correlationId: "corr_register_agent_001",
    idempotencyKey: "idem_register_agent_001",
  };

  const first = await registry.register(registration, context);
  const repeated = await registry.register(registration, context);
  const read = await registry.get(travelBotFixture.agent_id);

  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.deepEqual(first.agent, travelBotFixture);
  assert.deepEqual(repeated.agent, travelBotFixture);
  assert.deepEqual(read, travelBotFixture);
  await assert.rejects(
    registry.register({ ...registration, display_name: "Different payload" }, context),
    (error: unknown) => (
      error instanceof Error
      && "code" in error
      && error.code === "idempotency_conflict"
    ),
  );
});

integrationTest("a failed transaction rolls back all writes", async () => {
  assert.ok(database);

  await assert.rejects(
    database.transaction(async (tx) => {
      await tx.insert(principals).values({
        principalId: "principal_rollback",
        displayName: "Rollback test principal",
        createdAt: new Date("2026-08-29T12:00:00.000Z"),
        updatedAt: new Date("2026-08-29T12:00:00.000Z"),
      });
      await tx.insert(paymentCredentials).values({
        credentialId: "credential_rollback",
        principalId: "principal_rollback",
        display: "Visa •••• 4242",
      });
      throw new Error("force rollback");
    }),
    /force rollback/,
  );

  const rows = await database.db
    .select()
    .from(paymentCredentials)
    .where(eq(paymentCredentials.credentialId, "credential_rollback"));
  assert.equal(rows.length, 0);
});

integrationTest("a duplicate agent nonce is rejected as replay", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  const nonce = {
    agentId: agentRequestProofFixture.payload.agent_id,
    nonce: agentRequestProofFixture.payload.nonce,
    mandateId: mandateFixture.terms.mandate_id,
    checkoutId: checkoutTermsFixture.checkout_id,
    checkoutHash: normalizedCheckoutFixture.checkout_hash,
    payloadHash: agentRequestProofFixture.payload_hash,
    correlationId: "corr_nonce_001",
    issuedAt: new Date(agentRequestProofFixture.payload.issued_at),
    expiresAt: new Date(agentRequestProofFixture.payload.expires_at),
  };

  await database.db.insert(nonces).values(nonce);
  await assert.rejects(
    database.db.insert(nonces).values(nonce),
    (error: unknown) => hasPostgresCode(error, "23505"),
  );
});

integrationTest("a duplicate payment authorization or provider UUID is rejected", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  const paymentAttempt = {
    paymentAttemptId: "payment_attempt_001",
    authorizationId: reservedAuthorizationFixture.authorization_id,
    credentialId: mandateFixture.terms.credential_id,
    amount: reservedAuthorizationFixture.reserved_amount.amount,
    currency: reservedAuthorizationFixture.reserved_amount.currency,
    correlationId: "corr_payment_001",
    providerIdempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  };

  await database.db.insert(payments).values(paymentAttempt);
  await assert.rejects(
    database.db.insert(payments).values({
      ...paymentAttempt,
      paymentAttemptId: "payment_attempt_002",
      providerIdempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
    }),
    (error: unknown) => hasPostgresCode(error, "23505"),
  );

  const originalCheckout = (await database.db.select().from(checkouts))[0]!;
  const secondCheckoutHash = sha256CanonicalJson({ checkout_id: "checkout_payment_constraint_002" });
  await database.db.insert(checkouts).values({
    ...originalCheckout,
    checkoutId: "checkout_payment_constraint_002",
    checkoutHash: secondCheckoutHash,
    correlationId: "corr_payment_constraint_checkout_002",
    idempotencyKey: "idem_payment_constraint_checkout_002",
  });
  const originalAuthorization = (await database.db.select().from(authorizations))[0]!;
  await database.db.insert(authorizations).values({
    ...originalAuthorization,
    authorizationId: "authorization_payment_constraint_002",
    checkoutId: "checkout_payment_constraint_002",
    checkoutHash: secondCheckoutHash,
    proofReference: "proof_payment_constraint_002",
    proofHash: sha256CanonicalJson({ proof: 2 }),
    requestHash: sha256CanonicalJson({ request: 2 }),
    evidenceHash: sha256CanonicalJson({ evidence: 2 }),
    correlationId: "corr_payment_constraint_authorization_002",
    idempotencyKey: "idem_payment_constraint_authorization_002",
  });
  await assert.rejects(
    database.db.insert(payments).values({
      ...paymentAttempt,
      paymentAttemptId: "payment_attempt_003",
      authorizationId: "authorization_payment_constraint_002",
    }),
    (error: unknown) => hasPostgresCode(error, "23505"),
  );
});

integrationTest("foreign keys reject a mandate for an unknown agent", async () => {
  assert.ok(database);

  await database.db.insert(principals).values({
    principalId: mandateFixture.terms.principal_id,
    displayName: "Marta",
    createdAt: new Date(mandateFixture.created_at),
    updatedAt: new Date(mandateFixture.created_at),
  });
  await database.db.insert(paymentCredentials).values({
    credentialId: mandateFixture.terms.credential_id,
    principalId: mandateFixture.terms.principal_id,
    display: "Visa •••• 4242",
  });

  await assert.rejects(
    database.db.insert(mandates).values({
      ...activeMandateRow(),
      correlationId: "corr_orphan_mandate_001",
      idempotencyKey: "idem_orphan_mandate_001",
    }),
    (error: unknown) => hasPostgresCode(error, "23503"),
  );
});

integrationTest("state and monetary checks reject invalid rows", async () => {
  assert.ok(database);

  await database.db.insert(principals).values({
    principalId: "principal_invalid_state",
    displayName: "Invalid state test principal",
    createdAt: new Date("2026-08-29T12:00:00.000Z"),
    updatedAt: new Date("2026-08-29T12:00:00.000Z"),
  });

  await assert.rejects(
    database.db.insert(agents).values({
      agentId: "agent_invalid_state",
      principalId: "principal_invalid_state",
      displayName: "Invalid agent",
      status: "UNKNOWN_STATE",
      buildFingerprint: "not-a-fingerprint",
      verificationKeyId: "key_invalid_state",
      verificationAlgorithm: "ES256",
      verificationPublicKey: "public_key_material_for_test_only",
      correlationId: "corr_invalid_state_001",
      idempotencyKey: "idem_invalid_state_001",
      createdAt: new Date("2026-08-29T12:00:00.000Z"),
    }),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );

  await assert.rejects(
    database.db.insert(checkouts).values({
      checkoutId: "checkout_negative_amount",
      merchantId: checkoutTermsFixture.merchant_id,
      merchantUrl: checkoutTermsFixture.merchant_url,
      items: [...checkoutTermsFixture.items],
      totalAmount: -1,
      currency: checkoutTermsFixture.total.currency,
      fulfillment: checkoutTermsFixture.fulfillment,
      protocolName: checkoutTermsFixture.protocol.name,
      protocolVersion: checkoutTermsFixture.protocol.version,
      checkoutHash: "b".repeat(64),
      merchantSignatureAlgorithm: normalizedCheckoutFixture.merchant_signature.algorithm,
      merchantSignatureKeyId: normalizedCheckoutFixture.merchant_signature.key_id,
      merchantSignatureValue: normalizedCheckoutFixture.merchant_signature.value,
      correlationId: "corr_negative_amount_001",
      idempotencyKey: "idem_negative_amount_001",
      createdAt: new Date(checkoutTermsFixture.created_at),
      expiresAt: new Date(checkoutTermsFixture.expires_at),
    }),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
});

integrationTest("agent table enforces build fingerprint and active ES256 integrity", async () => {
  assert.ok(database);
  await database.db.insert(principals).values({
    principalId: "principal_integrity_test",
    displayName: "Integrity test principal",
    createdAt: new Date(travelBotFixture.created_at),
    updatedAt: new Date(travelBotFixture.created_at),
  });
  const validAgentRow = {
    agentId: "agent_integrity_test",
    principalId: "principal_integrity_test",
    displayName: "Integrity test agent",
    status: "ACTIVE",
    buildFingerprint: travelBotFixture.build_fingerprint,
    verificationKeyId: "key_integrity_test",
    verificationAlgorithm: "ES256",
    verificationPublicKey: canonicalizeJson(travelBotFixture.verification_key.public_jwk),
    correlationId: "corr_agent_integrity_001",
    idempotencyKey: "idem_agent_integrity_001",
    createdAt: new Date(travelBotFixture.created_at),
  };

  await assert.rejects(
    database.db.insert(agents).values({
      ...validAgentRow,
      buildFingerprint: "invalid",
    }),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
  await assert.rejects(
    database.db.insert(agents).values({
      ...validAgentRow,
      verificationAlgorithm: "EdDSA",
    }),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
});

integrationTest("SELECT FOR UPDATE serializes concurrent mandate access", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  let releaseFirstLock: () => void = () => undefined;
  const holdFirstLock = new Promise<void>((resolve) => {
    releaseFirstLock = resolve;
  });
  let firstLockAcquired: () => void = () => undefined;
  const firstLocked = new Promise<void>((resolve) => {
    firstLockAcquired = resolve;
  });

  const firstTransaction = database.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT mandate_id
      FROM mandates
      WHERE mandate_id = ${mandateFixture.terms.mandate_id}
      FOR UPDATE
    `);
    firstLockAcquired();
    await holdFirstLock;
  });
  await firstLocked;

  let secondStarted: () => void = () => undefined;
  const secondAttempted = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  let secondLockAcquired = false;
  const secondTransaction = database.transaction(async (tx) => {
    secondStarted();
    await tx.execute(sql`
      SELECT mandate_id
      FROM mandates
      WHERE mandate_id = ${mandateFixture.terms.mandate_id}
      FOR UPDATE
    `);
    secondLockAcquired = true;
  });

  await secondAttempted;
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(secondLockAcquired, false);

  releaseFirstLock();
  await Promise.all([firstTransaction, secondTransaction]);
  assert.equal(secondLockAcquired, true);
});

integrationTest("a mandate draft is created idempotently and read without signing authority", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedMandateReferences();

  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T11:59:00.000Z") },
  });
  t.after(async () => app.close());

  const request = mandateDraftRequest("mandate_draft_api_001");
  const headers = {
    "idempotency-key": "idem_create_mandate_draft_001",
    "x-correlation-id": "corr_create_mandate_draft_001",
  };

  const created = await app.inject({ method: "POST", url: "/v1/mandates", headers, payload: request });
  assert.equal(created.statusCode, 201);
  const mandate = mandateSchema.parse(created.json());
  assert.equal(mandate.status, "DRAFT");
  assert.equal(mandate.terms.version, 1);
  assert.equal(mandate.authority_valid, false);
  assert.equal("terms_hash" in mandate, false);
  assert.equal("principal_signature" in mandate, false);
  assert.deepEqual(mandate.payment_credential, {
    credential_id: mandateFixture.terms.credential_id,
    display: "Visa •••• 4242",
  });

  const repeated = await app.inject({ method: "POST", url: "/v1/mandates", headers, payload: request });
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), mandate);

  const read = await app.inject({ method: "GET", url: `/v1/mandates/${mandate.terms.mandate_id}` });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.json(), mandate);
});

integrationTest("a conditional mandate preserves the liveness-bound flight window and passengers", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedMandateReferences();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-30T12:00:00.000Z") },
  });
  t.after(async () => app.close());
  const flightConstraints = {
    departure_not_before: "2026-09-01T00:00:00.000Z",
    departure_not_after: "2026-09-30T23:59:59.999Z",
    passenger_count: 2,
  };

  const created = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: { "idempotency-key": "idem_conditional_mandate_create_001" },
    payload: mandateDraftRequest("mandate_conditional_watch_001", {
      flight_constraints: flightConstraints,
      valid_from: "2026-08-30T12:00:00.000Z",
      expires_at: "2026-09-30T23:59:59.999Z",
    }),
  });

  assert.equal(created.statusCode, 201);
  assert.deepEqual(mandateSchema.parse(created.json()).terms.flight_constraints, flightConstraints);
  const read = await app.inject({ method: "GET", url: "/v1/mandates/mandate_conditional_watch_001" });
  assert.deepEqual(mandateSchema.parse(read.json()).terms.flight_constraints, flightConstraints);
});

integrationTest("an automatic travel watch survives a service restart while awaiting liveness", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const watchNow = new Date("2026-08-30T12:00:00.000Z");
  const conversationId = "6f5ca3b3-1eca-4bde-9bc3-3923bf56350b";
  await database.db.insert(travelConversations).values({
    conversationId,
    principalId: mandateFixture.terms.principal_id,
    agentId: mandateFixture.terms.agent_id,
    state: "READY_TO_SEARCH",
    version: 1,
    intent: {
      origin_iata: "GRU",
      destination_iata: "COR",
      departure_date: "2026-09",
      passenger_count: 2,
      cabin: "ECONOMY",
      max_total_budget: { amount: 150_000, currency: "BRL" },
      selected_offer_id: null,
      confirmation: null,
    },
    offers: [],
    creationRequestHash: "a".repeat(64),
    creationIdempotencyKey: "idem_watch_conversation_seed_001",
    correlationId: "corr_watch_conversation_seed_001",
    createdAt: watchNow,
    updatedAt: watchNow,
  });
  const conversations = new PostgresTravelBotRepository(database, "fake-test-model");
  const mandatesService = new MandateService(database, new EphemeralEs256Signer(), { now: () => watchNow });
  const firstService = new TravelWatchService({
    repository: new PostgresTravelWatchRepository(database),
    conversations,
    mandates: mandatesService,
    clock: { now: () => watchNow },
    credentialId: mandateFixture.terms.credential_id,
    merchantId: "merchant_vuelaya",
  });

  const created = await firstService.create({
    conversation_id: conversationId,
    mode: "AUTO_PURCHASE",
    expires_at: "2026-09-30T23:59:59.999Z",
    idempotency_key: "idem_postgres_watch_create_001",
    correlation_id: "corr_postgres_watch_create_001",
  });
  const restartedService = new TravelWatchService({
    repository: new PostgresTravelWatchRepository(database),
    conversations,
    mandates: mandatesService,
    clock: { now: () => watchNow },
    credentialId: mandateFixture.terms.credential_id,
    merchantId: "merchant_vuelaya",
  });

  assert.equal(created.status, "AWAITING_LIVENESS");
  assert.deepEqual(await restartedService.get(created.watch_id), created);

  const firstRepository = new PostgresTravelWatchRepository(database);
  await firstRepository.activate(created.watch_id, watchNow);
  assert.equal((await firstRepository.claimDue(watchNow))?.status, "CHECKING");
  const matchedOffer = {
    ...structuredClone(offerCandidateFixture),
    offer_id: "offer_watch_restart_match_001",
    total: { amount: 70_000, currency: "BRL" },
    items: [{
      ...structuredClone(offerCandidateFixture.items[0]!),
      unit_price: { amount: 70_000, currency: "BRL" },
      total: { amount: 70_000, currency: "BRL" },
    }],
    fulfillment: {
      ...structuredClone(offerCandidateFixture.fulfillment),
      departure_at: "2026-09-15T10:00:00.000Z",
      arrival_at: "2026-09-15T13:05:00.000Z",
    },
    available_until: "2026-08-30T12:15:00.000Z",
  };
  await firstRepository.stagePurchase(created.watch_id, matchedOffer, watchNow);

  const resumedAt = new Date("2026-08-30T12:01:01.000Z");
  const restartedRepository = new PostgresTravelWatchRepository(database);
  const worker = new TravelWatchWorker({
    repository: restartedRepository,
    search: { search: async () => assert.fail("a reclaimed purchase must reuse its persisted offer") },
    purchases: {
      async purchase({ watch, offer }) {
        assert.equal(watch.attempt_count, 2);
        assert.deepEqual(offer, matchedOffer);
        return { status: "COMPLETED", receipt_id: "receipt_watch_restart_001" };
      },
    },
    clock: { now: () => resumedAt },
  });
  assert.equal(await worker.runDue(), 1);
  const completed = await restartedRepository.get(created.watch_id);
  assert.equal(completed?.status, "COMPLETED");
  assert.deepEqual(completed?.matched_offer, matchedOffer);
  assert.equal(completed?.receipt_id, "receipt_watch_restart_001");
});

integrationTest("activating a draft signs its canonical immutable terms exactly once", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedMandateReferences();
  const signer = new EphemeralEs256Signer();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    signer,
    clock: { now: () => new Date("2026-08-29T12:00:00.000Z") },
  });
  t.after(async () => app.close());

  const draftRequest = mandateDraftRequest("mandate_activation_api_001");
  const created = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: { "idempotency-key": "idem_activation_create_001" },
    payload: draftRequest,
  });
  assert.equal(created.statusCode, 201);

  const activationHeaders = {
    "idempotency-key": "idem_activation_apply_001",
    "x-correlation-id": "corr_activation_apply_001",
  };
  const activatedResponse = await app.inject({
    method: "POST",
    url: `/v1/mandates/${draftRequest.mandate_id}/activate`,
    headers: activationHeaders,
    payload: {},
  });
  assert.equal(activatedResponse.statusCode, 200);
  const activated = mandateSchema.parse(activatedResponse.json());
  assert.equal(activated.status, "ACTIVE");
  if (activated.status !== "ACTIVE") assert.fail("mandate should be active");
  assert.equal(activated.authority_valid, true);
  assert.equal(activated.terms_hash, sha256CanonicalJson(activated.terms));
  assert.equal(
    await signer.verify(
      new TextEncoder().encode(canonicalizeJson(activated.terms)),
      activated.principal_signature,
    ),
    true,
  );

  const repeated = await app.inject({
    method: "POST",
    url: `/v1/mandates/${draftRequest.mandate_id}/activate`,
    headers: activationHeaders,
    payload: {},
  });
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), activated);

  const secondActivation = await app.inject({
    method: "POST",
    url: `/v1/mandates/${draftRequest.mandate_id}/activate`,
    headers: { "idempotency-key": "idem_activation_apply_002" },
    payload: {},
  });
  assert.equal(secondActivation.statusCode, 409);
  assert.equal(secondActivation.json().error.code, "mandate_not_active");
});

integrationTest("revocation is immediately visible, idempotent and emits one audit event", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  await seedAuthorizationGraph();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:05:00.000Z") },
  });
  t.after(async () => app.close());

  const url = `/v1/mandates/${mandateFixture.terms.mandate_id}/revoke`;
  const first = await app.inject({
    method: "POST",
    url,
    headers: {
      "idempotency-key": "idem_revoke_mandate_001",
      "x-correlation-id": "corr_revoke_mandate_001",
    },
    payload: {},
  });
  assert.equal(first.statusCode, 200);
  const revoked = mandateSchema.parse(first.json());
  assert.equal(revoked.status, "REVOKED");
  if (revoked.status !== "REVOKED") assert.fail("mandate should be revoked");
  assert.equal(revoked.authority_valid, false);
  assert.equal(revoked.revoked_at, "2026-08-29T12:05:00.000Z");

  const repeated = await app.inject({
    method: "POST",
    url,
    headers: { "idempotency-key": "idem_revoke_mandate_001" },
    payload: {},
  });
  const repeatedWithNewKey = await app.inject({
    method: "POST",
    url,
    headers: { "idempotency-key": "idem_revoke_mandate_002" },
    payload: {},
  });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeatedWithNewKey.statusCode, 200);
  assert.deepEqual(repeated.json(), revoked);
  assert.deepEqual(repeatedWithNewKey.json(), revoked);

  const read = await app.inject({ method: "GET", url: `/v1/mandates/${mandateFixture.terms.mandate_id}` });
  assert.deepEqual(read.json(), revoked);
  const events = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.subjectId, mandateFixture.terms.mandate_id));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "mandate.revoked");
  assert.equal(events[0]?.correlationId, "corr_revoke_mandate_001");
  assert.equal(events[0]?.sanitizedPayload?.payment_executor_called, false);
  assert.match(events[0]?.payloadHash ?? "", /^[a-f0-9]{64}$/);
  assert.match(events[0]?.eventHash ?? "", /^[a-f0-9]{64}$/);
});

integrationTest("revocation and its audit event roll back together when either write fails", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(administrationPool);
  assert.ok(database);
  await seedAuthorizationGraph();
  await administrationPool.query(`
    CREATE FUNCTION reject_mandate_revoke_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'mandate.revoked' THEN
        RAISE EXCEPTION 'forced audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_mandate_revoke_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_mandate_revoke_audit();
  `);
  t.after(async () => {
    await administrationPool?.query("DROP TRIGGER IF EXISTS reject_mandate_revoke_audit_trigger ON audit_events");
    await administrationPool?.query("DROP FUNCTION IF EXISTS reject_mandate_revoke_audit()");
  });

  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:05:00.000Z") },
  });
  t.after(async () => app.close());
  const failed = await app.inject({
    method: "POST",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}/revoke`,
    headers: { "idempotency-key": "idem_revoke_forced_rollback" },
    payload: {},
  });
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.json().error.code, "internal_error");

  const read = await app.inject({
    method: "GET",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}`,
  });
  const mandate = mandateSchema.parse(read.json());
  assert.equal(mandate.status, "ACTIVE");
  const events = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.subjectId, mandateFixture.terms.mandate_id));
  assert.equal(events.length, 0);
});

integrationTest("a confirmed read persists expiry and expired mandates fail closed", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  await seedAuthorizationGraph();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date(mandateFixture.terms.expires_at) },
  });
  t.after(async () => app.close());

  const read = await app.inject({
    method: "GET",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}`,
  });
  assert.equal(read.statusCode, 200);
  const expired = mandateSchema.parse(read.json());
  assert.equal(expired.status, "EXPIRED");
  assert.equal(expired.authority_valid, false);

  const rows = await database.db
    .select({ status: mandates.status })
    .from(mandates)
    .where(eq(mandates.mandateId, mandateFixture.terms.mandate_id));
  assert.deepEqual(rows, [{ status: "EXPIRED" }]);

  const revoke = await app.inject({
    method: "POST",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}/revoke`,
    headers: { "idempotency-key": "idem_revoke_expired_mandate" },
    payload: {},
  });
  assert.equal(revoke.statusCode, 409);
  assert.equal(revoke.json().error.code, "mandate_expired");
});

integrationTest("Verify can load only currently active mandates and consumed mandates fail closed", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();
  const service = new MandateService(
    database,
    new EphemeralEs256Signer(),
    { now: () => new Date("2026-08-29T12:05:00.000Z") },
  );

  const active = await service.loadActiveMandate(mandateFixture.terms.mandate_id);
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.authority_valid, true);
  assert.equal(active.terms_hash, mandateFixture.terms_hash);

  await database.db
    .update(mandates)
    .set({ status: "CONSUMED" })
    .where(eq(mandates.mandateId, mandateFixture.terms.mandate_id));
  await assert.rejects(
    service.loadActiveMandate(mandateFixture.terms.mandate_id),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "mandate_not_active",
  );
  const consumed = await service.getMandate(mandateFixture.terms.mandate_id);
  assert.equal(consumed.status, "CONSUMED");
  assert.equal(consumed.authority_valid, false);
});

integrationTest("a changed mandate creates a linked version without mutating active authority", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedAuthorizationGraph();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:05:00.000Z") },
  });
  t.after(async () => app.close());

  const newVersion = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: { "idempotency-key": "idem_create_mandate_version_002" },
    payload: mandateDraftRequest("mandate_marta_travel_002", {
      supersedes_mandate_id: mandateFixture.terms.mandate_id,
      allowed_merchant_ids: [],
      allowed_merchant_categories: ["airline"],
      cabin: "BUSINESS",
      max_per_purchase: { amount: 20000, currency: "USD" },
      max_aggregate: { amount: 40000, currency: "USD" },
      max_uses: 2,
    }),
  });
  assert.equal(newVersion.statusCode, 201);
  const draft = mandateSchema.parse(newVersion.json());
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.terms.version, 2);
  assert.equal(draft.terms.supersedes_mandate_id, mandateFixture.terms.mandate_id);
  assert.equal(draft.terms.cabin, "BUSINESS");

  const original = await app.inject({
    method: "GET",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}`,
  });
  const originalMandate = mandateSchema.parse(original.json());
  assert.equal(originalMandate.status, "ACTIVE");
  assert.equal(originalMandate.terms.version, 1);
  assert.equal(originalMandate.terms.cabin, "ECONOMY");

  const mutation = await app.inject({
    method: "PATCH",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}`,
    headers: { "idempotency-key": "idem_mutate_active_mandate" },
    payload: { cabin: "BUSINESS" },
  });
  assert.equal(mutation.statusCode, 404);
});

integrationTest("mandate activation fails closed until biometric consent matches the exact immutable terms hash", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const now = new Date("2026-08-29T12:05:00.000Z");
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  let observedTermsHash: string | undefined;
  const service = new MandateService(
    database,
    new EphemeralEs256Signer(),
    { now: () => now },
    ledger,
    undefined,
    {
      async consumeInTransaction(_transaction, input) {
        observedTermsHash = input.termsHash;
        throw new PublicApiError(403, "biometric_consent_required", "Biometric consent is required before mandate activation");
      },
    },
  );
  const input = mandateDraftRequest("mandate_biometric_gate_001");
  const { mandate } = await service.createDraft(input, "idem_biometric_gate_create_001", "corr_biometric_gate_001");

  await assert.rejects(
    service.activate(input.mandate_id, "idem_biometric_gate_activate_001", "corr_biometric_gate_001"),
    (error: unknown) => error instanceof PublicApiError && error.code === "biometric_consent_required",
  );
  assert.equal(observedTermsHash, sha256CanonicalJson(mandate.terms));
  assert.equal((await service.getMandate(input.mandate_id)).status, "DRAFT");
});

integrationTest("a verified biometric consent is consumed in the same transaction that activates the bound mandate", async () => {
  assert.ok(database);
  await seedMandateReferences();
  const now = new Date("2026-08-29T12:05:00.000Z");
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const service = new MandateService(
    database,
    new EphemeralEs256Signer(),
    { now: () => now },
    ledger,
    undefined,
    {
      async consumeInTransaction(_transaction, input) {
        return {
          consentId: "bioconsent_verified_001",
          evidenceHash: sha256CanonicalJson({ terms_hash: input.termsHash, result: "VERIFIED" }),
        };
      },
    },
  );
  const input = mandateDraftRequest("mandate_biometric_gate_002");
  await service.createDraft(input, "idem_biometric_gate_create_002", "corr_biometric_gate_002");
  const active = await service.activate(input.mandate_id, "idem_biometric_gate_activate_002", "corr_biometric_gate_002");

  assert.equal(active.status, "ACTIVE");
  const timeline = await ledger.getTimeline("corr_biometric_gate_002");
  const activation = timeline.events.find(({ event_type: eventType }) => eventType === "mandate.activated");
  assert.equal(activation?.payload?.biometric_consent_id, "bioconsent_verified_001");
  assert.equal(activation?.payload?.terms_hash, sha256CanonicalJson(active.terms));
});

integrationTest("mandate responses defensively mask malformed credential displays", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  await seedAuthorizationGraph();
  const unsafeDisplay = "4242".repeat(4);
  await database.db
    .update(paymentCredentials)
    .set({ display: unsafeDisplay })
    .where(eq(paymentCredentials.credentialId, mandateFixture.terms.credential_id));
  const app = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/v1/mandates/${mandateFixture.terms.mandate_id}`,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes(unsafeDisplay), false);
  assert.equal(response.json().payment_credential.display, "Payment •••• 4242");
});

integrationTest("PostgreSQL prevents mutation of activated terms and rejected state transitions", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  await assert.rejects(
    database.db
      .update(mandates)
      .set({ cabin: "BUSINESS" })
      .where(eq(mandates.mandateId, mandateFixture.terms.mandate_id)),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
  await database.db
    .update(mandates)
    .set({ status: "CONSUMED" })
    .where(eq(mandates.mandateId, mandateFixture.terms.mandate_id));
  await assert.rejects(
    database.db
      .update(mandates)
      .set({ status: "ACTIVE" })
      .where(eq(mandates.mandateId, mandateFixture.terms.mandate_id)),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
});

integrationTest("an active row whose hash does not bind its stored terms fails closed", async () => {
  assert.ok(database);
  await seedAuthorizationGraph("f".repeat(64));
  const service = new MandateService(
    database,
    new EphemeralEs256Signer(),
    { now: () => new Date("2026-08-29T12:05:00.000Z") },
  );

  const inconsistent = await service.getMandate(mandateFixture.terms.mandate_id);
  assert.equal(inconsistent.status, "ACTIVE");
  assert.equal(inconsistent.authority_valid, false);
  await assert.rejects(
    service.loadActiveMandate(mandateFixture.terms.mandate_id),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "mandate_not_active",
  );
});

integrationTest("mandate APIs reject unknown, sensitive and invalid scope fields without echoing them", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedMandateReferences();
  const app = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
  t.after(async () => app.close());
  const valid = mandateDraftRequest("mandate_validation_001");
  const secret = "sensitive-value-must-not-be-echoed";
  const unknown = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: { "idempotency-key": "idem_validation_unknown_001" },
    payload: { ...valid, vaulted_token: secret, cvv: secret },
  });
  assert.equal(unknown.statusCode, 400);
  assert.equal(unknown.json().error.code, "validation_error");
  assert.equal(unknown.body.includes(secret), false);

  const invalidScopes = [
    { allowed_merchant_ids: [], allowed_merchant_categories: [] },
    { route: { origin: "GRU", destination: "GRU" } },
    { cabin: "PRIVATE_JET" },
    { max_aggregate: { amount: 100, currency: "USD" } },
    { max_aggregate: { amount: 20000, currency: "BRL" } },
    { max_uses: 0 },
    { expires_at: valid.valid_from },
  ];
  for (const [index, mutation] of invalidScopes.entries()) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/mandates",
      headers: { "idempotency-key": `idem_invalid_scope_${index}` },
      payload: { ...valid, mandate_id: `mandate_invalid_scope_${index}`, ...mutation },
    });
    assert.equal(response.statusCode, 400, `invalid scope ${index} should be rejected`);
    assert.equal(response.json().error.code, "validation_error");
  }
});

integrationTest("mandate mutation retries fail closed on conflicts and expired or draft states", async (t) => {
  assert.ok(testDatabaseUrl);
  await seedMandateReferences();
  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date(mandateFixture.terms.expires_at) },
  });
  t.after(async () => app.close());
  const request = mandateDraftRequest("mandate_expired_draft_001");
  const createHeaders = { "idempotency-key": "idem_expired_draft_create" };
  const created = await app.inject({ method: "POST", url: "/v1/mandates", headers: createHeaders, payload: request });
  assert.equal(created.statusCode, 201);

  const conflict = await app.inject({
    method: "POST",
    url: "/v1/mandates",
    headers: createHeaders,
    payload: { ...request, max_uses: 2 },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, "idempotency_conflict");

  const invalidActivation = await app.inject({
    method: "POST",
    url: `/v1/mandates/${request.mandate_id}/activate`,
    headers: { "idempotency-key": "idem_expired_draft_activate_bad" },
    payload: { injected: true },
  });
  assert.equal(invalidActivation.statusCode, 400);
  assert.equal(invalidActivation.json().error.code, "validation_error");

  const expiredActivation = await app.inject({
    method: "POST",
    url: `/v1/mandates/${request.mandate_id}/activate`,
    headers: { "idempotency-key": "idem_expired_draft_activate" },
    payload: {},
  });
  assert.equal(expiredActivation.statusCode, 409);
  assert.equal(expiredActivation.json().error.code, "mandate_expired");

  const draftRevoke = await app.inject({
    method: "POST",
    url: `/v1/mandates/${request.mandate_id}/revoke`,
    headers: { "idempotency-key": "idem_expired_draft_revoke" },
    payload: {},
  });
  assert.equal(draftRevoke.statusCode, 409);
  assert.equal(draftRevoke.json().error.code, "mandate_not_active");
  const read = mandateSchema.parse((await app.inject({
    method: "GET",
    url: `/v1/mandates/${request.mandate_id}`,
  })).json());
  assert.equal(read.status, "DRAFT");
  assert.equal(read.authority_valid, false);
});

integrationTest("a valid Bound Verify request atomically creates one RESERVED authorization", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  const response = await scenario.sendVerify({
    nonce: "nonce_verify_atomic_001",
    idempotencyKey: "idem_verify_atomic_commit_001",
  });

  assert.equal(response.statusCode, 200);
  const decision = authorizationDecisionSchema.parse(response.json());
  assert.equal(decision.decision, "ALLOW");
  assert.ok(decision.authorization_id);
  const [authorizationRows, nonceRows, eventRows] = await Promise.all([
    database.db.select().from(authorizations),
    database.db.select().from(nonces),
    database.db.select().from(auditEvents).where(eq(auditEvents.subjectId, decision.authorization_id)),
  ]);
  assert.equal(authorizationRows.length, 1);
  assert.equal(authorizationRows[0]?.status, "RESERVED");
  assert.equal(nonceRows.length, 1);
  assert.equal(eventRows.length, 1);
  assert.equal(eventRows[0]?.eventType, "authorization.reserved");
});

integrationTest("two concurrent verifies for max_uses=1 create at most one reservation", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);

  const decisions = await sendConcurrentVerifies(scenario, [
    {
      nonce: "nonce_verify_concurrent_001",
      idempotencyKey: "idem_verify_concurrent_001",
    },
    {
      nonce: "nonce_verify_concurrent_002",
      idempotencyKey: "idem_verify_concurrent_002",
    },
  ]);

  assert.deepEqual(decisions.map(({ decision }) => decision).sort(), ["ALLOW", "DENY"]);
  assert.equal(
    decisions.some(({ reasons }) => reasons.includes("usage_limit_exceeded")),
    true,
  );
  const rows = await database.db.select().from(authorizations);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "RESERVED");
});

integrationTest("two concurrent requests with the same nonce return ALLOW and replay_detected", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t, { maxUses: 2, maxAggregateAmount: 30000 });

  const decisions = await sendConcurrentVerifies(scenario, [
    {
      nonce: "nonce_verify_concurrent_replay",
      idempotencyKey: "idem_verify_concurrent_replay_001",
    },
    {
      nonce: "nonce_verify_concurrent_replay",
      idempotencyKey: "idem_verify_concurrent_replay_002",
    },
  ]);

  assert.deepEqual(decisions.map(({ decision }) => decision).sort(), ["ALLOW", "DENY"]);
  assert.equal(decisions.some(({ reasons }) => reasons.includes("replay_detected")), true);
  assert.equal((await database.db.select().from(authorizations)).length, 1);
  assert.equal((await database.db.select().from(nonces)).length, 1);
  const replayEvents = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.replay_detected"));
  assert.equal(replayEvents.length, 1);
  assert.equal(replayEvents[0]?.sanitizedPayload?.payment_executor_called, false);
});

integrationTest("an exact Idempotency-Key retry returns the committed authorization once", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  const proof = await scenario.createProof();

  const first = await scenario.sendVerify({ proof });
  const repeated = await scenario.sendVerify({ proof });

  assert.equal(first.statusCode, 200);
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), first.json());
  assert.equal((await database.db.select().from(authorizations)).length, 1);
  assert.equal((await database.db.select().from(nonces)).length, 1);
});

integrationTest("a replayed agent nonce returns replay_detected without another reservation", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t, { maxUses: 2, maxAggregateAmount: 30000 });
  const firstProof = await scenario.createProof(scenario.requestBody, "nonce_verify_replay_001");
  await assertReplayDenied(
    scenario,
    { proof: firstProof, idempotencyKey: "idem_verify_replay_first_001" },
    { proof: firstProof, idempotencyKey: "idem_verify_replay_second_001" },
  );
  scenario.setNow("2026-08-29T12:04:02.000Z");
  const repeated = await scenario.sendVerify({
    proof: firstProof,
    idempotencyKey: "idem_verify_replay_second_001",
  });
  assert.equal(authorizationDecisionSchema.parse(repeated.json()).decision, "DENY");
  const replayEvents = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.replay_detected"));
  assert.equal(replayEvents.length, 1);
  assert.equal(replayEvents[0]?.sanitizedPayload?.payment_executor_called, false);
});

integrationTest("the same checkout request with a fresh nonce cannot create another authorization", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t, { maxUses: 2, maxAggregateAmount: 30000 });
  await assertReplayDenied(
    scenario,
    {
      nonce: "nonce_verify_checkout_replay_001",
      idempotencyKey: "idem_verify_checkout_replay_001",
    },
    {
      nonce: "nonce_verify_checkout_replay_002",
      idempotencyKey: "idem_verify_checkout_replay_002",
    },
  );
});

integrationTest("a revocation committed before reservation prevents authorization", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  const revoked = await scenario.app.inject({
    method: "POST",
    url: `/v1/mandates/${scenario.mandateId}/revoke`,
    headers: { "idempotency-key": "idem_verify_revoke_before_001" },
    payload: {},
  });
  assert.equal(revoked.statusCode, 200);

  const response = await scenario.sendVerify();
  const decision = authorizationDecisionSchema.parse(response.json());

  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reasons.includes("mandate_revoked"), true);
  assert.equal((await database.db.select().from(authorizations)).length, 0);
  assert.equal((await database.db.select().from(nonces)).length, 0);
  const denial = (await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.denied")))[0];
  assert.equal(denial?.sanitizedPayload?.payment_executor_called, false);
  assert.deepEqual(denial?.sanitizedPayload?.reasons, ["mandate_revoked"]);
  const timeline = (await scenario.app.inject({
    method: "GET",
    url: "/audit/corr_verify_scenario_001",
  })).json<{ events: Array<{ event_type: string; payload: Record<string, unknown> }> }>();
  assert.deepEqual(timeline.events.map(({ event_type }) => event_type), [
    "mandate.created",
    "mandate.activated",
    "mandate.revoked",
    "authorization.denied",
  ]);
  assert.equal(timeline.events[2]?.payload.payment_executor_called, false);
  assert.equal(timeline.events[3]?.payload.payment_executor_called, false);
});

integrationTest("DENY does not persist a nonce, checkout or payable authorization", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  const body = {
    ...scenario.requestBody,
    authorization: {
      ...scenario.requestBody.authorization,
      max_amount: { amount: 100, currency: "USD" as const },
    },
  };

  const response = await scenario.sendVerify({ body });
  const decision = authorizationDecisionSchema.parse(response.json());

  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reasons.includes("amount_limit_exceeded"), true);
  assert.equal((await database.db.select().from(authorizations)).length, 0);
  assert.equal((await database.db.select().from(nonces)).length, 0);
  assert.equal((await database.db.select().from(checkouts)).length, 0);
  const denial = (await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.denied")))[0];
  assert.equal(denial?.sanitizedPayload?.payment_executor_called, false);
  scenario.setNow("2026-08-29T12:04:02.000Z");
  const repeated = await scenario.sendVerify({ body });
  assert.deepEqual(repeated.json(), response.json());
  assert.equal((await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.denied"))).length, 1);
  const timeline = (await scenario.app.inject({
    method: "GET",
    url: "/audit/corr_verify_scenario_001",
  })).json<{ events: Array<{ event_type: string }> }>();
  assert.deepEqual(timeline.events.map(({ event_type }) => event_type), [
    "mandate.created",
    "mandate.activated",
    "authorization.denied",
  ]);
});

integrationTest("ESCALATE does not persist a nonce, checkout or payable authorization", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t, { humanApprovalRequired: true });

  const response = await scenario.sendVerify();
  const decision = authorizationDecisionSchema.parse(response.json());

  assert.equal(decision.decision, "ESCALATE");
  assert.deepEqual(decision.reasons, ["human_approval_required"]);
  assert.equal((await database.db.select().from(authorizations)).length, 0);
  assert.equal((await database.db.select().from(nonces)).length, 0);
  assert.equal((await database.db.select().from(checkouts)).length, 0);
  const escalation = (await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.escalated")))[0];
  assert.equal(escalation?.sanitizedPayload?.payment_executor_called, false);
  scenario.setNow("2026-08-29T12:04:02.000Z");
  const repeated = await scenario.sendVerify();
  assert.deepEqual(repeated.json(), response.json());
  assert.equal((await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.escalated"))).length, 1);
});

integrationTest("an audit write failure rolls back checkout, nonce and authorization together", async (t) => {
  assert.ok(administrationPool);
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  await administrationPool.query(`
    CREATE FUNCTION reject_authorization_reservation_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'authorization.reserved' THEN
        RAISE EXCEPTION 'forced authorization audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_authorization_reservation_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_authorization_reservation_audit();
  `);
  t.after(async () => {
    await administrationPool?.query(
      "DROP TRIGGER IF EXISTS reject_authorization_reservation_audit_trigger ON audit_events",
    );
    await administrationPool?.query("DROP FUNCTION IF EXISTS reject_authorization_reservation_audit() ");
  });

  const response = await scenario.sendVerify();

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, "internal_error");
  assert.equal((await database.db.select().from(authorizations)).length, 0);
  assert.equal((await database.db.select().from(nonces)).length, 0);
  assert.equal((await database.db.select().from(checkouts)).length, 0);
  assert.equal(
    (await database.db.select().from(auditEvents).where(eq(auditEvents.eventType, "authorization.reserved"))).length,
    0,
  );
});

integrationTest("RESERVED, PAYMENT_PENDING and CONSUMED all count against aggregate limits", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t, { maxUses: 10, maxAggregateAmount: 16000 });
  await seedPriorAuthorization(scenario, {
    suffix: "reserved",
    status: "RESERVED",
    amount: 1000,
    expiresAt: "2026-08-29T12:30:00.000Z",
  });
  await seedPriorAuthorization(scenario, {
    suffix: "payment_pending",
    status: "PAYMENT_PENDING",
    amount: 1000,
    expiresAt: "2026-08-29T12:03:00.000Z",
  });
  await seedPriorAuthorization(scenario, {
    suffix: "consumed",
    status: "CONSUMED",
    amount: 1000,
    expiresAt: "2026-08-29T12:30:00.000Z",
  });

  const response = await scenario.sendVerify();
  const decision = authorizationDecisionSchema.parse(response.json());

  assert.equal(decision.decision, "DENY");
  assert.equal(decision.reasons.includes("aggregate_limit_exceeded"), true);
  assert.equal((await database.db.select().from(authorizations)).length, 3);
  const pending = await database.db
    .select({ status: authorizations.status })
    .from(authorizations)
    .where(eq(authorizations.authorizationId, "authorization_prior_payment_pending"));
  assert.deepEqual(pending, [{ status: "PAYMENT_PENDING" }]);
});

integrationTest("expired RESERVED and CANCELLED release capacity while PAYMENT_PENDING never auto-releases", async (t) => {
  assert.ok(database);
  const scenario = await createVerifyScenario(t);
  await seedPriorAuthorization(scenario, {
    suffix: "expired_reserved",
    status: "RESERVED",
    amount: 1000,
    expiresAt: "2026-08-29T12:03:00.000Z",
  });
  await seedPriorAuthorization(scenario, {
    suffix: "cancelled",
    status: "CANCELLED",
    amount: 1000,
    expiresAt: "2026-08-29T12:30:00.000Z",
  });

  const response = await scenario.sendVerify();
  const decision = authorizationDecisionSchema.parse(response.json());

  assert.equal(decision.decision, "ALLOW");
  const prior = await database.db
    .select({ authorizationId: authorizations.authorizationId, status: authorizations.status })
    .from(authorizations)
    .where(inArray(authorizations.authorizationId, [
      "authorization_prior_expired_reserved",
      "authorization_prior_cancelled",
    ]));
  assert.deepEqual(
    prior.sort((left, right) => left.authorizationId.localeCompare(right.authorizationId)),
    [
      { authorizationId: "authorization_prior_cancelled", status: "CANCELLED" },
      { authorizationId: "authorization_prior_expired_reserved", status: "CANCELLED" },
    ],
  );
  const cancellationEvents = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.eventType, "authorization.cancelled"));
  assert.equal(cancellationEvents.length, 1);
  assert.equal(cancellationEvents[0]?.subjectId, "authorization_prior_expired_reserved");
});

integrationTest("concurrent ledger appends serialize into one verifiable subject chain", async () => {
  assert.ok(database);
  const repository = new PostgresAuditEventRepository(database.db);
  const ledger = new AuditLedgerService(repository);
  const recordedAt = new Date("2026-08-29T12:10:00.000Z");
  const correlationId = "corr_concurrent_ledger_001";
  const append = () => database!.transaction((transaction) => ledger.append(transaction, {
    correlationId,
    eventType: "mandate.created",
    subjectId: "mandate_concurrent_ledger_001",
    payload: {
      mandate_id: "mandate_concurrent_ledger_001",
      principal_id: "principal_concurrent_ledger_001",
      agent_id: "agent_concurrent_ledger_001",
      status: "DRAFT",
      created_at: recordedAt.toISOString(),
    },
    recordedAt,
  }));

  await Promise.all([
    append(),
    append(),
  ]);

  const rows = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.subjectId, "mandate_concurrent_ledger_001"));
  const roots = rows.filter((row) => row.previousHash === null);
  const tips = rows.filter((row) => !rows.some((candidate) => candidate.previousHash === row.eventHash));
  assert.equal(rows.length, 2);
  assert.equal(roots.length, 1);
  assert.equal(tips.length, 1);

  const loaded = await repository.findByCorrelationId(correlationId);
  loaded.sort((left, right) => left.previousHash === null ? -1 : right.previousHash === null ? 1 : 0);
  assert.deepEqual(validateAuditChain(loaded), { valid: true });
  const timeline = await ledger.getTimeline(correlationId);
  assert.equal(timeline.events[0]?.previous_hash, null);
  assert.equal(timeline.events[1]?.previous_hash, timeline.events[0]?.event_hash);
});

integrationTest("a failed business transaction leaves no orphan audit event", async () => {
  assert.ok(database);
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));

  await assert.rejects(database.transaction(async (transaction) => {
    await ledger.append(transaction, {
      correlationId: "corr_orphan_rollback_001",
      eventType: "mandate.created",
      subjectId: "mandate_orphan_rollback_001",
      payload: {
        mandate_id: "mandate_orphan_rollback_001",
        principal_id: "principal_orphan_rollback_001",
        agent_id: "agent_orphan_rollback_001",
        status: "DRAFT",
        created_at: "2026-08-29T12:11:00.000Z",
      },
      recordedAt: new Date("2026-08-29T12:11:00.000Z"),
    });
    throw new Error("forced business failure");
  }), /forced business failure/);

  const events = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.correlationId, "corr_orphan_rollback_001"));
  assert.equal(events.length, 0);
});

integrationTest("audit_events rejects update and delete mutations", async () => {
  assert.ok(database);
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const stored = await database.transaction((transaction) => ledger.append(transaction, {
    correlationId: "corr_append_only_001",
    eventType: "mandate.created",
    subjectId: "mandate_append_only_001",
    payload: {
      mandate_id: "mandate_append_only_001",
      principal_id: "principal_append_only_001",
      agent_id: "agent_append_only_001",
      status: "DRAFT",
      created_at: "2026-08-29T12:12:00.000Z",
    },
    recordedAt: new Date("2026-08-29T12:12:00.000Z"),
  }));

  await assert.rejects(
    database.db.update(auditEvents).set({ correlationId: "corr_mutated" }).where(eq(auditEvents.eventId, stored.eventId)),
    (error) => hasPostgresCode(error, "55000"),
  );
  await assert.rejects(
    database.db.delete(auditEvents).where(eq(auditEvents.eventId, stored.eventId)),
    (error) => hasPostgresCode(error, "55000"),
  );
});

integrationTest("GET /audit fails safely when a stored payload is invalid and exposes no sensitive material", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
  const correlationId = "corr_timeline_security_001";
  await database.transaction(async (transaction) => {
    await ledger.append(transaction, {
      correlationId,
      eventType: "agent.registered",
      subjectId: "agent_timeline_001",
      payload: {
        agent_id: "agent_timeline_001",
        principal_id: "principal_timeline_001",
        status: "ACTIVE",
        build_fingerprint: "a".repeat(64),
        key_id: "key_timeline_001",
        registered_at: "2026-08-29T12:14:00.000Z",
      },
      recordedAt: new Date("2026-08-29T12:14:00.000Z"),
    });
    await ledger.append(transaction, {
      correlationId,
      eventType: "mandate.created",
      subjectId: "mandate_timeline_001",
      payload: {
        mandate_id: "mandate_timeline_001",
        principal_id: "principal_timeline_001",
        agent_id: "agent_timeline_001",
        status: "DRAFT",
        created_at: "2026-08-29T12:13:00.000Z",
      },
      recordedAt: new Date("2026-08-29T12:13:00.000Z"),
    });
  });
  await database.db.insert(auditEvents).values({
    eventId: "event_untrusted_payload_001",
    correlationId,
    eventType: "mandate.created",
    subjectId: "mandate_untrusted_payload_001",
    sanitizedPayload: {
      proof: "raw-proof-value",
      signature: "raw-signature-value",
      credential_id: "credential-reusable-value",
      pan: "4242424242424242",
      cvv: "123",
      token: "provider-token-value",
    },
    payloadHash: "b".repeat(64),
    previousHash: null,
    eventHash: "c".repeat(64),
    recordedAt: new Date("2026-08-29T12:15:00.000Z"),
  });

  const app = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
  t.after(async () => app.close());
  const response = await app.inject({ method: "GET", url: `/audit/${correlationId}` });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, "internal_error");
  assert.equal("stack" in response.json(), false);
  for (const forbidden of [
    "raw-proof-value",
    "raw-signature-value",
    "credential-reusable-value",
    "4242424242424242",
    "provider-token-value",
  ]) {
    assert.equal(response.body.includes(forbidden), false);
  }
});

for (const tamperedField of ["payload", "previous_hash", "event_hash"] as const) {
  integrationTest(`GET /audit detects tampered ${tamperedField}`, async (t) => {
    assert.ok(administrationPool);
    assert.ok(database);
    const ledger = new AuditLedgerService(new PostgresAuditEventRepository(database.db));
    const correlationId = `corr_tampered_${tamperedField.replace("_", "")}_001`;
    const subjectId = `mandate_tampered_${tamperedField.replace("_", "")}_001`;
    const append = (recordedAt: string) => database!.transaction((transaction) => ledger.append(transaction, {
      correlationId,
      eventType: "mandate.created",
      subjectId,
      payload: {
        mandate_id: subjectId,
        principal_id: "principal_tamper_001",
        agent_id: "agent_tamper_001",
        status: "DRAFT",
        created_at: recordedAt,
      },
      recordedAt: new Date(recordedAt),
    }));
    const first = await append("2026-08-29T12:13:00.000Z");
    const second = await append("2026-08-29T12:14:00.000Z");
    await administrationPool.query("ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only_trigger");
    try {
      if (tamperedField === "payload") {
        await database.db
          .update(auditEvents)
          .set({ sanitizedPayload: { ...first.sanitizedPayload, agent_id: "agent_tampered" } })
          .where(eq(auditEvents.eventId, first.eventId));
      } else if (tamperedField === "previous_hash") {
        await database.db
          .update(auditEvents)
          .set({ previousHash: "f".repeat(64) })
          .where(eq(auditEvents.eventId, second.eventId));
      } else {
        await database.db
          .update(auditEvents)
          .set({ eventHash: "e".repeat(64) })
          .where(eq(auditEvents.eventId, first.eventId));
      }
    } finally {
      await administrationPool.query("ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only_trigger");
    }
    const app = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
    t.after(async () => app.close());
    const response = await app.inject({ method: "GET", url: `/audit/${correlationId}` });
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.code, "internal_error");
    assert.equal("stack" in response.json(), false);
  });
}

integrationTest("invalid audit and receipt identifiers return sanitized public errors", async (t) => {
  const app = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
  t.after(async () => app.close());
  for (const url of ["/audit/not%20valid", "/receipts/not%20valid", "/audit/corr_missing_001", "/receipts/receipt_missing_001"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 404, url);
    assert.equal(response.json().error.code, "not_found");
    assert.equal("stack" in response.json(), false);
  }
});

integrationTest("a RESERVED authorization starts one persisted payment attempt", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t);
  const response = await scenario.sendPay(
    "idem_pay_reserved_001",
    reservedAuthorizationFixture.authorization_id,
    "corr_pay_reserved_001",
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-correlation-id"], "corr_pay_reserved_001");
  assert.equal(scenario.executor.callCount, 1);
  const authorizationRows = await database.db.select().from(authorizations);
  const paymentRows = await database.db.select().from(payments);
  assert.deepEqual(scenario.executor.calls, [{
    authorization_id: reservedAuthorizationFixture.authorization_id,
    idempotency_key: paymentRows[0]?.providerIdempotencyKey,
  }]);
  assert.equal(authorizationRows[0]?.status, "CONSUMED");
  assert.equal(paymentRows.length, 1);
  assert.equal(paymentRows[0]?.authorizationId, reservedAuthorizationFixture.authorization_id);
  assert.equal(paymentRows[0]?.credentialId, mandateFixture.terms.credential_id);
  assert.equal(paymentRows[0]?.amount, reservedAuthorizationFixture.reserved_amount.amount);
  assert.equal(paymentRows[0]?.currency, reservedAuthorizationFixture.reserved_amount.currency);
  assert.equal(paymentRows[0]?.status, "APPROVED");
  assert.equal(paymentRows[0]?.correlationId, "corr_pay_reserved_001");
  assert.match(paymentRows[0]?.providerIdempotencyKey ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(paymentRows[0]?.providerIdempotencyKey, reservedAuthorizationFixture.authorization_id);
  assert.equal((await database.db.select().from(orders)).length, 1);
  const paymentEvents = await database.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.subjectId, reservedAuthorizationFixture.authorization_id));
  assert.deepEqual(
    paymentEvents.map(({ eventType }) => eventType).sort(),
    ["order.confirmed", "payment.approved", "payment.attempt_started"],
  );
});

integrationTest("DECLINED finalizes the authorization as FAILED without an order", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t, "DECLINED");

  const response = await scenario.sendPay("idem_pay_declined_001");

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().status, "DECLINED");
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "FAILED");
  assert.equal((await database.db.select().from(orders)).length, 0);
});

for (const outcome of ["TIMEOUT", "UNKNOWN"] as const) {
  integrationTest(`${outcome} remains PAYMENT_PENDING and retry never executes again`, async (t) => {
    assert.ok(database);
    const scenario = await createPaymentScenario(t, outcome);

    const first = await scenario.sendPay(`idem_pay_${outcome.toLowerCase()}_001`);
    const repeated = await scenario.sendPay(`idem_pay_${outcome.toLowerCase()}_002`);

    assert.equal(first.statusCode, 200);
    assert.equal(first.json().status, outcome);
    assert.equal(repeated.statusCode, 200);
    assert.deepEqual(repeated.json(), first.json());
    assert.equal(scenario.executor.callCount, 1);
    assert.equal((await database.db.select().from(authorizations))[0]?.status, "PAYMENT_PENDING");
    assert.equal((await database.db.select().from(payments)).length, 1);
    assert.equal((await database.db.select().from(orders)).length, 0);
    assert.equal(
      (await database.db.select().from(auditEvents).where(eq(
        auditEvents.eventType,
        `payment.${outcome.toLowerCase()}`,
      ))).length,
      1,
    );
  });
}

integrationTest("two sequential pay calls reuse one persisted result without executing twice", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t);

  const first = await scenario.sendPay("idem_pay_sequential_001");
  const repeated = await scenario.sendPay("idem_pay_sequential_002");

  assert.equal(first.statusCode, 200);
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), first.json());
  assert.equal(scenario.executor.callCount, 1);
  assert.equal((await database.db.select().from(payments)).length, 1);
});

for (const [outcome, authorizationStatus, eventType] of [
  ["DECLINED", "FAILED", "payment.declined"],
  ["TIMEOUT", "PAYMENT_PENDING", "payment.timeout"],
  ["UNKNOWN", "PAYMENT_PENDING", "payment.unknown"],
] as const) {
  integrationTest(`${outcome} records executor evidence and the safe authorization state`, async (t) => {
    assert.ok(database);
    const scenario = await createPaymentScenario(t, outcome);
    const response = await scenario.sendPay(
      `idem_pay_${outcome.toLowerCase()}_001`,
      reservedAuthorizationFixture.authorization_id,
      `corr_pay_${outcome.toLowerCase()}_001`,
    );

    assert.equal(response.statusCode, 200);
    assert.equal(paymentResultSchema.parse(response.json()).status, outcome);
    assert.equal((await database.db.select().from(authorizations))[0]?.status, authorizationStatus);
    const events = await database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, reservedAuthorizationFixture.authorization_id));
    assert.deepEqual(events.map(({ eventType: type }) => type), [
      "payment.attempt_started",
      eventType,
    ]);
    assert.equal(events[0]?.sanitizedPayload?.payment_executor_called, false);
    assert.equal(events[1]?.sanitizedPayload?.payment_executor_called, true);
    assert.equal(events[1]?.sanitizedPayload?.status, outcome);
    const repeated = await scenario.sendPay(`idem_pay_${outcome.toLowerCase()}_retry`);
    assert.equal(repeated.statusCode, 200);
    assert.equal(scenario.executor.callCount, 1);
    assert.equal((await database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, reservedAuthorizationFixture.authorization_id))).length, 2);
  });
}

integrationTest("payment result audit failure rolls back the result and terminal state", async (t) => {
  assert.ok(administrationPool);
  assert.ok(database);
  const scenario = await createPaymentScenario(t);
  await administrationPool.query(`
    CREATE FUNCTION reject_payment_result_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'payment.approved' THEN
        RAISE EXCEPTION 'forced payment audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_payment_result_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_payment_result_audit();
  `);
  t.after(async () => {
    await administrationPool?.query("DROP TRIGGER IF EXISTS reject_payment_result_audit_trigger ON audit_events");
    await administrationPool?.query("DROP FUNCTION IF EXISTS reject_payment_result_audit()");
  });

  const response = await scenario.sendPay("idem_pay_audit_rollback_001");
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, "internal_error");
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "PAYMENT_PENDING");
  assert.equal((await database.db.select().from(payments))[0]?.status, null);
  const events = await database.db.select().from(auditEvents);
  assert.deepEqual(events.map(({ eventType: type }) => type), ["payment.attempt_started"]);
});

integrationTest("concurrent pay calls execute at most once", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t);

  const responses = await Promise.all([
    scenario.sendPay("idem_pay_concurrent_001"),
    scenario.sendPay("idem_pay_concurrent_002"),
  ]);

  assert.equal(responses.some(({ statusCode }) => statusCode === 200), true);
  assert.equal(responses.every(({ statusCode }) => statusCode === 200 || statusCode === 409), true);
  assert.equal(scenario.executor.callCount, 1);
  assert.equal((await database.db.select().from(payments)).length, 1);
  assert.equal((await database.db.select().from(orders)).length, 1);
  assert.equal(
    (await database.db.select().from(auditEvents).where(eq(auditEvents.eventType, "payment.approved"))).length,
    1,
  );
  assert.equal(
    (await database.db.select().from(auditEvents).where(eq(auditEvents.eventType, "payment.attempt_started"))).length,
    1,
  );
});

integrationTest("reconciliation reuses the persisted provider UUID and applies one terminal result", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t, "TIMEOUT");
  const pendingResponse = await scenario.sendPay("idem_pay_reconcile_timeout_001");
  assert.equal(pendingResponse.statusCode, 200);

  const store = new PostgresPaymentClaimStore(
    database,
    { now: () => new Date("2026-08-29T12:04:03.000Z") },
  );
  const attempt = await store.loadPendingAttempt(reservedAuthorizationFixture.authorization_id);
  assert.equal(attempt.idempotency_key, scenario.executor.calls[0]?.idempotency_key);
  await assert.rejects(
    store.persistReconciledResult(
      reservedAuthorizationFixture.authorization_id,
      "123e4567-e89b-42d3-a456-426614174999",
      approvedPaymentFixture,
    ),
    /idempotency key does not match/,
  );

  const approved = paymentResultSchema.parse({
    ...approvedPaymentFixture,
    authorization_id: reservedAuthorizationFixture.authorization_id,
    amount: reservedAuthorizationFixture.reserved_amount,
    payment_id: "payment_authorization_authorization_vy_471_001",
    provider_reference: "fake_ref_authorization_vy_471_001",
  });
  const [first, duplicate] = await Promise.all([
    store.persistResult(attempt.payment_attempt_id, approved),
    store.persistResult(attempt.payment_attempt_id, approved),
  ]);

  assert.deepEqual(first, approved);
  assert.deepEqual(duplicate, approved);
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "CONSUMED");
  assert.equal((await database.db.select().from(orders)).length, 1);
  const resultEvents = (await database.db.select().from(auditEvents))
    .filter(({ eventType }) => eventType === "payment.timeout" || eventType === "payment.approved");
  assert.equal(resultEvents.length, 2);
  await assert.rejects(
    store.persistResult(attempt.payment_attempt_id, {
      authorization_id: reservedAuthorizationFixture.authorization_id,
      amount: reservedAuthorizationFixture.reserved_amount,
      occurred_at: "2026-08-29T12:04:04.000Z",
      status: "DECLINED",
      decline_code: "late_divergent_decline",
    }),
    /conflicts with the result already persisted/,
  );
  assert.equal((await database.db.select().from(orders)).length, 1);
});

integrationTest("invalid authorization transitions and terminal regressions fail closed in PostgreSQL", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  await assert.rejects(
    database.db
      .update(authorizations)
      .set({ status: "CONSUMED" })
      .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id)),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
  await database.db
    .update(authorizations)
    .set({ status: "PAYMENT_PENDING" })
    .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id));
  await database.db
    .update(authorizations)
    .set({ status: "FAILED" })
    .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id));
  await assert.rejects(
    database.db
      .update(authorizations)
      .set({ status: "RESERVED" })
      .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id)),
    (error: unknown) => hasPostgresCode(error, "23514"),
  );
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "FAILED");
});

integrationTest("an order audit failure rolls back result, terminal transition and order together", async (t) => {
  assert.ok(administrationPool);
  assert.ok(database);
  const scenario = await createPaymentScenario(t);
  await administrationPool.query(`
    CREATE FUNCTION reject_payment_order_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'order.confirmed' THEN
        RAISE EXCEPTION 'forced order audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_payment_order_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_payment_order_audit();
  `);
  t.after(async () => {
    await administrationPool?.query(
      "DROP TRIGGER IF EXISTS reject_payment_order_audit_trigger ON audit_events",
    );
    await administrationPool?.query("DROP FUNCTION IF EXISTS reject_payment_order_audit()");
  });

  const response = await scenario.sendPay("idem_pay_order_rollback_001");

  assert.equal(response.statusCode, 500);
  assert.equal(scenario.executor.callCount, 1);
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "PAYMENT_PENDING");
  assert.equal((await database.db.select().from(payments))[0]?.status, null);
  assert.equal((await database.db.select().from(orders)).length, 0);
  assert.deepEqual(
    (await database.db.select().from(auditEvents)).map(({ eventType }) => eventType),
    ["payment.attempt_started"],
  );
});

integrationTest("a claim audit failure rolls back PAYMENT_PENDING and the attempt before executor I/O", async (t) => {
  assert.ok(administrationPool);
  assert.ok(database);
  const scenario = await createPaymentScenario(t);
  await administrationPool.query(`
    CREATE FUNCTION reject_payment_claim_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = 'payment.attempt_started' THEN
        RAISE EXCEPTION 'forced payment claim audit failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER reject_payment_claim_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_payment_claim_audit();
  `);
  t.after(async () => {
    await administrationPool?.query(
      "DROP TRIGGER IF EXISTS reject_payment_claim_audit_trigger ON audit_events",
    );
    await administrationPool?.query("DROP FUNCTION IF EXISTS reject_payment_claim_audit()");
  });

  const response = await scenario.sendPay("idem_pay_claim_rollback_001");

  assert.equal(response.statusCode, 500);
  assert.equal(scenario.executor.callCount, 0);
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "RESERVED");
  assert.equal((await database.db.select().from(payments)).length, 0);
  assert.equal((await database.db.select().from(auditEvents)).length, 0);
});

integrationTest("missing and non-RESERVED authorizations never reach the executor", async (t) => {
  assert.ok(database);
  const scenario = await createPaymentScenario(t);

  const missing = await scenario.sendPay("idem_pay_missing_001", "authorization_missing");
  assert.equal(missing.statusCode, 404);

  await database.db
    .update(authorizations)
    .set({ status: "PAYMENT_PENDING" })
    .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id));
  const pending = await scenario.sendPay("idem_pay_invalid_payment_pending");
  assert.equal(pending.statusCode, 409);
  await database.db
    .update(authorizations)
    .set({ status: "CONSUMED" })
    .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id));
  const consumed = await scenario.sendPay("idem_pay_invalid_consumed");
  assert.equal(consumed.statusCode, 409);
  assert.equal(scenario.executor.callCount, 0);
  assert.equal((await database.db.select().from(payments)).length, 0);
});

integrationTest("incompatible merchant, checkout and credential bindings fail closed", async (t) => {
  assert.ok(administrationPool);
  assert.ok(database);
  const scenario = await createPaymentScenario(t);
  let sequence = 0;
  async function expectClosed(): Promise<void> {
    sequence += 1;
    const response = await scenario.sendPay(`idem_pay_binding_${sequence}`);
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().error.code, "checkout_integrity_failure");
    assert.equal(scenario.executor.callCount, 0);
    assert.equal((await database!.db.select().from(payments)).length, 0);
  }

  await database.db
    .update(checkouts)
    .set({ merchantId: "merchant_incompatible" })
    .where(eq(checkouts.checkoutId, checkoutTermsFixture.checkout_id));
  await expectClosed();
  await database.db
    .update(checkouts)
    .set({ merchantId: checkoutTermsFixture.merchant_id, totalAmount: 1 })
    .where(eq(checkouts.checkoutId, checkoutTermsFixture.checkout_id));
  await expectClosed();
  await database.db
    .update(checkouts)
    .set({ totalAmount: checkoutTermsFixture.total.amount })
    .where(eq(checkouts.checkoutId, checkoutTermsFixture.checkout_id));

  await administrationPool.query("ALTER TABLE payment_credentials DISABLE TRIGGER ALL");
  await administrationPool.query(
    "UPDATE payment_credentials SET principal_id = 'principal_incompatible' WHERE credential_id = $1",
    [mandateFixture.terms.credential_id],
  );
  await administrationPool.query("ALTER TABLE payment_credentials ENABLE TRIGGER ALL");
  await expectClosed();
});

integrationTest("the executor observes the committed attempt with no SQL transaction open", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  await seedAuthorizationGraph();
  const connection = createDatabase({ connectionString: testDatabaseUrl, max: 4 });
  let transactionDepth = 0;
  const trackedConnection: DatabaseConnection = {
    db: connection.db,
    async transaction(callback) {
      transactionDepth += 1;
      try {
        return await connection.transaction(callback);
      } finally {
        transactionDepth -= 1;
      }
    },
    checkHealth: () => connection.checkHealth(),
    close: () => connection.close(),
  };
  const fake = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: "2026-08-29T12:04:02.000Z",
  });
  const executor: PaymentExecutor = {
    async pay(input, idempotencyKey) {
      assert.equal(transactionDepth, 0);
      const [authorizationRow] = await connection.db
        .select({ status: authorizations.status })
        .from(authorizations)
        .where(eq(authorizations.authorizationId, input.authorization.authorization_id));
      const attemptRows = await connection.db
        .select()
        .from(payments)
        .where(eq(payments.authorizationId, input.authorization.authorization_id));
      assert.equal(authorizationRow?.status, "PAYMENT_PENDING");
      assert.equal(attemptRows.length, 1);
      assert.equal(attemptRows[0]?.status, null);
      return fake.pay(input, idempotencyKey);
    },
  };
  const app = await buildApp({
    database: trackedConnection,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:04:01.000Z") },
    paymentExecutor: executor,
  });
  t.after(async () => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/authorizations/${reservedAuthorizationFixture.authorization_id}/pay`,
    headers: { "idempotency-key": "idem_pay_outside_transaction" },
    payload: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(fake.callCount, 1);
});

integrationTest("an approved payment permits exactly one idempotent merchant completion", async (t) => {
  assert.ok(database);
  const executor = new FakePaymentExecutor({
    outcome: "APPROVED",
    occurredAt: "2026-08-29T12:04:02.000Z",
  });
  const scenario = await createVerifyScenario(t, { paymentExecutor: executor });
  const verifyResponse = await scenario.sendVerify({
    nonce: "nonce_pay_completion_001",
    idempotencyKey: "idem_pay_completion_verify_001",
  });
  const decision = authorizationDecisionSchema.parse(verifyResponse.json());
  assert.equal(decision.decision, "ALLOW");
  assert.ok(decision.authorization_id);
  const row = (await database.db
    .select()
    .from(authorizations)
    .where(eq(authorizations.authorizationId, decision.authorization_id)))[0];
  assert.ok(row);
  const authorization = reservedAuthorizationSchema.parse({
    authorization_id: row.authorizationId,
    mandate_id: row.mandateId,
    checkout_id: row.checkoutId,
    checkout_hash: row.checkoutHash,
    principal_id: row.principalId,
    agent_id: row.agentId,
    merchant_id: row.merchantId,
    reserved_amount: { amount: row.reservedAmount, currency: row.currency },
    status: "RESERVED",
    reserved_at: row.reservedAt.toISOString(),
    expires_at: row.expiresAt.toISOString(),
  });
  const completionRequest = {
    method: "POST" as const,
    url: `/ucp/v1/checkout/${scenario.checkout.terms.checkout_id}/complete`,
    headers: {
      "idempotency-key": "idem_pay_completion_order_001",
      "ucp-capabilities": "dev.ucp.shopping.checkout,dev.ucp.common.payment.ap2_mandate",
      "x-correlation-id": "corr_order_completion_001",
    },
    payload: { checkout: scenario.checkout, authorization },
  };
  const premature = await scenario.app.inject(completionRequest);
  assert.equal(premature.statusCode, 409);
  assert.equal((await database.db.select().from(orders)).length, 0);

  const paymentResponse = await scenario.app.inject({
    method: "POST",
    url: `/authorizations/${row.authorizationId}/pay`,
    headers: {
      "idempotency-key": "idem_pay_completion_execute_001",
      "x-correlation-id": "corr_pay_completion_execute_001",
    },
    payload: {},
  });
  const payment = paymentResultSchema.parse(paymentResponse.json());
  assert.equal(payment.status, "APPROVED");

  const completed = await scenario.app.inject(completionRequest);
  const repeated = await scenario.app.inject(completionRequest);

  assert.equal(completed.statusCode, 200);
  assert.equal(repeated.statusCode, 200);
  assert.deepEqual(repeated.json(), completed.json());
  assert.equal(completed.json().payment_id, payment.payment_id);
  assert.equal(executor.callCount, 1);
  assert.equal((await database.db.select().from(payments)).length, 1);
  assert.equal((await database.db.select().from(orders)).length, 1);
  assert.equal((await database.db.select().from(authorizations))[0]?.status, "CONSUMED");

  const receipt = orderReceiptSchema.parse(completed.json());
  const receiptRead = await scenario.app.inject({
    method: "GET",
    url: `/receipts/${receipt.receipt_id}`,
  });
  assert.equal(receiptRead.statusCode, 200);
  assert.deepEqual(receiptRead.json(), receipt);
  assert.equal(receiptRead.body.includes(mandateFixture.payment_credential.display), false);
  for (const forbidden of [
    "\"pan\"",
    "\"cvv\"",
    "vaulted_token",
    "private_key",
    "authorization_header",
    "raw_proof",
    "provider_reference",
  ]) {
    assert.equal(receiptRead.body.toLowerCase().includes(forbidden), false);
  }
  const restarted = await buildApp({ databaseUrl: testDatabaseUrl, logger: false });
  t.after(async () => restarted.close());
  const persistedReceipt = await restarted.inject({
    method: "GET",
    url: `/receipts/${receipt.receipt_id}`,
  });
  assert.equal(persistedReceipt.statusCode, 200);
  assert.deepEqual(persistedReceipt.json(), receipt);

  for (const correlationId of [
    "corr_verify_scenario_001",
    "corr_pay_completion_execute_001",
  ]) {
    const timelineResponse = await scenario.app.inject({
      method: "GET",
      url: `/audit/${correlationId}`,
    });
    assert.equal(timelineResponse.statusCode, 200, correlationId);
    const timeline = timelineResponse.json<{
      events: Array<{
        event_type: string;
        subject_id: string;
        payload: Record<string, unknown>;
      }>;
    }>();
    assert.deepEqual(timeline.events.map(({ event_type }) => event_type), [
      "authorization.reserved",
      "payment.attempt_started",
      "payment.approved",
      "order.confirmed",
    ]);
    assert.equal(timeline.events.every(({ subject_id }) => subject_id === decision.authorization_id), true);
    assert.equal(timeline.events[0]?.payload.payment_executor_called, false);
    assert.equal(timeline.events[1]?.payload.payment_executor_called, false);
    assert.equal(timeline.events[2]?.payload.payment_executor_called, true);
    assert.equal(timeline.events[3]?.payload.payment_executor_called, true);
    assert.equal(timeline.events[3]?.payload.payment_id, payment.payment_id);
    assert.equal(timeline.events[3]?.payload.order_id, receipt.order_id);
    assert.equal(timeline.events[3]?.payload.receipt_id, receipt.receipt_id);
    for (const forbidden of ["cvv", "vaulted_token", "private_key", "authorization\":", "raw-proof"]) {
      assert.equal(timelineResponse.body.toLowerCase().includes(forbidden), false);
    }
  }
});

integrationTest("the authenticated principal disputes an agent purchase and receives an auditable verdict", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  const payment = await createPaymentScenario(t, "APPROVED");
  await seedReservedAuthorizationAuditEvent();
  const paid = await payment.sendPay("idem_dispute_payment_001", undefined, "corr_dispute_payment_001");
  assert.equal(paid.statusCode, 200);

  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:05:00.000Z") },
    principalAuth: {
      mode: "demo",
      nodeEnvironment: "development",
      allowedOrigin: "http://localhost:3000",
      secureCookies: false,
      sessionTtlSeconds: 28_800,
      loginTransactionTtlSeconds: 600,
    },
  });
  t.after(async () => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/auth/v1/demo/session",
    headers: { origin: "http://localhost:3000", "idempotency-key": "idem_dispute_login_001" },
  });
  const cookie = login.headers["set-cookie"] as string;
  const session = await app.inject({ method: "GET", url: "/auth/v1/session", headers: { cookie } });
  const csrf = session.json().csrf_token as string;
  const receiptList = await app.inject({ method: "GET", url: "/receipts", headers: { cookie } });
  const receiptId = receiptList.json<Array<{ receipt_id: string }>>()[0]?.receipt_id;
  assert.ok(receiptId);

  const forbidden = await app.inject({
    method: "POST",
    url: `/v1/receipts/${receiptId}/disputes`,
    headers: {
      cookie,
      origin: "https://attacker.example",
      "x-csrf-token": csrf,
      "idempotency-key": "idem_dispute_forbidden_001",
    },
    payload: { reason: "UNRECOGNIZED_PURCHASE" },
  });
  assert.equal(forbidden.statusCode, 403);

  const openRequest = {
    method: "POST" as const,
    url: `/v1/receipts/${receiptId}/disputes`,
    headers: {
      cookie,
      origin: "http://localhost:3000",
      "x-csrf-token": csrf,
      "idempotency-key": "idem_dispute_open_001",
      "x-correlation-id": "corr_dispute_open_001",
    },
    payload: { reason: "UNRECOGNIZED_PURCHASE" },
  };
  const [firstOpen, secondOpen] = await Promise.all([
    app.inject(openRequest),
    app.inject(openRequest),
  ]);
  assert.deepEqual([firstOpen.statusCode, secondOpen.statusCode].sort(), [200, 201]);
  const opened = firstOpen.statusCode === 201 ? firstOpen : secondOpen;
  const replay = firstOpen.statusCode === 200 ? firstOpen : secondOpen;

  assert.equal(opened.statusCode, 201, opened.body);
  assert.deepEqual(opened.json(), {
    dispute_id: opened.json().dispute_id,
    receipt_id: receiptId,
    order_id: opened.json().order_id,
    authorization_id: reservedAuthorizationFixture.authorization_id,
    payment_id: paid.json().payment_id,
    principal_id: mandateFixture.terms.principal_id,
    merchant_id: checkoutTermsFixture.merchant_id,
    reason: "UNRECOGNIZED_PURCHASE",
    status: "RESOLVED",
    verdict: "AUTHORIZED",
    liable_party: "PRINCIPAL",
    financial_outcome: "NO_CHARGEBACK",
    resolution_code: "VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE",
    evidence: {
      mandate_id: mandateFixture.terms.mandate_id,
      agent_id: travelBotFixture.agent_id,
      checkout_id: checkoutTermsFixture.checkout_id,
      policy_version: "bound.verify.v1",
      amount: checkoutTermsFixture.total,
      original_purchase_correlation_id: "corr_seed_authorization_001",
      checks: {
        receipt_ownership_verified: true,
        commercial_binding_verified: true,
        mandate_authority_verified: true,
        agent_identity_verified: true,
        payment_approved_verified: true,
        audit_chain_verified: true,
      },
      evidence_hash: opened.json().evidence.evidence_hash,
    },
    opened_at: "2026-08-29T12:05:00.000Z",
    resolved_at: "2026-08-29T12:05:00.000Z",
    audit_correlation_id: "corr_dispute_open_001",
  });

  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().dispute_id, opened.json().dispute_id);

  const read = await app.inject({
    method: "GET",
    url: `/v1/disputes/${opened.json().dispute_id}`,
    headers: { cookie },
  });
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.json(), opened.json());
  const receiptDispute = await app.inject({
    method: "GET",
    url: `/v1/receipts/${receiptId}/dispute`,
    headers: { cookie },
  });
  assert.equal(receiptDispute.statusCode, 200);
  assert.deepEqual(receiptDispute.json(), opened.json());

  const unauthenticated = await app.inject({ method: "GET", url: `/v1/disputes/${opened.json().dispute_id}` });
  assert.equal(unauthenticated.statusCode, 401);

  const timeline = await app.inject({ method: "GET", url: "/audit/corr_dispute_open_001" });
  assert.deepEqual(timeline.json().events.map((event: { event_type: string }) => event.event_type), [
    "dispute.opened",
    "dispute.evidence_evaluated",
    "dispute.resolved",
  ]);
});

integrationTest("incomplete authority evidence resolves an unrecognized purchase as a mock chargeback", async (t) => {
  assert.ok(testDatabaseUrl);
  assert.ok(database);
  const payment = await createPaymentScenario(t, "APPROVED");
  await seedReservedAuthorizationAuditEvent();
  const paid = await payment.sendPay("idem_dispute_invalid_payment_001", undefined, "corr_dispute_invalid_payment_001");
  assert.equal(paid.statusCode, 200);
  const receiptId = (await database.db.select({ receiptId: orders.receiptId }).from(orders).limit(1))[0]?.receiptId;
  assert.ok(receiptId);
  await database.db.update(authorizations)
    .set({ evidenceHash: "f".repeat(64) })
    .where(eq(authorizations.authorizationId, reservedAuthorizationFixture.authorization_id));

  const app = await buildApp({
    databaseUrl: testDatabaseUrl,
    logger: false,
    clock: { now: () => new Date("2026-08-29T12:06:00.000Z") },
    principalAuth: {
      mode: "demo",
      nodeEnvironment: "development",
      allowedOrigin: "http://localhost:3000",
      secureCookies: false,
      sessionTtlSeconds: 28_800,
      loginTransactionTtlSeconds: 600,
    },
  });
  t.after(async () => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/auth/v1/demo/session",
    headers: { origin: "http://localhost:3000", "idempotency-key": "idem_dispute_invalid_login_001" },
  });
  const cookie = login.headers["set-cookie"] as string;
  const session = await app.inject({ method: "GET", url: "/auth/v1/session", headers: { cookie } });
  const csrf = session.json().csrf_token as string;
  const opened = await app.inject({
    method: "POST",
    url: `/v1/receipts/${receiptId}/disputes`,
    headers: {
      cookie,
      origin: "http://localhost:3000",
      "x-csrf-token": csrf,
      "idempotency-key": "idem_dispute_invalid_open_001",
      "x-correlation-id": "corr_dispute_invalid_open_001",
    },
    payload: { reason: "UNRECOGNIZED_PURCHASE" },
  });

  assert.equal(opened.statusCode, 201, opened.body);
  assert.equal(opened.json().verdict, "UNAUTHORIZED");
  assert.equal(opened.json().liable_party, "MERCHANT");
  assert.equal(opened.json().financial_outcome, "CHARGEBACK_RECORDED");
  assert.equal(opened.json().resolution_code, "AUTHORITY_EVIDENCE_INCOMPLETE");
  assert.equal(opened.json().evidence.checks.agent_identity_verified, false);
  assert.equal(opened.json().evidence.checks.audit_chain_verified, true);
});
