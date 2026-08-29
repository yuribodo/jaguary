import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

import { buildApp } from "../src/app.js";
import {
  agentRequestProofFixture,
  canonicalizeJson,
  checkoutTermsFixture,
  mandateFixture,
  mandateSchema,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  reservedAuthorizationFixture,
  sha256CanonicalJson,
  travelBotFixture,
  type CreateMandateDraftInput,
} from "../src/contracts/v1/index.js";
import {
  createDatabase,
  type DatabaseConnection,
  type TransactionClient,
} from "../src/db/database.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { DrizzleAgentIdentityRegistry } from "../src/modules/identity/registry.js";
import {
  agents,
  auditEvents,
  authorizations,
  checkouts,
  mandates,
  nonces,
  paymentCredentials,
  payments,
} from "../src/db/schema.js";
import { EphemeralEs256Signer } from "../src/modules/vuelaya/index.js";
import { MandateService } from "../src/modules/mandates/index.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? test.skip : test;

let administrationPool: Pool | undefined;
let database: DatabaseConnection | undefined;

async function insertMandateReferences(transaction: TransactionClient): Promise<void> {
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
      correlationId: "corr_seed_authorization_001",
      idempotencyKey: "idem_seed_authorization_001",
      reservedAt: new Date(reservedAuthorizationFixture.reserved_at),
      expiresAt: new Date(reservedAuthorizationFixture.expires_at),
    });
  });
}

async function seedMandateReferences(): Promise<void> {
  assert.ok(database);
  await database.transaction(insertMandateReferences);
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
      "agents",
      "audit_events",
      "authorizations",
      "checkouts",
      "mandates",
      "nonces",
      "orders",
      "payment_credentials",
      "payments",
    ],
  );
});

integrationTest("a successful transaction commits all writes", async () => {
  assert.ok(database);

  await database.transaction(async (tx) => {
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
  const registry = new DrizzleAgentIdentityRegistry(database.db, {
    now: () => new Date(travelBotFixture.created_at),
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

integrationTest("a duplicate payment idempotency key is rejected", async () => {
  assert.ok(database);
  await seedAuthorizationGraph();

  const paymentAttempt = {
    paymentAttemptId: "payment_attempt_001",
    authorizationId: reservedAuthorizationFixture.authorization_id,
    credentialId: mandateFixture.terms.credential_id,
    amount: reservedAuthorizationFixture.reserved_amount.amount,
    currency: reservedAuthorizationFixture.reserved_amount.currency,
    correlationId: "corr_payment_001",
    idempotencyKey: "idem_payment_authorization_001",
  };

  await database.db.insert(payments).values(paymentAttempt);
  await assert.rejects(
    database.db.insert(payments).values({
      ...paymentAttempt,
      paymentAttemptId: "payment_attempt_002",
    }),
    (error: unknown) => hasPostgresCode(error, "23505"),
  );
});

integrationTest("foreign keys reject a mandate for an unknown agent", async () => {
  assert.ok(database);

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
