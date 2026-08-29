import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

import {
  agentRequestProofFixture,
  canonicalizeJson,
  checkoutTermsFixture,
  mandateFixture,
  normalizedAuthorizationFixture,
  normalizedCheckoutFixture,
  reservedAuthorizationFixture,
  travelBotFixture,
} from "../src/contracts/v1/index.js";
import { createDatabase, type DatabaseConnection } from "../src/db/database.js";
import { migrateDatabase } from "../src/db/migrate.js";
import { DrizzleAgentIdentityRegistry } from "../src/modules/identity/registry.js";
import {
  agents,
  authorizations,
  checkouts,
  mandates,
  nonces,
  paymentCredentials,
  payments,
} from "../src/db/schema.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? test.skip : test;

let administrationPool: Pool | undefined;
let database: DatabaseConnection | undefined;

async function seedAuthorizationGraph(): Promise<void> {
  assert.ok(database);

  await database.transaction(async (tx) => {
    await tx.insert(agents).values({
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
    await tx.insert(paymentCredentials).values({
      credentialId: mandateFixture.terms.credential_id,
      principalId: mandateFixture.terms.principal_id,
      display: "Visa •••• 4242",
    });
    await tx.insert(mandates).values({
      mandateId: mandateFixture.terms.mandate_id,
      principalId: mandateFixture.terms.principal_id,
      agentId: mandateFixture.terms.agent_id,
      allowedMerchantIds: mandateFixture.terms.allowed_merchant_ids,
      maxPerPurchaseAmount: mandateFixture.terms.max_per_purchase.amount,
      maxPerPurchaseCurrency: mandateFixture.terms.max_per_purchase.currency,
      maxAggregateAmount: mandateFixture.terms.max_aggregate.amount,
      maxAggregateCurrency: mandateFixture.terms.max_aggregate.currency,
      maxUses: mandateFixture.terms.max_uses,
      validFrom: new Date(mandateFixture.terms.valid_from),
      expiresAt: new Date(mandateFixture.terms.expires_at),
      credentialId: mandateFixture.terms.credential_id,
      status: mandateFixture.status,
      termsHash: mandateFixture.terms_hash,
      principalSignatureAlgorithm: mandateFixture.principal_signature.algorithm,
      principalSignatureKeyId: mandateFixture.principal_signature.key_id,
      principalSignatureValue: mandateFixture.principal_signature.value,
      correlationId: "corr_seed_mandate_001",
      idempotencyKey: "idem_seed_mandate_001",
      createdAt: new Date(mandateFixture.created_at),
      activatedAt: new Date(mandateFixture.activated_at),
    });
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
  const { created_at: createdAt, ...registration } = travelBotFixture;
  void createdAt;
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
      mandateId: mandateFixture.terms.mandate_id,
      principalId: mandateFixture.terms.principal_id,
      agentId: mandateFixture.terms.agent_id,
      allowedMerchantIds: mandateFixture.terms.allowed_merchant_ids,
      maxPerPurchaseAmount: mandateFixture.terms.max_per_purchase.amount,
      maxPerPurchaseCurrency: mandateFixture.terms.max_per_purchase.currency,
      maxAggregateAmount: mandateFixture.terms.max_aggregate.amount,
      maxAggregateCurrency: mandateFixture.terms.max_aggregate.currency,
      maxUses: mandateFixture.terms.max_uses,
      validFrom: new Date(mandateFixture.terms.valid_from),
      expiresAt: new Date(mandateFixture.terms.expires_at),
      credentialId: mandateFixture.terms.credential_id,
      status: mandateFixture.status,
      termsHash: mandateFixture.terms_hash,
      principalSignatureAlgorithm: mandateFixture.principal_signature.algorithm,
      principalSignatureKeyId: mandateFixture.principal_signature.key_id,
      principalSignatureValue: mandateFixture.principal_signature.value,
      correlationId: "corr_orphan_mandate_001",
      idempotencyKey: "idem_orphan_mandate_001",
      createdAt: new Date(mandateFixture.created_at),
      activatedAt: new Date(mandateFixture.activated_at),
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
