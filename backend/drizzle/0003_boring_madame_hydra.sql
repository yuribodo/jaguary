ALTER TABLE "authorizations" ADD COLUMN "request_hash" char(64);--> statement-breakpoint
ALTER TABLE "authorizations" ADD COLUMN "policy_version" varchar(64);--> statement-breakpoint
ALTER TABLE "authorizations" ADD COLUMN "evidence_hash" char(64);--> statement-breakpoint
UPDATE "authorizations"
SET
  "request_hash" = encode(sha256(convert_to('legacy:' || "authorization_id", 'UTF8')), 'hex'),
  "policy_version" = 'bound.verify.legacy',
  "evidence_hash" = "proof_hash"
WHERE "request_hash" IS NULL OR "policy_version" IS NULL OR "evidence_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "authorizations" ALTER COLUMN "request_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "authorizations" ALTER COLUMN "policy_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "authorizations" ALTER COLUMN "evidence_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_request_hash_unique" UNIQUE("request_hash");--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_checkout_id_unique" UNIQUE("checkout_id");--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_request_hash_check" CHECK ("authorizations"."request_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_policy_version_check" CHECK (length("authorizations"."policy_version") BETWEEN 1 AND 64);--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_evidence_hash_check" CHECK ("authorizations"."evidence_hash" ~ '^[a-f0-9]{64}$');
