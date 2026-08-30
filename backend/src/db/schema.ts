import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
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
  agentAttestationStatusSchema,
  authorizationStatusSchema,
  cabinClassSchema,
  ISO_4217_CURRENCIES,
  mandateStatusSchema,
  orderStatusSchema,
  paymentResultStatusSchema,
  proofTypeSchema,
  signatureAlgorithmSchema,
  travelApprovalStatusSchema,
  travelBotStateSchema,
  travelMessageRoleSchema,
  travelModelRunStatusSchema,
  travelSseEventTypeSchema,
  travelToolExecutionStatusSchema,
  travelWatchModeSchema,
  travelWatchStatusSchema,
  type CommerceItem,
  type ConditionalFlightConstraints,
  type FlightFulfillment,
  type OfferCandidate,
  type TravelIntent,
  type TravelWatchAuthority,
  type TravelWatchCriteria,
  type TravelWatchNearestMiss,
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

export const principals = pgTable("principals", {
  principalId: varchar("principal_id", { length: 128 }).primaryKey(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  check("principals_id_check", identifierCheck(table.principalId)),
  check("principals_display_name_check", sql`length(${table.displayName}) BETWEEN 1 AND 128`),
]);

export const principalAuthIdentities = pgTable("principal_auth_identities", {
  identityId: uuid("identity_id").primaryKey(),
  principalId: varchar("principal_id", { length: 128 }).notNull().references(() => principals.principalId),
  provider: varchar("provider", { length: 32 }).notNull(),
  issuer: varchar("issuer", { length: 512 }).notNull(),
  subjectHash: char("subject_hash", { length: 64 }).notNull(),
  verifiedEmailHash: char("verified_email_hash", { length: 64 }),
  maskedEmail: varchar("masked_email", { length: 128 }),
  assurance: varchar("assurance", { length: 16 }).notNull(),
  lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("principal_auth_issuer_subject_unique").on(table.issuer, table.subjectHash),
  check("principal_auth_subject_hash_check", hashCheck(table.subjectHash)),
  check("principal_auth_email_hash_check", sql`${table.verifiedEmailHash} IS NULL OR ${hashCheck(table.verifiedEmailHash)}`),
  check("principal_auth_assurance_check", sql`${table.assurance} IN ('DEMO', 'OIDC')`),
  index("principal_auth_principal_idx").on(table.principalId),
]);

export const principalLoginTransactions = pgTable("principal_login_transactions", {
  transactionId: uuid("transaction_id").primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  stateHash: char("state_hash", { length: 64 }).notNull(),
  nonceHash: char("nonce_hash", { length: 64 }).notNull(),
  pkceVerifierHash: char("pkce_verifier_hash", { length: 64 }).notNull(),
  pkceVerifierCiphertext: text("pkce_verifier_ciphertext").notNull(),
  redirectPath: varchar("redirect_path", { length: 256 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("principal_login_state_hash_unique").on(table.stateHash),
  check("principal_login_hashes_check", sql`${hashCheck(table.stateHash)} AND ${hashCheck(table.nonceHash)} AND ${hashCheck(table.pkceVerifierHash)}`),
  check("principal_login_redirect_check", sql`${table.redirectPath} ~ '^/[A-Za-z0-9/_?&=.-]*$'`),
  check("principal_login_validity_check", sql`${table.createdAt} < ${table.expiresAt}`),
  index("principal_login_expiry_idx").on(table.expiresAt),
]);

export const principalSessions = pgTable("principal_sessions", {
  sessionId: uuid("session_id").primaryKey(),
  principalId: varchar("principal_id", { length: 128 }).notNull().references(() => principals.principalId),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  csrfTokenHash: char("csrf_token_hash", { length: 64 }).notNull(),
  authMethod: varchar("auth_method", { length: 16 }).notNull(),
  assurance: varchar("assurance", { length: 16 }).notNull(),
  rotatedFromSessionId: uuid("rotated_from_session_id"),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("principal_sessions_token_hash_unique").on(table.tokenHash),
  check("principal_sessions_hashes_check", sql`${hashCheck(table.tokenHash)} AND ${hashCheck(table.csrfTokenHash)}`),
  check("principal_sessions_assurance_check", sql`${table.assurance} IN ('DEMO', 'OIDC')`),
  check("principal_sessions_validity_check", sql`${table.issuedAt} < ${table.expiresAt}`),
  index("principal_sessions_active_idx").on(table.tokenHash, table.expiresAt, table.revokedAt),
  index("principal_sessions_principal_idx").on(table.principalId, table.expiresAt),
]);

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

export const agentAttestations = pgTable("agent_attestations", {
  attestationId: varchar("attestation_id", { length: 128 }).primaryKey(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  principalId: varchar("principal_id", { length: 128 }).notNull().references(() => principals.principalId),
  keyId: varchar("key_id", { length: 128 }).notNull(),
  buildFingerprint: char("build_fingerprint", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerAssessmentHash: char("provider_assessment_hash", { length: 64 }).notNull(),
  providerAssessmentCiphertext: text("provider_assessment_ciphertext").notNull(),
  providerSubjectHash: char("provider_subject_hash", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull(),
  normalizedClaims: text("normalized_claims").array().notNull(),
  assuranceLevel: varchar("assurance_level", { length: 64 }).notNull(),
  bindingHash: char("binding_hash", { length: 64 }).notNull(),
  evidenceHash: char("evidence_hash", { length: 64 }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
  failureCode: varchar("failure_code", { length: 64 }),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  creationIdempotencyKey: varchar("creation_idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("agent_attestations_creation_idempotency_unique").on(table.creationIdempotencyKey),
  unique("agent_attestations_provider_assessment_unique").on(table.provider, table.providerAssessmentHash),
  foreignKey({
    name: "agent_attestations_agent_principal_fk",
    columns: [table.agentId, table.principalId],
    foreignColumns: [agents.agentId, agents.principalId],
  }),
  check("agent_attestations_id_check", identifierCheck(table.attestationId)),
  check("agent_attestations_status_check", sql`${table.status} IN (${sqlList(agentAttestationStatusSchema.options)})`),
  check("agent_attestations_hashes_check", sql`${hashCheck(table.providerAssessmentHash)} AND ${hashCheck(table.buildFingerprint)} AND ${hashCheck(table.bindingHash)} AND ${hashCheck(table.evidenceHash)} AND (${table.providerSubjectHash} IS NULL OR ${hashCheck(table.providerSubjectHash)})`),
  check("agent_attestations_verified_check", sql`${table.status} <> 'VERIFIED' OR (cardinality(${table.normalizedClaims}) > 0 AND ${table.providerSubjectHash} IS NOT NULL AND ${table.issuedAt} IS NOT NULL AND ${table.expiresAt} IS NOT NULL AND ${table.issuedAt} < ${table.expiresAt})`),
  check("agent_attestations_idempotency_check", sql`length(${table.creationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.creationIdempotencyKey)}`),
  index("agent_attestations_current_idx").on(table.agentId, table.status, table.expiresAt),
]);

export const agentAttestationEvents = pgTable("agent_attestation_events", {
  eventId: uuid("event_id").primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerEventIdHash: char("provider_event_id_hash", { length: 64 }).notNull(),
  attestationId: varchar("attestation_id", { length: 128 }).notNull().references(() => agentAttestations.attestationId),
  normalizedEventType: varchar("normalized_event_type", { length: 64 }).notNull(),
  payloadHash: char("payload_hash", { length: 64 }).notNull(),
  signatureVerified: boolean("signature_verified").notNull(),
  processingStatus: varchar("processing_status", { length: 24 }).notNull(),
  failureCode: varchar("failure_code", { length: 64 }),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true, mode: "date" }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("agent_attestation_events_provider_event_unique").on(table.provider, table.providerEventIdHash),
  check("agent_attestation_events_hashes_check", sql`${hashCheck(table.providerEventIdHash)} AND ${hashCheck(table.payloadHash)}`),
  check("agent_attestation_events_processing_check", sql`${table.processingStatus} IN ('APPLIED', 'DUPLICATE', 'IGNORED_OUT_OF_ORDER', 'REJECTED')`),
  index("agent_attestation_events_attestation_received_idx").on(table.attestationId, table.receivedAt),
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
  flightConstraints: jsonb("flight_constraints").$type<ConditionalFlightConstraints>(),
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
  check("mandates_flight_constraints_check", sql`${table.flightConstraints} IS NULL OR jsonb_typeof(${table.flightConstraints}) = 'object'`),
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

export const mandateBiometricConsents = pgTable("mandate_biometric_consents", {
  consentId: varchar("consent_id", { length: 128 }).primaryKey(),
  mandateId: varchar("mandate_id", { length: 128 }).notNull().references(() => mandates.mandateId),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  termsHash: char("terms_hash", { length: 64 }).notNull(),
  onboardingAttestationId: varchar("onboarding_attestation_id", { length: 128 }).notNull().references(() => agentAttestations.attestationId),
  provider: varchar("provider", { length: 32 }).notNull(),
  providerVendorDataHash: char("provider_vendor_data_hash", { length: 64 }).notNull(),
  providerVendorDataCiphertext: text("provider_vendor_data_ciphertext").notNull(),
  providerAssessmentHash: char("provider_assessment_hash", { length: 64 }),
  providerAssessmentCiphertext: text("provider_assessment_ciphertext"),
  hostedUrlCiphertext: text("hosted_url_ciphertext"),
  status: varchar("status", { length: 16 }).notNull(),
  evidenceHash: char("evidence_hash", { length: 64 }).notNull(),
  failureCode: varchar("failure_code", { length: 64 }),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  creationIdempotencyKey: varchar("creation_idempotency_key", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("mandate_biometric_consents_creation_idempotency_unique").on(table.creationIdempotencyKey),
  unique("mandate_biometric_consents_provider_assessment_unique").on(table.provider, table.providerAssessmentHash),
  foreignKey({
    name: "mandate_biometric_consents_identity_fk",
    columns: [table.mandateId, table.agentId, table.principalId],
    foreignColumns: [mandates.mandateId, mandates.agentId, mandates.principalId],
  }),
  check("mandate_biometric_consents_id_check", identifierCheck(table.consentId)),
  check("mandate_biometric_consents_status_check", sql`${table.status} IN ('PREPARING', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ERROR', 'CONSUMED')`),
  check("mandate_biometric_consents_hashes_check", sql`${hashCheck(table.termsHash)} AND ${hashCheck(table.providerVendorDataHash)} AND ${hashCheck(table.evidenceHash)} AND (${table.providerAssessmentHash} IS NULL OR ${hashCheck(table.providerAssessmentHash)})`),
  check("mandate_biometric_consents_provider_shape_check", sql`
    (${table.status} IN ('PREPARING', 'ERROR') OR (${table.providerAssessmentHash} IS NOT NULL AND ${table.providerAssessmentCiphertext} IS NOT NULL))
    AND (${table.status} <> 'VERIFIED' OR ${table.verifiedAt} IS NOT NULL)
    AND (${table.status} <> 'CONSUMED' OR (${table.verifiedAt} IS NOT NULL AND ${table.consumedAt} IS NOT NULL))
  `),
  check("mandate_biometric_consents_idempotency_check", sql`length(${table.creationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.creationIdempotencyKey)}`),
  check("mandate_biometric_consents_validity_check", sql`${table.createdAt} < ${table.expiresAt}`),
  index("mandate_biometric_consents_mandate_status_idx").on(table.mandateId, table.status, table.expiresAt),
  index("mandate_biometric_consents_provider_idx").on(table.provider, table.providerAssessmentHash),
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
  deduplicationKey: varchar("deduplication_key", { length: 256 }),
  recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("audit_events_event_hash_unique").on(table.eventHash),
  unique("audit_events_deduplication_key_unique").on(table.deduplicationKey),
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

export const travelConversations = pgTable("travel_conversations", {
  conversationId: uuid("conversation_id").primaryKey(),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  state: varchar("state", { length: 48 }).notNull(),
  version: integer("version").default(0).notNull(),
  intent: jsonb("intent").$type<TravelIntent>().notNull(),
  offers: jsonb("offers").$type<OfferCandidate[]>().notNull(),
  activeRunId: uuid("active_run_id"),
  selectedCheckoutId: varchar("selected_checkout_id", { length: 128 }),
  selectedCheckoutHash: char("selected_checkout_hash", { length: 64 }),
  mandateId: varchar("mandate_id", { length: 128 }),
  authorizationId: varchar("authorization_id", { length: 128 }),
  receiptId: varchar("receipt_id", { length: 128 }),
  creationRequestHash: char("creation_request_hash", { length: 64 }).notNull(),
  creationIdempotencyKey: varchar("creation_idempotency_key", { length: 128 }).notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_conversations_creation_idempotency_unique").on(table.creationIdempotencyKey),
  foreignKey({
    name: "travel_conversations_agent_principal_fk",
    columns: [table.agentId, table.principalId],
    foreignColumns: [agents.agentId, agents.principalId],
  }),
  check("travel_conversations_state_check", sql`${table.state} IN (${sqlList(travelBotStateSchema.options)})`),
  check("travel_conversations_version_check", sql`${table.version} >= 0`),
  check("travel_conversations_intent_check", sql`jsonb_typeof(${table.intent}) = 'object'`),
  check("travel_conversations_offers_check", sql`jsonb_typeof(${table.offers}) = 'array'`),
  check("travel_conversations_checkout_hash_check", sql`${table.selectedCheckoutHash} IS NULL OR ${hashCheck(table.selectedCheckoutHash)}`),
  check("travel_conversations_creation_hash_check", hashCheck(table.creationRequestHash)),
  check("travel_conversations_idempotency_check", sql`length(${table.creationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.creationIdempotencyKey)}`),
  check("travel_conversations_correlation_check", identifierCheck(table.correlationId)),
  index("travel_conversations_principal_updated_idx").on(table.principalId, table.updatedAt),
  index("travel_conversations_state_idx").on(table.state),
]);

export const travelMessages = pgTable("travel_messages", {
  messageId: uuid("message_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  sequence: integer("sequence").notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  contentHash: char("content_hash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_messages_conversation_sequence_unique").on(table.conversationId, table.sequence),
  unique("travel_messages_idempotency_unique").on(table.idempotencyKey),
  check("travel_messages_sequence_check", sql`${table.sequence} > 0`),
  check("travel_messages_role_check", sql`${table.role} IN (${sqlList(travelMessageRoleSchema.options)})`),
  check("travel_messages_content_check", sql`length(${table.content}) BETWEEN 1 AND 8000`),
  check("travel_messages_content_hash_check", hashCheck(table.contentHash)),
  check("travel_messages_idempotency_check", sql`${table.idempotencyKey} IS NULL OR (length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)})`),
  check("travel_messages_correlation_check", identifierCheck(table.correlationId)),
  index("travel_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const travelIntentSnapshots = pgTable("travel_intent_snapshots", {
  snapshotId: uuid("snapshot_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  conversationVersion: integer("conversation_version").notNull(),
  state: varchar("state", { length: 48 }).notNull(),
  intent: jsonb("intent").$type<TravelIntent>().notNull(),
  invalidatedFields: text("invalidated_fields").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_intent_snapshots_version_unique").on(table.conversationId, table.conversationVersion),
  check("travel_intent_snapshots_version_check", sql`${table.conversationVersion} >= 0`),
  check("travel_intent_snapshots_state_check", sql`${table.state} IN (${sqlList(travelBotStateSchema.options)})`),
  check("travel_intent_snapshots_intent_check", sql`jsonb_typeof(${table.intent}) = 'object'`),
  index("travel_intent_snapshots_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const travelModelRuns = pgTable("travel_model_runs", {
  runId: uuid("run_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  inputMessageId: uuid("input_message_id").notNull().references(() => travelMessages.messageId),
  status: varchar("status", { length: 24 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  requestHash: char("request_hash", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  providerRunId: varchar("provider_run_id", { length: 128 }),
  providerResponseId: varchar("provider_response_id", { length: 128 }),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  errorCode: varchar("error_code", { length: 64 }),
  retryable: integer("retryable").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("travel_model_runs_idempotency_unique").on(table.idempotencyKey),
  check("travel_model_runs_status_check", sql`${table.status} IN (${sqlList(travelModelRunStatusSchema.options)})`),
  check("travel_model_runs_request_hash_check", hashCheck(table.requestHash)),
  check("travel_model_runs_idempotency_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  check("travel_model_runs_correlation_check", identifierCheck(table.correlationId)),
  check("travel_model_runs_usage_check", sql`(${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0) AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0) AND (${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0)`),
  check("travel_model_runs_retryable_check", sql`${table.retryable} IN (0, 1)`),
  index("travel_model_runs_conversation_started_idx").on(table.conversationId, table.startedAt),
]);

export const travelToolExecutions = pgTable("travel_tool_executions", {
  executionId: uuid("execution_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  runId: uuid("run_id").notNull().references(() => travelModelRuns.runId),
  toolCallId: varchar("tool_call_id", { length: 128 }).notNull(),
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  argumentsHash: char("arguments_hash", { length: 64 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorCode: varchar("error_code", { length: 64 }),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("travel_tool_executions_call_unique").on(table.runId, table.toolCallId),
  unique("travel_tool_executions_idempotency_unique").on(table.idempotencyKey),
  check("travel_tool_executions_tool_call_check", identifierCheck(table.toolCallId)),
  check("travel_tool_executions_tool_name_check", sql`${table.toolName} IN ('find_offers', 'create_checkout', 'prepare_authority', 'request_purchase', 'get_receipt', 'get_audit_timeline')`),
  check("travel_tool_executions_arguments_hash_check", hashCheck(table.argumentsHash)),
  check("travel_tool_executions_status_check", sql`${table.status} IN (${sqlList(travelToolExecutionStatusSchema.options)})`),
  check("travel_tool_executions_result_check", sql`${table.result} IS NULL OR jsonb_typeof(${table.result}) = 'object'`),
  check("travel_tool_executions_idempotency_check", sql`length(${table.idempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.idempotencyKey)}`),
  index("travel_tool_executions_conversation_started_idx").on(table.conversationId, table.startedAt),
]);

export const travelApprovals = pgTable("travel_approvals", {
  approvalId: uuid("approval_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  runId: uuid("run_id").notNull().references(() => travelModelRuns.runId),
  toolCallId: varchar("tool_call_id", { length: 128 }).notNull(),
  merchantId: varchar("merchant_id", { length: 128 }).notNull(),
  checkoutHash: char("checkout_hash", { length: 64 }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  mandateId: varchar("mandate_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  sdkRunState: text("sdk_run_state").notNull(),
  decisionIdempotencyKey: varchar("decision_idempotency_key", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  unique("travel_approvals_run_tool_call_unique").on(table.runId, table.toolCallId),
  unique("travel_approvals_decision_idempotency_unique").on(table.decisionIdempotencyKey),
  check("travel_approvals_tool_call_check", identifierCheck(table.toolCallId)),
  check("travel_approvals_checkout_hash_check", hashCheck(table.checkoutHash)),
  check("travel_approvals_amount_check", moneyCheck(table.amount)),
  check("travel_approvals_currency_check", currencyCheck(table.currency)),
  check("travel_approvals_status_check", sql`${table.status} IN (${sqlList(travelApprovalStatusSchema.options)})`),
  check("travel_approvals_state_check", sql`length(${table.sdkRunState}) BETWEEN 2 AND 1000000`),
  check("travel_approvals_decision_idempotency_check", sql`${table.decisionIdempotencyKey} IS NULL OR (length(${table.decisionIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.decisionIdempotencyKey)})`),
  index("travel_approvals_conversation_status_idx").on(table.conversationId, table.status),
]);

export const travelSseEvents = pgTable("travel_sse_events", {
  eventId: uuid("event_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  sequence: integer("sequence").notNull(),
  eventType: varchar("event_type", { length: 48 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_sse_events_conversation_sequence_unique").on(table.conversationId, table.sequence),
  check("travel_sse_events_sequence_check", sql`${table.sequence} > 0`),
  check("travel_sse_events_type_check", sql`${table.eventType} IN (${sqlList(travelSseEventTypeSchema.options)})`),
  check("travel_sse_events_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`),
  index("travel_sse_events_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const travelWatches = pgTable("travel_watches", {
  watchId: uuid("watch_id").primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => travelConversations.conversationId),
  principalId: varchar("principal_id", { length: 128 }).notNull(),
  agentId: varchar("agent_id", { length: 128 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  criteria: jsonb("criteria").$type<TravelWatchCriteria>().notNull(),
  criteriaHash: char("criteria_hash", { length: 64 }).notNull(),
  mandateId: varchar("mandate_id", { length: 128 }).notNull().references(() => mandates.mandateId),
  authority: jsonb("authority").$type<TravelWatchAuthority>().notNull(),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true, mode: "date" }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true, mode: "date" }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  lastOutcome: varchar("last_outcome", { length: 32 }),
  nearestMiss: jsonb("nearest_miss").$type<TravelWatchNearestMiss>(),
  matchedOfferId: varchar("matched_offer_id", { length: 128 }),
  matchedOffer: jsonb("matched_offer").$type<OfferCandidate>(),
  receiptId: varchar("receipt_id", { length: 128 }),
  version: integer("version").default(1).notNull(),
  creationRequestHash: char("creation_request_hash", { length: 64 }).notNull(),
  creationIdempotencyKey: varchar("creation_idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_watches_creation_idempotency_unique").on(table.creationIdempotencyKey),
  foreignKey({
    name: "travel_watches_agent_principal_fk",
    columns: [table.agentId, table.principalId],
    foreignColumns: [agents.agentId, agents.principalId],
  }),
  check("travel_watches_mode_check", sql`${table.mode} IN (${sqlList(travelWatchModeSchema.options)})`),
  check("travel_watches_status_check", sql`${table.status} IN (${sqlList(travelWatchStatusSchema.options)})`),
  check("travel_watches_criteria_check", sql`jsonb_typeof(${table.criteria}) = 'object' AND ${hashCheck(table.criteriaHash)}`),
  check("travel_watches_authority_check", sql`jsonb_typeof(${table.authority}) = 'object'`),
  check("travel_watches_attempts_check", sql`${table.attemptCount} >= 0 AND ${table.consecutiveFailures} >= 0`),
  check("travel_watches_outcome_check", sql`${table.lastOutcome} IS NULL OR ${table.lastOutcome} IN ('MATCH_FOUND', 'OVER_BUDGET', 'NO_INVENTORY')`),
  check("travel_watches_nearest_check", sql`${table.nearestMiss} IS NULL OR jsonb_typeof(${table.nearestMiss}) = 'object'`),
  check("travel_watches_matched_offer_check", sql`${table.matchedOffer} IS NULL OR jsonb_typeof(${table.matchedOffer}) = 'object'`),
  check("travel_watches_version_check", sql`${table.version} > 0`),
  check("travel_watches_request_hash_check", hashCheck(table.creationRequestHash)),
  check("travel_watches_creation_idempotency_check", sql`length(${table.creationIdempotencyKey}) BETWEEN 8 AND 128 AND ${identifierCheck(table.creationIdempotencyKey)}`),
  index("travel_watches_due_idx").on(table.status, table.nextCheckAt),
  index("travel_watches_conversation_idx").on(table.conversationId, table.updatedAt),
]);

export const travelWatchChecks = pgTable("travel_watch_checks", {
  checkId: uuid("check_id").primaryKey(),
  watchId: uuid("watch_id").notNull().references(() => travelWatches.watchId),
  attempt: integer("attempt").notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  nearestMiss: jsonb("nearest_miss").$type<TravelWatchNearestMiss>(),
  matchedOfferId: varchar("matched_offer_id", { length: 128 }),
  receiptId: varchar("receipt_id", { length: 128 }),
  errorCode: varchar("error_code", { length: 64 }),
  observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  unique("travel_watch_checks_attempt_unique").on(table.watchId, table.attempt),
  check("travel_watch_checks_attempt_check", sql`${table.attempt} > 0`),
  check("travel_watch_checks_outcome_check", sql`${table.outcome} IN ('MATCH_FOUND', 'OVER_BUDGET', 'NO_INVENTORY', 'PURCHASED', 'ERROR')`),
  check("travel_watch_checks_nearest_check", sql`${table.nearestMiss} IS NULL OR jsonb_typeof(${table.nearestMiss}) = 'object'`),
  index("travel_watch_checks_watch_idx").on(table.watchId, table.completedAt),
]);

export const databaseSchema = {
  principals,
  principalAuthIdentities,
  principalLoginTransactions,
  principalSessions,
  agents,
  agentAttestations,
  agentAttestationEvents,
  paymentCredentials,
  mandates,
  mandateBiometricConsents,
  checkouts,
  nonces,
  authorizations,
  payments,
  auditEvents,
  orders,
  travelConversations,
  travelMessages,
  travelIntentSnapshots,
  travelModelRuns,
  travelToolExecutions,
  travelApprovals,
  travelSseEvents,
  travelWatches,
  travelWatchChecks,
};
