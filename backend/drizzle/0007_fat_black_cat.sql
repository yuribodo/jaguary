CREATE TABLE "travel_approvals" (
	"approval_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_call_id" varchar(128) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"checkout_hash" char(64) NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"mandate_id" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"sdk_run_state" text NOT NULL,
	"decision_idempotency_key" varchar(128),
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "travel_approvals_run_tool_call_unique" UNIQUE("run_id","tool_call_id"),
	CONSTRAINT "travel_approvals_decision_idempotency_unique" UNIQUE("decision_idempotency_key"),
	CONSTRAINT "travel_approvals_tool_call_check" CHECK ("travel_approvals"."tool_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "travel_approvals_checkout_hash_check" CHECK ("travel_approvals"."checkout_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_approvals_amount_check" CHECK ("travel_approvals"."amount" >= 0 AND "travel_approvals"."amount" <= 9007199254740991),
	CONSTRAINT "travel_approvals_currency_check" CHECK ("travel_approvals"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG')),
	CONSTRAINT "travel_approvals_status_check" CHECK ("travel_approvals"."status" IN ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'CONSUMED')),
	CONSTRAINT "travel_approvals_state_check" CHECK (length("travel_approvals"."sdk_run_state") BETWEEN 2 AND 1000000),
	CONSTRAINT "travel_approvals_decision_idempotency_check" CHECK ("travel_approvals"."decision_idempotency_key" IS NULL OR (length("travel_approvals"."decision_idempotency_key") BETWEEN 8 AND 128 AND "travel_approvals"."decision_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'))
);
--> statement-breakpoint
CREATE TABLE "travel_conversations" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"state" varchar(48) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"intent" jsonb NOT NULL,
	"offers" jsonb NOT NULL,
	"active_run_id" uuid,
	"selected_checkout_id" varchar(128),
	"selected_checkout_hash" char(64),
	"mandate_id" varchar(128),
	"authorization_id" varchar(128),
	"receipt_id" varchar(128),
	"creation_request_hash" char(64) NOT NULL,
	"creation_idempotency_key" varchar(128) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_conversations_creation_idempotency_unique" UNIQUE("creation_idempotency_key"),
	CONSTRAINT "travel_conversations_state_check" CHECK ("travel_conversations"."state" IN ('COLLECTING', 'READY_TO_SEARCH', 'AWAITING_OFFER_SELECTION', 'AWAITING_AUTHORITY_CONFIRMATION', 'READY_TO_PURCHASE', 'EXECUTING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "travel_conversations_version_check" CHECK ("travel_conversations"."version" >= 0),
	CONSTRAINT "travel_conversations_intent_check" CHECK (jsonb_typeof("travel_conversations"."intent") = 'object'),
	CONSTRAINT "travel_conversations_offers_check" CHECK (jsonb_typeof("travel_conversations"."offers") = 'array'),
	CONSTRAINT "travel_conversations_checkout_hash_check" CHECK ("travel_conversations"."selected_checkout_hash" IS NULL OR "travel_conversations"."selected_checkout_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_conversations_creation_hash_check" CHECK ("travel_conversations"."creation_request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_conversations_idempotency_check" CHECK (length("travel_conversations"."creation_idempotency_key") BETWEEN 8 AND 128 AND "travel_conversations"."creation_idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "travel_conversations_correlation_check" CHECK ("travel_conversations"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "travel_intent_snapshots" (
	"snapshot_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"conversation_version" integer NOT NULL,
	"state" varchar(48) NOT NULL,
	"intent" jsonb NOT NULL,
	"invalidated_fields" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_intent_snapshots_version_unique" UNIQUE("conversation_id","conversation_version"),
	CONSTRAINT "travel_intent_snapshots_version_check" CHECK ("travel_intent_snapshots"."conversation_version" >= 0),
	CONSTRAINT "travel_intent_snapshots_state_check" CHECK ("travel_intent_snapshots"."state" IN ('COLLECTING', 'READY_TO_SEARCH', 'AWAITING_OFFER_SELECTION', 'AWAITING_AUTHORITY_CONFIRMATION', 'READY_TO_PURCHASE', 'EXECUTING', 'COMPLETED', 'FAILED')),
	CONSTRAINT "travel_intent_snapshots_intent_check" CHECK (jsonb_typeof("travel_intent_snapshots"."intent") = 'object')
);
--> statement-breakpoint
CREATE TABLE "travel_messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"content_hash" char(64) NOT NULL,
	"idempotency_key" varchar(128),
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_messages_conversation_sequence_unique" UNIQUE("conversation_id","sequence"),
	CONSTRAINT "travel_messages_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "travel_messages_sequence_check" CHECK ("travel_messages"."sequence" > 0),
	CONSTRAINT "travel_messages_role_check" CHECK ("travel_messages"."role" IN ('USER', 'ASSISTANT')),
	CONSTRAINT "travel_messages_content_check" CHECK (length("travel_messages"."content") BETWEEN 1 AND 8000),
	CONSTRAINT "travel_messages_content_hash_check" CHECK ("travel_messages"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_messages_idempotency_check" CHECK ("travel_messages"."idempotency_key" IS NULL OR (length("travel_messages"."idempotency_key") BETWEEN 8 AND 128 AND "travel_messages"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')),
	CONSTRAINT "travel_messages_correlation_check" CHECK ("travel_messages"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "travel_model_runs" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"input_message_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"model" varchar(128) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"provider_run_id" varchar(128),
	"provider_response_id" varchar(128),
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error_code" varchar(64),
	"retryable" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "travel_model_runs_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "travel_model_runs_status_check" CHECK ("travel_model_runs"."status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED')),
	CONSTRAINT "travel_model_runs_request_hash_check" CHECK ("travel_model_runs"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_model_runs_idempotency_check" CHECK (length("travel_model_runs"."idempotency_key") BETWEEN 8 AND 128 AND "travel_model_runs"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "travel_model_runs_correlation_check" CHECK ("travel_model_runs"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "travel_model_runs_usage_check" CHECK (("travel_model_runs"."input_tokens" IS NULL OR "travel_model_runs"."input_tokens" >= 0) AND ("travel_model_runs"."output_tokens" IS NULL OR "travel_model_runs"."output_tokens" >= 0) AND ("travel_model_runs"."latency_ms" IS NULL OR "travel_model_runs"."latency_ms" >= 0)),
	CONSTRAINT "travel_model_runs_retryable_check" CHECK ("travel_model_runs"."retryable" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE "travel_sse_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "travel_sse_events_conversation_sequence_unique" UNIQUE("conversation_id","sequence"),
	CONSTRAINT "travel_sse_events_sequence_check" CHECK ("travel_sse_events"."sequence" > 0),
	CONSTRAINT "travel_sse_events_type_check" CHECK ("travel_sse_events"."event_type" IN ('assistant.delta', 'state.snapshot', 'tool.status', 'confirmation.required', 'turn.completed', 'error')),
	CONSTRAINT "travel_sse_events_payload_check" CHECK (jsonb_typeof("travel_sse_events"."payload") = 'object')
);
--> statement-breakpoint
CREATE TABLE "travel_tool_executions" (
	"execution_id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_call_id" varchar(128) NOT NULL,
	"tool_name" varchar(64) NOT NULL,
	"arguments_hash" char(64) NOT NULL,
	"status" varchar(24) NOT NULL,
	"result" jsonb,
	"error_code" varchar(64),
	"idempotency_key" varchar(128) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "travel_tool_executions_call_unique" UNIQUE("run_id","tool_call_id"),
	CONSTRAINT "travel_tool_executions_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "travel_tool_executions_tool_call_check" CHECK ("travel_tool_executions"."tool_call_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "travel_tool_executions_tool_name_check" CHECK ("travel_tool_executions"."tool_name" IN ('find_offers', 'create_checkout', 'prepare_authority', 'request_purchase', 'get_receipt', 'get_audit_timeline')),
	CONSTRAINT "travel_tool_executions_arguments_hash_check" CHECK ("travel_tool_executions"."arguments_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "travel_tool_executions_status_check" CHECK ("travel_tool_executions"."status" IN ('RUNNING', 'COMPLETED', 'FAILED', 'REJECTED')),
	CONSTRAINT "travel_tool_executions_result_check" CHECK ("travel_tool_executions"."result" IS NULL OR jsonb_typeof("travel_tool_executions"."result") = 'object'),
	CONSTRAINT "travel_tool_executions_idempotency_check" CHECK (length("travel_tool_executions"."idempotency_key") BETWEEN 8 AND 128 AND "travel_tool_executions"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
ALTER TABLE "travel_approvals" ADD CONSTRAINT "travel_approvals_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_approvals" ADD CONSTRAINT "travel_approvals_run_id_travel_model_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."travel_model_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_conversations" ADD CONSTRAINT "travel_conversations_agent_principal_fk" FOREIGN KEY ("agent_id","principal_id") REFERENCES "public"."agents"("agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_intent_snapshots" ADD CONSTRAINT "travel_intent_snapshots_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_messages" ADD CONSTRAINT "travel_messages_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_model_runs" ADD CONSTRAINT "travel_model_runs_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_model_runs" ADD CONSTRAINT "travel_model_runs_input_message_id_travel_messages_message_id_fk" FOREIGN KEY ("input_message_id") REFERENCES "public"."travel_messages"("message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_sse_events" ADD CONSTRAINT "travel_sse_events_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_tool_executions" ADD CONSTRAINT "travel_tool_executions_conversation_id_travel_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."travel_conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_tool_executions" ADD CONSTRAINT "travel_tool_executions_run_id_travel_model_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."travel_model_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "travel_approvals_conversation_status_idx" ON "travel_approvals" USING btree ("conversation_id","status");--> statement-breakpoint
CREATE INDEX "travel_conversations_principal_updated_idx" ON "travel_conversations" USING btree ("principal_id","updated_at");--> statement-breakpoint
CREATE INDEX "travel_conversations_state_idx" ON "travel_conversations" USING btree ("state");--> statement-breakpoint
CREATE INDEX "travel_intent_snapshots_conversation_created_idx" ON "travel_intent_snapshots" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "travel_messages_conversation_created_idx" ON "travel_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "travel_model_runs_conversation_started_idx" ON "travel_model_runs" USING btree ("conversation_id","started_at");--> statement-breakpoint
CREATE INDEX "travel_sse_events_conversation_created_idx" ON "travel_sse_events" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "travel_tool_executions_conversation_started_idx" ON "travel_tool_executions" USING btree ("conversation_id","started_at");