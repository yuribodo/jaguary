ALTER TABLE "agents" DROP CONSTRAINT "agents_verification_algorithm_check";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "build_fingerprint" char(64);--> statement-breakpoint
UPDATE "agents"
SET
	"build_fingerprint" = repeat('0', 64),
	"status" = 'SUSPENDED'
WHERE "build_fingerprint" IS NULL;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "build_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_build_fingerprint_check" CHECK ("agents"."build_fingerprint" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_verification_algorithm_check" CHECK ("agents"."status" <> 'ACTIVE' OR "agents"."verification_algorithm" = 'ES256');
