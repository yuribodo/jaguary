CREATE TABLE "agent_attestation_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id_hash" char(64) NOT NULL,
	"attestation_id" varchar(128) NOT NULL,
	"normalized_event_type" varchar(64) NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"signature_verified" boolean NOT NULL,
	"processing_status" varchar(24) NOT NULL,
	"failure_code" varchar(64),
	"provider_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "agent_attestation_events_provider_event_unique" UNIQUE("provider","provider_event_id_hash"),
	CONSTRAINT "agent_attestation_events_hashes_check" CHECK ("agent_attestation_events"."provider_event_id_hash" ~ '^[a-f0-9]{64}$' AND "agent_attestation_events"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "agent_attestation_events_processing_check" CHECK ("agent_attestation_events"."processing_status" IN ('APPLIED', 'DUPLICATE', 'IGNORED_OUT_OF_ORDER', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "agent_attestations" (
	"attestation_id" varchar(128) PRIMARY KEY NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"key_id" varchar(128) NOT NULL,
	"build_fingerprint" char(64) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_assessment_hash" char(64) NOT NULL,
	"provider_assessment_ciphertext" text NOT NULL,
	"provider_subject_hash" char(64),
	"status" varchar(16) NOT NULL,
	"normalized_claims" text[] NOT NULL,
	"assurance_level" varchar(64) NOT NULL,
	"binding_hash" char(64) NOT NULL,
	"evidence_hash" char(64) NOT NULL,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"failure_code" varchar(64),
	"correlation_id" varchar(128) NOT NULL,
	"creation_idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_attestations_creation_idempotency_unique" UNIQUE("creation_idempotency_key"),
	CONSTRAINT "agent_attestations_provider_assessment_unique" UNIQUE("provider","provider_assessment_hash"),
	CONSTRAINT "agent_attestations_id_check" CHECK ("agent_attestations"."attestation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "agent_attestations_status_check" CHECK ("agent_attestations"."status" IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED', 'ERROR')),
	CONSTRAINT "agent_attestations_hashes_check" CHECK ("agent_attestations"."provider_assessment_hash" ~ '^[a-f0-9]{64}$' AND "agent_attestations"."build_fingerprint" ~ '^[a-f0-9]{64}$' AND "agent_attestations"."binding_hash" ~ '^[a-f0-9]{64}$' AND "agent_attestations"."evidence_hash" ~ '^[a-f0-9]{64}$' AND ("agent_attestations"."provider_subject_hash" IS NULL OR "agent_attestations"."provider_subject_hash" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "agent_attestations_verified_check" CHECK ("agent_attestations"."status" <> 'VERIFIED' OR (cardinality("agent_attestations"."normalized_claims") > 0 AND "agent_attestations"."provider_subject_hash" IS NOT NULL AND "agent_attestations"."issued_at" IS NOT NULL AND "agent_attestations"."expires_at" IS NOT NULL AND "agent_attestations"."issued_at" < "agent_attestations"."expires_at")),
	CONSTRAINT "agent_attestations_idempotency_check" CHECK (length("agent_attestations"."creation_idempotency_key") BETWEEN 8 AND 128 AND "agent_attestations"."creation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "principal_auth_identities" (
	"identity_id" uuid PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"issuer" varchar(512) NOT NULL,
	"subject_hash" char(64) NOT NULL,
	"verified_email_hash" char(64),
	"masked_email" varchar(128),
	"assurance" varchar(16) NOT NULL,
	"last_authenticated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "principal_auth_issuer_subject_unique" UNIQUE("issuer","subject_hash"),
	CONSTRAINT "principal_auth_subject_hash_check" CHECK ("principal_auth_identities"."subject_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "principal_auth_email_hash_check" CHECK ("principal_auth_identities"."verified_email_hash" IS NULL OR "principal_auth_identities"."verified_email_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "principal_auth_assurance_check" CHECK ("principal_auth_identities"."assurance" IN ('DEMO', 'OIDC'))
);
--> statement-breakpoint
CREATE TABLE "principal_login_transactions" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"state_hash" char(64) NOT NULL,
	"nonce_hash" char(64) NOT NULL,
	"pkce_verifier_hash" char(64) NOT NULL,
	"pkce_verifier_ciphertext" text NOT NULL,
	"redirect_path" varchar(256) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "principal_login_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "principal_login_hashes_check" CHECK ("principal_login_transactions"."state_hash" ~ '^[a-f0-9]{64}$' AND "principal_login_transactions"."nonce_hash" ~ '^[a-f0-9]{64}$' AND "principal_login_transactions"."pkce_verifier_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "principal_login_redirect_check" CHECK ("principal_login_transactions"."redirect_path" ~ '^/[A-Za-z0-9/_?&=.-]*$'),
	CONSTRAINT "principal_login_validity_check" CHECK ("principal_login_transactions"."created_at" < "principal_login_transactions"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "principal_sessions" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"csrf_token_hash" char(64) NOT NULL,
	"auth_method" varchar(16) NOT NULL,
	"assurance" varchar(16) NOT NULL,
	"rotated_from_session_id" uuid,
	"issued_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "principal_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "principal_sessions_hashes_check" CHECK ("principal_sessions"."token_hash" ~ '^[a-f0-9]{64}$' AND "principal_sessions"."csrf_token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "principal_sessions_assurance_check" CHECK ("principal_sessions"."assurance" IN ('DEMO', 'OIDC')),
	CONSTRAINT "principal_sessions_validity_check" CHECK ("principal_sessions"."issued_at" < "principal_sessions"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"principal_id" varchar(128) PRIMARY KEY NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "principals_id_check" CHECK ("principals"."principal_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "principals_display_name_check" CHECK (length("principals"."display_name") BETWEEN 1 AND 128)
);
--> statement-breakpoint
ALTER TABLE "agent_attestation_events" ADD CONSTRAINT "agent_attestation_events_attestation_id_agent_attestations_attestation_id_fk" FOREIGN KEY ("attestation_id") REFERENCES "public"."agent_attestations"("attestation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_attestations" ADD CONSTRAINT "agent_attestations_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_attestations" ADD CONSTRAINT "agent_attestations_agent_principal_fk" FOREIGN KEY ("agent_id","principal_id") REFERENCES "public"."agents"("agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "principal_auth_identities" ADD CONSTRAINT "principal_auth_identities_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "principal_sessions" ADD CONSTRAINT "principal_sessions_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_attestation_events_attestation_received_idx" ON "agent_attestation_events" USING btree ("attestation_id","received_at");--> statement-breakpoint
CREATE INDEX "agent_attestations_current_idx" ON "agent_attestations" USING btree ("agent_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "principal_auth_principal_idx" ON "principal_auth_identities" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "principal_login_expiry_idx" ON "principal_login_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "principal_sessions_active_idx" ON "principal_sessions" USING btree ("token_hash","expires_at","revoked_at");--> statement-breakpoint
CREATE INDEX "principal_sessions_principal_idx" ON "principal_sessions" USING btree ("principal_id","expires_at");