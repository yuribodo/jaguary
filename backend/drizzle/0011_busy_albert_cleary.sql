CREATE TABLE "travel_watch_checks" (
	"check_id" uuid PRIMARY KEY NOT NULL,
	"watch_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"outcome" varchar(32) NOT NULL,
	"nearest_miss" jsonb,
	"matched_offer_id" varchar(128),
	"receipt_id" varchar(128),
	"error_code" varchar(64),
	"observed_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_watch_checks_attempt_unique" UNIQUE("watch_id","attempt"),
	CONSTRAINT "travel_watch_checks_attempt_check" CHECK ("travel_watch_checks"."attempt" > 0),
	CONSTRAINT "travel_watch_checks_outcome_check" CHECK ("travel_watch_checks"."outcome" IN ('MATCH_FOUND', 'OVER_BUDGET', 'NO_INVENTORY', 'PURCHASED', 'ERROR')),
	CONSTRAINT "travel_watch_checks_nearest_check" CHECK ("travel_watch_checks"."nearest_miss" IS NULL OR jsonb_typeof("travel_watch_checks"."nearest_miss") = 'object')
);
--> statement-breakpoint
CREATE TABLE "travel_watches" (
	"watch_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"mode" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"criteria" jsonb NOT NULL,
	"criteria_hash" char(64) NOT NULL,
	"mandate_id" varchar(128) NOT NULL,
	"authority" jsonb NOT NULL,
	"next_check_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_outcome" varchar(32),
	"nearest_miss" jsonb,
	"matched_offer_id" varchar(128),
	"receipt_id" varchar(128),
	"version" integer DEFAULT 1 NOT NULL,
	"creation_request_hash" char(64) NOT NULL,
	"creation_idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_watches_creation_idempotency_unique" UNIQUE("creation_idempotency_key"),
	CONSTRAINT "travel_watches_mode_check" CHECK ("travel_watches"."mode" IN ('ASK_BEFORE_PURCHASE', 'AUTO_PURCHASE')),
	CONSTRAINT "travel_watches_status_check" CHECK ("travel_watches"."status" IN ('AWAITING_LIVENESS', 'ACTIVE', 'CHECKING', 'MATCHED', 'EXECUTING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED')),
	CONSTRAINT "travel_watches_criteria_check" CHECK (jsonb_typeof("travel_watches"."criteria") = 'object' AND "travel_watches"."criteria_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_watches_authority_check" CHECK (jsonb_typeof("travel_watches"."authority") = 'object'),
	CONSTRAINT "travel_watches_attempts_check" CHECK ("travel_watches"."attempt_count" >= 0 AND "travel_watches"."consecutive_failures" >= 0),
	CONSTRAINT "travel_watches_outcome_check" CHECK ("travel_watches"."last_outcome" IS NULL OR "travel_watches"."last_outcome" IN ('MATCH_FOUND', 'OVER_BUDGET', 'NO_INVENTORY')),
	CONSTRAINT "travel_watches_nearest_check" CHECK ("travel_watches"."nearest_miss" IS NULL OR jsonb_typeof("travel_watches"."nearest_miss") = 'object'),
	CONSTRAINT "travel_watches_version_check" CHECK ("travel_watches"."version" > 0),
	CONSTRAINT "travel_watches_request_hash_check" CHECK ("travel_watches"."creation_request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_watches_creation_idempotency_check" CHECK (length("travel_watches"."creation_idempotency_key") BETWEEN 8 AND 128 AND "travel_watches"."creation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
ALTER TABLE "travel_watch_checks" ADD CONSTRAINT "travel_watch_checks_watch_id_travel_watches_watch_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."travel_watches"("watch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_watches" ADD CONSTRAINT "travel_watches_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_watches" ADD CONSTRAINT "travel_watches_mandate_id_mandates_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("mandate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_watches" ADD CONSTRAINT "travel_watches_agent_principal_fk" FOREIGN KEY ("agent_id","principal_id") REFERENCES "public"."agents"("agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_watch_checks_watch_idx" ON "travel_watch_checks" USING btree ("watch_id","completed_at");--> statement-breakpoint
CREATE INDEX "travel_watches_due_idx" ON "travel_watches" USING btree ("status","next_check_at");--> statement-breakpoint
CREATE INDEX "travel_watches_conversation_idx" ON "travel_watches" USING btree ("conversation_id","updated_at");