import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  agentIdentityStatusSchema,
  authorizationStatusSchema,
  cabinClassSchema,
  ISO_4217_CURRENCIES,
  mandateStatusSchema,
  orderStatusSchema,
  paymentResultStatusSchema,
  proofTypeSchema,
  signatureAlgorithmSchema,
  type CommerceItem,
  type FlightFulfillment,
} from "../contracts/v1/index.js";

const identifierPattern = "^[A-Za-z0-9][A-Za-z0-9._:-]*$";
const sha256Pattern = "^[a-f0-9]{64}$";
const safeIntegerMaximum = 9_007_199_254_740_991;

function sqlString(value: string): SQL {
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

function sqlList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
}

function identifierCheck(column: Parameters<typeof sql>[0] extends never ? never : unknown): SQL {
  return sql`${column} ~ ${sqlString(identifierPattern)}`;
}

function hashCheck(column: unknown): SQL {
  return sql`${column} ~ ${sqlString(sha256Pattern)}`;
}

function currencyCheck(column: unknown): SQL {
  return sql`${column} IN (${sqlList(ISO_4217_CURRENCIES)})`;
}

function moneyCheck(column: unknown): SQL {
  return sql`${column} >= 0 AND ${column} <= ${sql.raw(String(safeIntegerMaximum))}`;
}

export const agents = pgTable("agents", {
  agentId: varchar("agent_id", { length: 128 }).primaryKey(),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  buildFingerprint: char("build_fingerprint", { length: 64 }).notNull(),
  verificationKeyId: varchar("verification_key_id", { length: 128 }).notNull(),
  verificationAlgorithm: varchar("verification_algorithm", { length: 16 }).notNull(),
  verificationPublicKey: text("verification_public_key").notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("agents_agent_principal_unique").on(table.agentId, table.principalId),
  unique("agents_verification_key_id_unique").on(table.verificationKeyId),
  unique("agents_idempotency_key_unique").on(table.idempotencyKey),
  check("agents_agent_id_check", identifierCheck(table.agentId)),
  check("agents_principal_id_check", identifierCheck(table.principalId)),
  check("agents_status_check", sql`${table.status} IN (${sqlList(agentIdentityStatusSchema.options)})`),
  check("agents_build_fingerprint_check", hashCheck(table.buildFingerprint)),
  check("agents_verification_key_id_check", identifierCheck(table.verificationKeyId)),
  check(
    "agents_verification_algorithm_check",
    sql`${table.status} <> 'ACTIVE' OR ${table.verificationAlgorithm} = 'ES256'`,
  ),
  check("agents_verification_public_key_check", sql`length(${table.verificationPublicKey}) BETWEEN 16 AND 8192`),
  check("agents_correlation_id_check", identifierCheck(table.correlationId)),
  check("agents_idempotency_key_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  index("agents_principal_id_idx").on(table.principalId),
  index("agents_status_idx").on(table.status),
]);

export const paymentCredentials = pgTable("payment_credentials", {
  credentialId: varchar("credential_id", { length: 128 }).primaryKey(),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  display: varchar("display", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("payment_credentials_id_principal_unique").on(table.credentialId, table.principalId),
  check("payment_credentials_id_check", identifierCheck(table.credentialId)),
  check("payment_credentials_principal_id_check", identifierCheck(table.principalId)),
  check("payment_credentials_display_check", sql`length(${table.display}) BETWEEN 1 AND 128`),
  index("payment_credentials_principal_id_idx").on(table.principalId),
]);

export const mandates = pgTable("mandates", {
  mandateId: varchar("mandate_id", { length: 128 }).primaryKey(),
  version: integer("version").notNull(),
  supersedesMandateId: varchar("supersedes_mandate_id", { length: 128 }),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  allowedMerchantIds: text("allowed_merchant_ids").array().notNull(),
  allowedMerchantCategories: text("allowed_merchant_categories").array().notNull(),
  routeOrigin: char("route_origin", { length: 3 }).notNull(),
  routeDestination: char("route_destination", { length: 3 }).notNull(),
  cabin: varchar("cabin", { length: 24 }).notNull(),
  maxPerPurchaseAmount: bigint("max_per_purchase_amount", { mode: "number" }).notNull(),
  maxPerPurchaseCurrency: char("max_per_purchase_currency", { length: 3 }).notNull(),
  maxAggregateAmount: bigint("max_aggregate_amount", { mode: "number" }).notNull(),
  maxAggregateCurrency: char("max_aggregate_currency", { length: 3 }).notNull(),
  maxUses: bigint("max_uses", { mode: "number" }).notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  credentialId: varchar("credential_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  termsHash: char("terms_hash", { length: 64 }),
  principalSignatureAlgorithm: varchar("principal_signature_algorithm", { length: 16 }),
  principalSignatureKeyId: varchar("principal_signature_key_id", { length: 128 }),
  principalSignatureValue: text("principal_signature_value"),
  creationRequestHash: char("creation_request_hash", { length: 64 }).notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  activationIdempotencyKey: varchar("activation_idempotency_key", { length: 128 }),
  revocationIdempotencyKey: varchar("revocation_idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("mandates_id_agent_principal_unique").on(table.mandateId, table.agentId, table.principalId),
  unique("mandates_id_agent_unique").on(table.mandateId, table.agentId),
  unique("mandates_idempotency_key_unique").on(table.idempotencyKey),
  unique("mandates_activation_idempotency_key_unique").on(table.activationIdempotencyKey),
  unique("mandates_revocation_idempotency_key_unique").on(table.revocationIdempotencyKey),
  foreignKey({
    name: "mandates_supersedes_fk",
    columns: [table.supersedesMandateId],
    foreignColumns: [table.mandateId],
  }),
  foreignKey({
    name: "mandates_agent_principal_fk",
    columns: [table.agentId, table.principalId],
    foreignColumns: [agents.agentId, agents.principalId],
  }),
  foreignKey({
    name: "mandates_credential_principal_fk",
    columns: [table.credentialId, table.principalId],
    foreignColumns: [paymentCredentials.credentialId, paymentCredentials.principalId],
  }),
  check("mandates_id_check", identifierCheck(table.mandateId)),
  check("mandates_version_check", sql`
    (${table.version} = 1 AND ${table.supersedesMandateId} IS NULL)
    OR (${table.version} > 1 AND ${table.supersedesMandateId} IS NOT NULL)
  `),
  check("mandates_scope_check", sql`cardinality(${table.allowedMerchantIds}) + cardinality(${table.allowedMerchantCategories}) > 0`),
  check("mandates_route_check", sql`
    ${table.routeOrigin} ~ '^[A-Z]{3}$'
    AND ${table.routeDestination} ~ '^[A-Z]{3}$'
    AND ${table.routeOrigin} <> ${table.routeDestination}
  `),
  check("mandates_cabin_check", sql`${table.cabin} IN (${sqlList(cabinClassSchema.options)})`),
  check("mandates_max_per_purchase_amount_check", moneyCheck(table.maxPerPurchaseAmount)),
  check("mandates_max_aggregate_amount_check", moneyCheck(table.maxAggregateAmount)),
  check("mandates_currency_check", sql`${currencyCheck(table.maxPerPurchaseCurrency)} AND ${currencyCheck(table.maxAggregateCurrency)} AND ${table.maxPerPurchaseCurrency} = ${table.maxAggregateCurrency}`),
  check("mandates_max_uses_check", sql`${table.maxUses} > 0 AND ${table.maxUses} <= ${sql.raw(String(safeIntegerMaximum))}`),
  check("mandates_validity_check", sql`${table.validFrom} < ${table.expiresAt}`),
  check("mandates_status_check", sql`${table.status} IN (${sqlList(mandateStatusSchema.options)})`),
  check("mandates_proof_check", sql`
    (${table.status} = 'DRAFT'
      AND ${table.termsHash} IS NULL
      AND ${table.principalSignatureAlgorithm} IS NULL
      AND ${table.principalSignatureKeyId} IS NULL
      AND ${table.principalSignatureValue} IS NULL
      AND ${table.activatedAt} IS NULL
      AND ${table.revokedAt} IS NULL)
    OR (${table.status} <> 'DRAFT'
      AND ${table.termsHash} IS NOT NULL
      AND ${hashCheck(table.termsHash)}
      AND ${table.principalSignatureAlgorithm} IN (${sqlList(signatureAlgorithmSchema.options)})
      AND ${table.principalSignatureKeyId} IS NOT NULL
      AND ${identifierCheck(table.principalSignatureKeyId)}
      AND length(${table.principalSignatureValue}) BETWEEN 16 AND 4096
      AND ${table.activatedAt} IS NOT NULL
      AND ((${table.status} = 'REVOKED' AND ${table.revokedAt} IS NOT NULL)
        OR (${table.status} <> 'REVOKED' AND ${table.revokedAt} IS NULL)))
  `),
  check("mandates_creation_request_hash_check", hashCheck(table.creationRequestHash)),
  check("mandates_correlation_id_check", identifierCheck(table.correlationId)),
  check("mandates_idempotency_key_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  check("mandates_activation_idempotency_key_check", sql`${table.activationIdempotencyKey} IS NULL OR (length(${table.activationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.activationIdempotencyKey)})`),
  check("mandates_revocation_idempotency_key_check", sql`${table.revocationIdempotencyKey} IS NULL OR (length(${table.revocationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.revocationIdempotencyKey)})`),
  index("mandates_agent_status_idx").on(table.agentId, table.status),
  index("mandates_principal_status_idx").on(table.principalId, table.status),
  index("mandates_expires_at_idx").on(table.expiresAt),
  index("mandates_supersedes_idx").on(table.supersedesMandateId),
]);

export const checkouts = pgTable("checkouts", {
  checkoutId: varchar("checkout_id", { length: 128 }).primaryKey(),
  merchantId: varchar("merchant_id", { length: 128 }).notNull(),
  merchantUrl: text("merchant_url").notNull(),
  items: jsonb("items").$type<CommerceItem[]>().notNull(),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  fulfillment: jsonb("fulfillment").$type<FlightFulfillment>().notNull(),
  protocolName: varchar("protocol_name", { length: 64 }).notNull(),
  protocolVersion: varchar("protocol_version", { length: 64 }).notNull(),
  checkoutHash: char("checkout_hash", { length: 64 }).notNull(),
  merchantSignatureAlgorithm: varchar("merchant_signature_algorithm", { length: 16 }).notNull(),
  merchantSignatureKeyId: varchar("merchant_signature_key_id", { length: 128 }).notNull(),
  merchantSignatureValue: text("merchant_signature_value").notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("checkouts_id_hash_unique").on(table.checkoutId, table.checkoutHash),
  unique("checkouts_idempotency_key_unique").on(table.idempotencyKey),
  check("checkouts_id_check", identifierCheck(table.checkoutId)),
  check("checkouts_merchant_id_check", identifierCheck(table.merchantId)),
  check("checkouts_items_check", sql`jsonb_typeof(${table.items}) = 'array' AND jsonb_array_length(${table.items}) > 0`),
  check("checkouts_amount_check", moneyCheck(table.totalAmount)),
  check("checkouts_currency_check", currencyCheck(table.currency)),
  check("checkouts_fulfillment_check", sql`jsonb_typeof(${table.fulfillment}) = 'object'`),
  check("checkouts_hash_check", hashCheck(table.checkoutHash)),
  check("checkouts_validity_check", sql`${table.createdAt} < ${table.expiresAt}`),
  check("checkouts_signature_algorithm_check", sql`${table.merchantSignatureAlgorithm} IN (${sqlList(signatureAlgorithmSchema.options)})`),
  check("checkouts_signature_key_id_check", identifierCheck(table.merchantSignatureKeyId)),
  check("checkouts_signature_value_check", sql`length(${table.merchantSignatureValue}) BETWEEN 16 AND 4096`),
  check("checkouts_correlation_id_check", identifierCheck(table.correlationId)),
  check("checkouts_idempotency_key_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  index("checkouts_merchant_expires_idx").on(table.merchantId, table.expiresAt),
  uniqueIndex("checkouts_hash_idx").on(table.checkoutHash),
]);

export const nonces = pgTable("nonces", {
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  nonce: varchar("nonce", { length: 128 }).notNull(),
  mandateId: varchar("mandate_id", { length: 128 }).notNull(),
  checkoutId: varchar("checkout_id", { length: 128 }).notNull(),
  checkoutHash: char("checkout_hash", { length: 64 }).notNull(),
  payloadHash: char("payload_hash", { length: 64 }).notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: "nonces_agent_nonce_pk", columns: [table.agentId, table.nonce] }),
  unique("nonces_payload_hash_unique").on(table.payloadHash),
  foreignKey({
    name: "nonces_mandate_agent_fk",
    columns: [table.mandateId, table.agentId],
    foreignColumns: [mandates.mandateId, mandates.agentId],
  }),
  foreignKey({
    name: "nonces_checkout_hash_fk",
    columns: [table.checkoutId, table.checkoutHash],
    foreignColumns: [checkouts.checkoutId, checkouts.checkoutHash],
  }),
  check("nonces_nonce_check", identifierCheck(table.nonce)),
  check("nonces_payload_hash_check", hashCheck(table.payloadHash)),
  check("nonces_checkout_hash_check", hashCheck(table.checkoutHash)),
  check("nonces_correlation_id_check", identifierCheck(table.correlationId)),
  check("nonces_validity_check", sql`${table.issuedAt} < ${table.expiresAt}`),
  index("nonces_mandate_recorded_idx").on(table.mandateId, table.recordedAt),
  index("nonces_checkout_id_idx").on(table.checkoutId),
]);

export const authorizations = pgTable("authorizations", {
  authorizationId: varchar("authorization_id", { length: 128 }).primaryKey(),
  mandateId: varchar("mandate_id", { length: 128 }).notNull(),
  checkoutId: varchar("checkout_id", { length: 128 }).notNull(),
  checkoutHash: char("checkout_hash", { length: 64 }).notNull(),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  merchantId: varchar("merchant_id", { length: 128 }).notNull(),
  allowedMerchantIds: text("allowed_merchant_ids").array().notNull(),
  maxAmount: bigint("max_amount", { mode: "number" }).notNull(),
  maxAmountCurrency: char("max_amount_currency", { length: 3 }).notNull(),
  maxUses: bigint("max_uses", { mode: "number" }).notNull(),
  reservedAmount: bigint("reserved_amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  proofType: varchar("proof_type", { length: 32 }).notNull(),
  proofReference: varchar("proof_reference", { length: 128 }).notNull(),
  proofHash: char("proof_hash", { length: 64 }).notNull(),
  requestHash: char("request_hash", { length: 64 }).notNull(),
  policyVersion: varchar("policy_version", { length: 64 }).notNull(),
  evidenceHash: char("evidence_hash", { length: 64 }).notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("authorizations_idempotency_key_unique").on(table.idempotencyKey),
  unique("authorizations_request_hash_unique").on(table.requestHash),
  unique("authorizations_checkout_id_unique").on(table.checkoutId),
  foreignKey({
    name: "authorizations_mandate_identity_fk",
    columns: [table.mandateId, table.agentId, table.principalId],
    foreignColumns: [mandates.mandateId, mandates.agentId, mandates.principalId],
  }),
  foreignKey({
    name: "authorizations_checkout_hash_fk",
    columns: [table.checkoutId, table.checkoutHash],
    foreignColumns: [checkouts.checkoutId, checkouts.checkoutHash],
  }),
  check("authorizations_id_check", identifierCheck(table.authorizationId)),
  check("authorizations_allowed_merchants_check", sql`cardinality(${table.allowedMerchantIds}) > 0 AND ${table.merchantId} = ANY(${table.allowedMerchantIds})`),
  check("authorizations_amount_check", sql`${moneyCheck(table.maxAmount)} AND ${moneyCheck(table.reservedAmount)} AND ${table.reservedAmount} <= ${table.maxAmount}`),
  check("authorizations_currency_check", sql`${currencyCheck(table.currency)} AND ${currencyCheck(table.maxAmountCurrency)} AND ${table.currency} = ${table.maxAmountCurrency}`),
  check("authorizations_max_uses_check", sql`${table.maxUses} > 0 AND ${table.maxUses} <= ${sql.raw(String(safeIntegerMaximum))}`),
  check("authorizations_status_check", sql`${table.status} IN (${sqlList(authorizationStatusSchema.options)})`),
  check("authorizations_proof_type_check", sql`${table.proofType} IN (${sqlList(proofTypeSchema.options)})`),
  check("authorizations_proof_reference_check", identifierCheck(table.proofReference)),
  check("authorizations_proof_hash_check", hashCheck(table.proofHash)),
  check("authorizations_request_hash_check", hashCheck(table.requestHash)),
  check("authorizations_policy_version_check", sql`length(${table.policyVersion}) BETWEEN 1 AND 64`),
  check("authorizations_evidence_hash_check", hashCheck(table.evidenceHash)),
  check("authorizations_checkout_hash_check", hashCheck(table.checkoutHash)),
  check("authorizations_correlation_id_check", identifierCheck(table.correlationId)),
  check("authorizations_idempotency_key_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  check("authorizations_validity_check", sql`${table.reservedAt} < ${table.expiresAt}`),
  index("authorizations_mandate_status_idx").on(table.mandateId, table.status),
  index("authorizations_checkout_id_idx").on(table.checkoutId),
  index("authorizations_status_expires_idx").on(table.status, table.expiresAt),
]);

export const payments = pgTable("payments", {
  paymentAttemptId: varchar("payment_attempt_id", { length: 128 }).primaryKey(),
  paymentId: varchar("payment_id", { length: 128 }),
  authorizationId: varchar("authorization_id", { length: 128 }).notNull().references(() => authorizations.authorizationId),
  credentialId: varchar("credential_id", { length: 128 }).notNull().references(() => paymentCredentials.credentialId),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: varchar("status", { length: 16 }),
  providerReference: varchar("provider_reference", { length: 128 }),
  declineCode: varchar("decline_code", { length: 128 }),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  providerIdempotencyKey: uuid("provider_idempotency_key").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("payments_payment_id_unique").on(table.paymentId),
  unique("payments_authorization_id_unique").on(table.authorizationId),
  unique("payments_provider_idempotency_key_unique").on(table.providerIdempotencyKey),
  check("payments_attempt_id_check", identifierCheck(table.paymentAttemptId)),
  check("payments_payment_id_check", sql`${table.paymentId} IS NULL OR ${identifierCheck(table.paymentId)}`),
  check("payments_amount_check", moneyCheck(table.amount)),
  check("payments_currency_check", currencyCheck(table.currency)),
  check("payments_status_check", sql`${table.status} IS NULL OR ${table.status} IN (${sqlList(paymentResultStatusSchema.options)})`),
  check("payments_result_shape_check", sql`
    (${table.status} IS NULL AND ${table.paymentId} IS NULL AND ${table.providerReference} IS NULL AND ${table.declineCode} IS NULL AND ${table.occurredAt} IS NULL)
    OR (${table.status} = 'APPROVED' AND ${table.paymentId} IS NOT NULL AND ${table.declineCode} IS NULL AND ${table.occurredAt} IS NOT NULL)
    OR (${table.status} = 'DECLINED' AND ${table.declineCode} IS NOT NULL AND ${table.providerReference} IS NULL AND ${table.occurredAt} IS NOT NULL)
    OR (${table.status} = 'TIMEOUT' AND ${table.paymentId} IS NULL AND ${table.providerReference} IS NULL AND ${table.declineCode} IS NULL AND ${table.occurredAt} IS NOT NULL)
    OR (${table.status} = 'UNKNOWN' AND ${table.providerReference} IS NULL AND ${table.declineCode} IS NULL AND ${table.occurredAt} IS NOT NULL)
  `),
  check("payments_correlation_id_check", identifierCheck(table.correlationId)),
  index("payments_authorization_created_idx").on(table.authorizationId, table.createdAt),
  index("payments_status_updated_idx").on(table.status, table.updatedAt),
]);

export const auditEvents = pgTable("audit_events", {
  eventId: varchar("event_id", { length: 128 }).primaryKey(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  subjectId: varchar("subject_id", { length: 128 }).notNull(),
  sanitizedPayload: jsonb("sanitized_payload").$type<Record<string, unknown>>(),
  payloadHash: char("payload_hash", { length: 64 }).notNull(),
  previousHash: char("previous_hash", { length: 64 }),
  eventHash: char("event_hash", { length: 64 }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("audit_events_event_hash_unique").on(table.eventHash),
  check("audit_events_event_id_check", identifierCheck(table.eventId)),
  check("audit_events_correlation_id_check", identifierCheck(table.correlationId)),
  check("audit_events_subject_id_check", identifierCheck(table.subjectId)),
  check("audit_events_event_type_check", sql`length(${table.eventType}) BETWEEN 1 AND 128`),
  check("audit_events_sanitized_payload_check", sql`${table.sanitizedPayload} IS NULL OR jsonb_typeof(${table.sanitizedPayload}) = 'object'`),
  check("audit_events_payload_hash_check", hashCheck(table.payloadHash)),
  check("audit_events_previous_hash_check", sql`${table.previousHash} IS NULL OR ${hashCheck(table.previousHash)}`),
  check("audit_events_event_hash_check", hashCheck(table.eventHash)),
  index("audit_events_correlation_recorded_idx").on(table.correlationId, table.recordedAt),
  index("audit_events_subject_recorded_idx").on(table.subjectId, table.recordedAt),
]);

export const orders = pgTable("orders", {
  orderId: varchar("order_id", { length: 128 }).primaryKey(),
  receiptId: varchar("receipt_id", { length: 128 }).notNull(),
  checkoutId: varchar("checkout_id", { length: 128 }).notNull().references(() => checkouts.checkoutId),
  authorizationId: varchar("authorization_id", { length: 128 }).notNull().references(() => authorizations.authorizationId),
  paymentId: varchar("payment_id", { length: 128 }).notNull().references(() => payments.paymentId),
  merchantId: varchar("merchant_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(),
  items: jsonb("items").$type<CommerceItem[]>().notNull(),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  fulfillment: jsonb("fulfillment").$type<FlightFulfillment>().notNull(),
  auditEventId: varchar("audit_event_id", { length: 128 }).notNull().references(() => auditEvents.eventId),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  unique("orders_receipt_id_unique").on(table.receiptId),
  unique("orders_payment_id_unique").on(table.paymentId),
  unique("orders_checkout_id_unique").on(table.checkoutId),
  unique("orders_authorization_id_unique").on(table.authorizationId),
  unique("orders_audit_event_id_unique").on(table.auditEventId),
  unique("orders_idempotency_key_unique").on(table.idempotencyKey),
  check("orders_order_id_check", identifierCheck(table.orderId)),
  check("orders_receipt_id_check", identifierCheck(table.receiptId)),
  check("orders_merchant_id_check", identifierCheck(table.merchantId)),
  check("orders_status_check", sql`${table.status} IN (${sqlList(orderStatusSchema.options)})`),
  check("orders_items_check", sql`jsonb_typeof(${table.items}) = 'array' AND jsonb_array_length(${table.items}) > 0`),
  check("orders_amount_check", moneyCheck(table.totalAmount)),
  check("orders_currency_check", currencyCheck(table.currency)),
  check("orders_fulfillment_check", sql`jsonb_typeof(${table.fulfillment}) = 'object'`),
  check("orders_correlation_id_check", identifierCheck(table.correlationId)),
  check("orders_idempotency_key_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  index("orders_checkout_id_idx").on(table.checkoutId),
  index("orders_authorization_id_idx").on(table.authorizationId),
  index("orders_merchant_issued_idx").on(table.merchantId, table.issuedAt),
]);

export const databaseSchema = {
  agents,
  paymentCredentials,
  mandates,
  checkouts,
  nonces,
  authorizations,
  payments,
  auditEvents,
  orders,
};
