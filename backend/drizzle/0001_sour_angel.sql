ALTER TABLE "mandates" DROP CONSTRAINT "mandates_allowed_merchants_check";--> statement-breakpoint
ALTER TABLE "mandates" DROP CONSTRAINT "mandates_terms_hash_check";--> statement-breakpoint
ALTER TABLE "mandates" DROP CONSTRAINT "mandates_signature_algorithm_check";--> statement-breakpoint
ALTER TABLE "mandates" DROP CONSTRAINT "mandates_signature_key_id_check";--> statement-breakpoint
ALTER TABLE "mandates" DROP CONSTRAINT "mandates_signature_value_check";--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "terms_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "principal_signature_algorithm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "principal_signature_key_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "principal_signature_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "supersedes_mandate_id" varchar(128);--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "allowed_merchant_categories" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "route_origin" char(3) DEFAULT 'ZZZ' NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "route_destination" char(3) DEFAULT 'YYY' NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "cabin" varchar(24) DEFAULT 'ECONOMY' NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "creation_request_hash" char(64);--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "activation_idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "mandates" ADD COLUMN "revocation_idempotency_key" varchar(128);--> statement-breakpoint
UPDATE "mandates"
SET "creation_request_hash" = "terms_hash"
WHERE "creation_request_hash" IS NULL;--> statement-breakpoint
UPDATE "mandates"
SET "terms_hash" = NULL,
    "principal_signature_algorithm" = NULL,
    "principal_signature_key_id" = NULL,
    "principal_signature_value" = NULL,
    "activated_at" = NULL,
    "revoked_at" = NULL
WHERE "status" = 'DRAFT'; -- NOSONAR: lifecycle state literals must match persisted enum values.
--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "creation_request_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "version" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "allowed_merchant_categories" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "route_origin" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "route_destination" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mandates" ALTER COLUMN "cabin" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_supersedes_fk" FOREIGN KEY ("supersedes_mandate_id") REFERENCES "public"."mandates"("mandate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mandates_supersedes_idx" ON "mandates" USING btree ("supersedes_mandate_id");--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_activation_idempotency_key_unique" UNIQUE("activation_idempotency_key");--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_revocation_idempotency_key_unique" UNIQUE("revocation_idempotency_key");--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_version_check" CHECK (
    ("mandates"."version" = 1 AND "mandates"."supersedes_mandate_id" IS NULL)
    OR ("mandates"."version" > 1 AND "mandates"."supersedes_mandate_id" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_scope_check" CHECK (cardinality("mandates"."allowed_merchant_ids") + cardinality("mandates"."allowed_merchant_categories") > 0);--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_route_check" CHECK (
    "mandates"."route_origin" ~ '^[A-Z]{3}$'
    AND "mandates"."route_destination" ~ '^[A-Z]{3}$'
    AND "mandates"."route_origin" <> "mandates"."route_destination"
  );--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_cabin_check" CHECK ("mandates"."cabin" IN ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'));--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_proof_check" CHECK (
    ("mandates"."status" = 'DRAFT'
      AND "mandates"."terms_hash" IS NULL
      AND "mandates"."principal_signature_algorithm" IS NULL
      AND "mandates"."principal_signature_key_id" IS NULL
      AND "mandates"."principal_signature_value" IS NULL
      AND "mandates"."activated_at" IS NULL
      AND "mandates"."revoked_at" IS NULL)
    OR ("mandates"."status" <> 'DRAFT'
      AND "mandates"."terms_hash" IS NOT NULL
      AND "mandates"."terms_hash" ~ '^[a-f0-9]{64}$'
      AND "mandates"."principal_signature_algorithm" IN ('ES256', 'EdDSA')
      AND "mandates"."principal_signature_key_id" IS NOT NULL
      AND "mandates"."principal_signature_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$' -- NOSONAR: database constraints materialize the shared identifier invariant.
      AND length("mandates"."principal_signature_value") BETWEEN 16 AND 4096
      AND "mandates"."activated_at" IS NOT NULL
      AND (("mandates"."status" = 'REVOKED' AND "mandates"."revoked_at" IS NOT NULL) -- NOSONAR: lifecycle state literals are intentional SQL invariants.
        OR ("mandates"."status" <> 'REVOKED' AND "mandates"."revoked_at" IS NULL)))
  );--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_creation_request_hash_check" CHECK ("mandates"."creation_request_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_activation_idempotency_key_check" CHECK ("mandates"."activation_idempotency_key" IS NULL OR (length("mandates"."activation_idempotency_key") BETWEEN 8 AND 128 AND "mandates"."activation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'));--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_revocation_idempotency_key_check" CHECK ("mandates"."revocation_idempotency_key" IS NULL OR (length("mandates"."revocation_idempotency_key") BETWEEN 8 AND 128 AND "mandates"."revocation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'));
--> statement-breakpoint
CREATE FUNCTION enforce_mandate_lifecycle() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE')
    OR (OLD.status = 'ACTIVE' AND NEW.status IN ('REVOKED', 'EXPIRED', 'CONSUMED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid mandate state transition';
  END IF;

  IF OLD.status <> 'DRAFT' AND ROW(
    OLD.version,
    OLD.supersedes_mandate_id,
    OLD.principal_id,
    OLD.agent_id,
    OLD.allowed_merchant_ids,
    OLD.allowed_merchant_categories,
    OLD.route_origin,
    OLD.route_destination,
    OLD.cabin,
    OLD.max_per_purchase_amount,
    OLD.max_per_purchase_currency,
    OLD.max_aggregate_amount,
    OLD.max_aggregate_currency,
    OLD.max_uses,
    OLD.valid_from,
    OLD.expires_at,
    OLD.credential_id,
    OLD.terms_hash,
    OLD.principal_signature_algorithm,
    OLD.principal_signature_key_id,
    OLD.principal_signature_value,
    OLD.activated_at,
    OLD.creation_request_hash,
    OLD.idempotency_key
  ) IS DISTINCT FROM ROW(
    NEW.version,
    NEW.supersedes_mandate_id,
    NEW.principal_id,
    NEW.agent_id,
    NEW.allowed_merchant_ids,
    NEW.allowed_merchant_categories,
    NEW.route_origin,
    NEW.route_destination,
    NEW.cabin,
    NEW.max_per_purchase_amount,
    NEW.max_per_purchase_currency,
    NEW.max_aggregate_amount,
    NEW.max_aggregate_currency,
    NEW.max_uses,
    NEW.valid_from,
    NEW.expires_at,
    NEW.credential_id,
    NEW.terms_hash,
    NEW.principal_signature_algorithm,
    NEW.principal_signature_key_id,
    NEW.principal_signature_value,
    NEW.activated_at,
    NEW.creation_request_hash,
    NEW.idempotency_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'activated mandate terms are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER mandates_lifecycle_trigger
  BEFORE UPDATE ON "mandates"
  FOR EACH ROW EXECUTE FUNCTION enforce_mandate_lifecycle();
