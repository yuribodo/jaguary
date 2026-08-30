CREATE TABLE "purchase_disputes" (
	"dispute_id" varchar(128) PRIMARY KEY NOT NULL,
	"receipt_id" varchar(128) NOT NULL,
	"order_id" varchar(128) NOT NULL,
	"authorization_id" varchar(128) NOT NULL,
	"payment_id" varchar(128) NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"reason" varchar(48) NOT NULL,
	"status" varchar(24) NOT NULL,
	"verdict" varchar(24) NOT NULL,
	"liable_party" varchar(24) NOT NULL,
	"financial_outcome" varchar(32) NOT NULL,
	"resolution_code" varchar(64) NOT NULL,
	"evidence" jsonb NOT NULL,
	"evidence_hash" char(64) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchase_disputes_receipt_unique" UNIQUE("receipt_id"),
	CONSTRAINT "purchase_disputes_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "purchase_disputes_id_check" CHECK ("purchase_disputes"."dispute_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "purchase_disputes_reason_check" CHECK ("purchase_disputes"."reason" IN ('UNRECOGNIZED_PURCHASE')),
	CONSTRAINT "purchase_disputes_status_check" CHECK ("purchase_disputes"."status" IN ('RESOLVED')),
	CONSTRAINT "purchase_disputes_verdict_check" CHECK ("purchase_disputes"."verdict" IN ('AUTHORIZED', 'UNAUTHORIZED')),
	CONSTRAINT "purchase_disputes_liable_party_check" CHECK ("purchase_disputes"."liable_party" IN ('PRINCIPAL', 'MERCHANT')),
	CONSTRAINT "purchase_disputes_financial_outcome_check" CHECK ("purchase_disputes"."financial_outcome" IN ('NO_CHARGEBACK', 'CHARGEBACK_RECORDED')),
	CONSTRAINT "purchase_disputes_resolution_code_check" CHECK ("purchase_disputes"."resolution_code" IN ('VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE', 'AUTHORITY_EVIDENCE_INCOMPLETE')),
	CONSTRAINT "purchase_disputes_evidence_check" CHECK (jsonb_typeof("purchase_disputes"."evidence") = 'object'),
	CONSTRAINT "purchase_disputes_evidence_hash_check" CHECK ("purchase_disputes"."evidence_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "purchase_disputes_correlation_id_check" CHECK ("purchase_disputes"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "purchase_disputes_idempotency_check" CHECK (length("purchase_disputes"."idempotency_key") BETWEEN 8 AND 128 AND "purchase_disputes"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "purchase_disputes_resolution_time_check" CHECK ("purchase_disputes"."opened_at" <= "purchase_disputes"."resolved_at")
);
--> statement-breakpoint
ALTER TABLE "purchase_disputes" ADD CONSTRAINT "purchase_disputes_receipt_id_orders_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."orders"("receipt_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_disputes" ADD CONSTRAINT "purchase_disputes_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_disputes" ADD CONSTRAINT "purchase_disputes_authorization_id_authorizations_authorization_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("authorization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_disputes" ADD CONSTRAINT "purchase_disputes_payment_id_payments_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_disputes" ADD CONSTRAINT "purchase_disputes_principal_id_principals_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_disputes_principal_opened_idx" ON "purchase_disputes" USING btree ("principal_id","opened_at");--> statement-breakpoint
CREATE INDEX "purchase_disputes_merchant_opened_idx" ON "purchase_disputes" USING btree ("merchant_id","opened_at");