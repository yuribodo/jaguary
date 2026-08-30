ALTER TABLE "mandates" DROP CONSTRAINT "mandates_agent_principal_fk";
--> statement-breakpoint
ALTER TABLE "travel_conversations" DROP CONSTRAINT "travel_conversations_agent_principal_fk";
--> statement-breakpoint
ALTER TABLE "travel_watches" DROP CONSTRAINT "travel_watches_agent_principal_fk";
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_principal_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_credentials" ADD CONSTRAINT "payment_credentials_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_conversations" ADD CONSTRAINT "travel_conversations_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_conversations" ADD CONSTRAINT "travel_conversations_principal_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_watches" ADD CONSTRAINT "travel_watches_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_watches" ADD CONSTRAINT "travel_watches_principal_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;