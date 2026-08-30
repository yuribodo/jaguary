ALTER TABLE "agent_attestations" DROP CONSTRAINT "agent_attestations_agent_principal_fk";
--> statement-breakpoint
DROP INDEX "agent_attestations_current_idx";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "access_scope" varchar(16) DEFAULT 'OWNER' NOT NULL;--> statement-breakpoint
INSERT INTO "principals" ("principal_id", "display_name", "created_at", "updated_at")
VALUES ('principal_jaguary_platform', 'Jaguary Platform', now(), now())
ON CONFLICT ("principal_id") DO UPDATE SET "display_name" = EXCLUDED."display_name", "updated_at" = now();--> statement-breakpoint
UPDATE "agents"
SET "principal_id" = 'principal_jaguary_platform', "access_scope" = 'PUBLIC', "updated_at" = now()
WHERE "agent_id" = 'agent_travelbot';--> statement-breakpoint
ALTER TABLE "agent_attestations" ADD CONSTRAINT "agent_attestations_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_attestations_current_idx" ON "agent_attestations" USING btree ("agent_id","principal_id","status","expires_at");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_access_scope_check" CHECK ("agents"."access_scope" IN ('OWNER', 'PUBLIC'));
