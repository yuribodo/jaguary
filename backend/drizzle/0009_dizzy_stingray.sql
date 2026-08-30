CREATE TABLE "mandate_biometric_consents" (
	"consent_id" varchar(128) PRIMARY KEY NOT NULL,
	"mandate_id" varchar(128) NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"terms_hash" char(64) NOT NULL,
	"onboarding_attestation_id" varchar(128) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_vendor_data_hash" char(64) NOT NULL,
	"provider_vendor_data_ciphertext" text NOT NULL,
	"provider_assessment_hash" char(64),
	"provider_assessment_ciphertext" text,
	"hosted_url_ciphertext" text,
	"status" varchar(16) NOT NULL,
	"evidence_hash" char(64) NOT NULL,
	"failure_code" varchar(64),
	"correlation_id" varchar(128) NOT NULL,
	"creation_idempotency_key" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mandate_biometric_consents_creation_idempotency_unique" UNIQUE("creation_idempotency_key"),
	CONSTRAINT "mandate_biometric_consents_provider_assessment_unique" UNIQUE("provider","provider_assessment_hash"),
	CONSTRAINT "mandate_biometric_consents_id_check" CHECK ("mandate_biometric_consents"."consent_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "mandate_biometric_consents_status_check" CHECK ("mandate_biometric_consents"."status" IN ('PREPARING', 'PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ERROR', 'CONSUMED')),
	CONSTRAINT "mandate_biometric_consents_hashes_check" CHECK ("mandate_biometric_consents"."terms_hash" ~ '^[a-f0-9]{64}$' AND "mandate_biometric_consents"."provider_vendor_data_hash" ~ '^[a-f0-9]{64}$' AND "mandate_biometric_consents"."evidence_hash" ~ '^[a-f0-9]{64}$' AND ("mandate_biometric_consents"."provider_assessment_hash" IS NULL OR "mandate_biometric_consents"."provider_assessment_hash" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "mandate_biometric_consents_provider_shape_check" CHECK (
    ("mandate_biometric_consents"."status" IN ('PREPARING', 'ERROR') OR ("mandate_biometric_consents"."provider_assessment_hash" IS NOT NULL AND "mandate_biometric_consents"."provider_assessment_ciphertext" IS NOT NULL))
    AND ("mandate_biometric_consents"."status" <> 'VERIFIED' OR "mandate_biometric_consents"."verified_at" IS NOT NULL)
    AND ("mandate_biometric_consents"."status" <> 'CONSUMED' OR ("mandate_biometric_consents"."verified_at" IS NOT NULL AND "mandate_biometric_consents"."consumed_at" IS NOT NULL))
  ),
	CONSTRAINT "mandate_biometric_consents_idempotency_check" CHECK (length("mandate_biometric_consents"."creation_idempotency_key") BETWEEN 8 AND 128 AND "mandate_biometric_consents"."creation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "mandate_biometric_consents_validity_check" CHECK ("mandate_biometric_consents"."created_at" < "mandate_biometric_consents"."expires_at")
);
--> statement-breakpoint
ALTER TABLE "mandate_biometric_consents" ADD CONSTRAINT "mandate_biometric_consents_mandate_id_mandates_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("mandate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandate_biometric_consents" ADD CONSTRAINT "mandate_biometric_consents_onboarding_attestation_id_agent_attestations_attestation_id_fk" FOREIGN KEY ("onboarding_attestation_id") REFERENCES "public"."agent_attestations"("attestation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandate_biometric_consents" ADD CONSTRAINT "mandate_biometric_consents_identity_fk" FOREIGN KEY ("mandate_id","agent_id","principal_id") REFERENCES "public"."mandates"("mandate_id","agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mandate_biometric_consents_mandate_status_idx" ON "mandate_biometric_consents" USING btree ("mandate_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "mandate_biometric_consents_provider_idx" ON "mandate_biometric_consents" USING btree ("provider","provider_assessment_hash");