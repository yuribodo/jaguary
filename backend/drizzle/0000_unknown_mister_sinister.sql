CREATE TABLE "agents" (
	"agent_id" varchar(128) PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"status" varchar(16) NOT NULL,
	"verification_key_id" varchar(128) NOT NULL,
	"verification_algorithm" varchar(16) NOT NULL,
	"verification_public_key" text NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_agent_principal_unique" UNIQUE("agent_id","principal_id"),
	CONSTRAINT "agents_verification_key_id_unique" UNIQUE("verification_key_id"),
	CONSTRAINT "agents_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "agents_agent_id_check" CHECK ("agents"."agent_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "agents_principal_id_check" CHECK ("agents"."principal_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "agents_status_check" CHECK ("agents"."status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
	CONSTRAINT "agents_verification_key_id_check" CHECK ("agents"."verification_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "agents_verification_algorithm_check" CHECK ("agents"."verification_algorithm" IN ('ES256', 'EdDSA')),
	CONSTRAINT "agents_verification_public_key_check" CHECK (length("agents"."verification_public_key") BETWEEN 16 AND 8192),
	CONSTRAINT "agents_correlation_id_check" CHECK ("agents"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "agents_idempotency_key_check" CHECK (length("agents"."idempotency_key") BETWEEN 8 AND 128 AND "agents"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"event_id" varchar(128) PRIMARY KEY NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"previous_hash" char(64),
	"event_hash" char(64) NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_events_event_hash_unique" UNIQUE("event_hash"),
	CONSTRAINT "audit_events_event_id_check" CHECK ("audit_events"."event_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "audit_events_correlation_id_check" CHECK ("audit_events"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "audit_events_subject_id_check" CHECK ("audit_events"."subject_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "audit_events_event_type_check" CHECK (length("audit_events"."event_type") BETWEEN 1 AND 128),
	CONSTRAINT "audit_events_payload_hash_check" CHECK ("audit_events"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "audit_events_previous_hash_check" CHECK ("audit_events"."previous_hash" IS NULL OR "audit_events"."previous_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "audit_events_event_hash_check" CHECK ("audit_events"."event_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "authorizations" (
	"authorization_id" varchar(128) PRIMARY KEY NOT NULL,
	"mandate_id" varchar(128) NOT NULL,
	"checkout_id" varchar(128) NOT NULL,
	"checkout_hash" char(64) NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"allowed_merchant_ids" text[] NOT NULL,
	"max_amount" bigint NOT NULL,
	"max_amount_currency" char(3) NOT NULL,
	"max_uses" bigint NOT NULL,
	"reserved_amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" varchar(24) NOT NULL,
	"proof_type" varchar(32) NOT NULL,
	"proof_reference" varchar(128) NOT NULL,
	"proof_hash" char(64) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"reserved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorizations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "authorizations_id_check" CHECK ("authorizations"."authorization_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "authorizations_allowed_merchants_check" CHECK (cardinality("authorizations"."allowed_merchant_ids") > 0 AND "authorizations"."merchant_id" = ANY("authorizations"."allowed_merchant_ids")),
	CONSTRAINT "authorizations_amount_check" CHECK ("authorizations"."max_amount" >= 0 AND "authorizations"."max_amount" <= 9007199254740991 AND "authorizations"."reserved_amount" >= 0 AND "authorizations"."reserved_amount" <= 9007199254740991 AND "authorizations"."reserved_amount" <= "authorizations"."max_amount"),
	CONSTRAINT "authorizations_currency_check" CHECK ("authorizations"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG') AND "authorizations"."max_amount_currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG') AND "authorizations"."currency" = "authorizations"."max_amount_currency"),
	CONSTRAINT "authorizations_max_uses_check" CHECK ("authorizations"."max_uses" > 0 AND "authorizations"."max_uses" <= 9007199254740991),
	CONSTRAINT "authorizations_status_check" CHECK ("authorizations"."status" IN ('RESERVED', 'PAYMENT_PENDING', 'CONSUMED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "authorizations_proof_type_check" CHECK ("authorizations"."proof_type" IN ('AP2', 'VISA_INSTRUCTION', 'ACP_ALLOWANCE')),
	CONSTRAINT "authorizations_proof_reference_check" CHECK ("authorizations"."proof_reference" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "authorizations_proof_hash_check" CHECK ("authorizations"."proof_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "authorizations_checkout_hash_check" CHECK ("authorizations"."checkout_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "authorizations_correlation_id_check" CHECK ("authorizations"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "authorizations_idempotency_key_check" CHECK (length("authorizations"."idempotency_key") BETWEEN 8 AND 128 AND "authorizations"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "authorizations_validity_check" CHECK ("authorizations"."reserved_at" < "authorizations"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"checkout_id" varchar(128) PRIMARY KEY NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"merchant_url" text NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"fulfillment" jsonb NOT NULL,
	"protocol_name" varchar(64) NOT NULL,
	"protocol_version" varchar(64) NOT NULL,
	"checkout_hash" char(64) NOT NULL,
	"merchant_signature_algorithm" varchar(16) NOT NULL,
	"merchant_signature_key_id" varchar(128) NOT NULL,
	"merchant_signature_value" text NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkouts_id_hash_unique" UNIQUE("checkout_id","checkout_hash"),
	CONSTRAINT "checkouts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "checkouts_id_check" CHECK ("checkouts"."checkout_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "checkouts_merchant_id_check" CHECK ("checkouts"."merchant_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "checkouts_items_check" CHECK (jsonb_typeof("checkouts"."items") = 'array' AND jsonb_array_length("checkouts"."items") > 0),
	CONSTRAINT "checkouts_amount_check" CHECK ("checkouts"."total_amount" >= 0 AND "checkouts"."total_amount" <= 9007199254740991),
	CONSTRAINT "checkouts_currency_check" CHECK ("checkouts"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG')),
	CONSTRAINT "checkouts_fulfillment_check" CHECK (jsonb_typeof("checkouts"."fulfillment") = 'object'),
	CONSTRAINT "checkouts_hash_check" CHECK ("checkouts"."checkout_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "checkouts_validity_check" CHECK ("checkouts"."created_at" < "checkouts"."expires_at"),
	CONSTRAINT "checkouts_signature_algorithm_check" CHECK ("checkouts"."merchant_signature_algorithm" IN ('ES256', 'EdDSA')),
	CONSTRAINT "checkouts_signature_key_id_check" CHECK ("checkouts"."merchant_signature_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "checkouts_signature_value_check" CHECK (length("checkouts"."merchant_signature_value") BETWEEN 16 AND 4096),
	CONSTRAINT "checkouts_correlation_id_check" CHECK ("checkouts"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "checkouts_idempotency_key_check" CHECK (length("checkouts"."idempotency_key") BETWEEN 8 AND 128 AND "checkouts"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"mandate_id" varchar(128) PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"agent_id" varchar(128) NOT NULL,
	"allowed_merchant_ids" text[] NOT NULL,
	"max_per_purchase_amount" bigint NOT NULL,
	"max_per_purchase_currency" char(3) NOT NULL,
	"max_aggregate_amount" bigint NOT NULL,
	"max_aggregate_currency" char(3) NOT NULL,
	"max_uses" bigint NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"credential_id" varchar(128) NOT NULL,
	"status" varchar(16) NOT NULL,
	"terms_hash" char(64) NOT NULL,
	"principal_signature_algorithm" varchar(16) NOT NULL,
	"principal_signature_key_id" varchar(128) NOT NULL,
	"principal_signature_value" text NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mandates_id_agent_principal_unique" UNIQUE("mandate_id","agent_id","principal_id"),
	CONSTRAINT "mandates_id_agent_unique" UNIQUE("mandate_id","agent_id"),
	CONSTRAINT "mandates_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "mandates_id_check" CHECK ("mandates"."mandate_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "mandates_allowed_merchants_check" CHECK (cardinality("mandates"."allowed_merchant_ids") > 0),
	CONSTRAINT "mandates_max_per_purchase_amount_check" CHECK ("mandates"."max_per_purchase_amount" >= 0 AND "mandates"."max_per_purchase_amount" <= 9007199254740991),
	CONSTRAINT "mandates_max_aggregate_amount_check" CHECK ("mandates"."max_aggregate_amount" >= 0 AND "mandates"."max_aggregate_amount" <= 9007199254740991),
	CONSTRAINT "mandates_currency_check" CHECK ("mandates"."max_per_purchase_currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG') AND "mandates"."max_aggregate_currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG') AND "mandates"."max_per_purchase_currency" = "mandates"."max_aggregate_currency"),
	CONSTRAINT "mandates_max_uses_check" CHECK ("mandates"."max_uses" > 0 AND "mandates"."max_uses" <= 9007199254740991),
	CONSTRAINT "mandates_validity_check" CHECK ("mandates"."valid_from" < "mandates"."expires_at"),
	CONSTRAINT "mandates_status_check" CHECK ("mandates"."status" IN ('DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED', 'CONSUMED')),
	CONSTRAINT "mandates_terms_hash_check" CHECK ("mandates"."terms_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "mandates_signature_algorithm_check" CHECK ("mandates"."principal_signature_algorithm" IN ('ES256', 'EdDSA')),
	CONSTRAINT "mandates_signature_key_id_check" CHECK ("mandates"."principal_signature_key_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "mandates_signature_value_check" CHECK (length("mandates"."principal_signature_value") BETWEEN 16 AND 4096),
	CONSTRAINT "mandates_correlation_id_check" CHECK ("mandates"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "mandates_idempotency_key_check" CHECK (length("mandates"."idempotency_key") BETWEEN 8 AND 128 AND "mandates"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"agent_id" varchar(128) NOT NULL,
	"nonce" varchar(128) NOT NULL,
	"mandate_id" varchar(128) NOT NULL,
	"checkout_id" varchar(128) NOT NULL,
	"checkout_hash" char(64) NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nonces_agent_nonce_pk" PRIMARY KEY("agent_id","nonce"),
	CONSTRAINT "nonces_payload_hash_unique" UNIQUE("payload_hash"),
	CONSTRAINT "nonces_nonce_check" CHECK ("nonces"."nonce" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "nonces_payload_hash_check" CHECK ("nonces"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nonces_checkout_hash_check" CHECK ("nonces"."checkout_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "nonces_correlation_id_check" CHECK ("nonces"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "nonces_validity_check" CHECK ("nonces"."issued_at" < "nonces"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" varchar(128) PRIMARY KEY NOT NULL,
	"receipt_id" varchar(128) NOT NULL,
	"checkout_id" varchar(128) NOT NULL,
	"authorization_id" varchar(128) NOT NULL,
	"payment_id" varchar(128) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"status" varchar(16) NOT NULL,
	"items" jsonb NOT NULL,
	"total_amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"fulfillment" jsonb NOT NULL,
	"audit_event_id" varchar(128) NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_receipt_id_unique" UNIQUE("receipt_id"),
	CONSTRAINT "orders_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "orders_audit_event_id_unique" UNIQUE("audit_event_id"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_order_id_check" CHECK ("orders"."order_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "orders_receipt_id_check" CHECK ("orders"."receipt_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "orders_merchant_id_check" CHECK ("orders"."merchant_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('CONFIRMED', 'CANCELLED')),
	CONSTRAINT "orders_items_check" CHECK (jsonb_typeof("orders"."items") = 'array' AND jsonb_array_length("orders"."items") > 0),
	CONSTRAINT "orders_amount_check" CHECK ("orders"."total_amount" >= 0 AND "orders"."total_amount" <= 9007199254740991),
	CONSTRAINT "orders_currency_check" CHECK ("orders"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG')),
	CONSTRAINT "orders_fulfillment_check" CHECK (jsonb_typeof("orders"."fulfillment") = 'object'),
	CONSTRAINT "orders_correlation_id_check" CHECK ("orders"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "orders_idempotency_key_check" CHECK (length("orders"."idempotency_key") BETWEEN 8 AND 128 AND "orders"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
CREATE TABLE "payment_credentials" (
	"credential_id" varchar(128) PRIMARY KEY NOT NULL,
	"principal_id" varchar(128) NOT NULL,
	"display" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_credentials_id_principal_unique" UNIQUE("credential_id","principal_id"),
	CONSTRAINT "payment_credentials_id_check" CHECK ("payment_credentials"."credential_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "payment_credentials_principal_id_check" CHECK ("payment_credentials"."principal_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "payment_credentials_display_check" CHECK (length("payment_credentials"."display") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"payment_attempt_id" varchar(128) PRIMARY KEY NOT NULL,
	"payment_id" varchar(128),
	"authorization_id" varchar(128) NOT NULL,
	"credential_id" varchar(128) NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"status" varchar(16),
	"provider_reference" varchar(128),
	"decline_code" varchar(128),
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_attempt_id_check" CHECK ("payments"."payment_attempt_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "payments_payment_id_check" CHECK ("payments"."payment_id" IS NULL OR "payments"."payment_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" >= 0 AND "payments"."amount" <= 9007199254740991),
	CONSTRAINT "payments_currency_check" CHECK ("payments"."currency" IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF', 'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'XXX', 'YER', 'ZAR', 'ZMW', 'ZWG')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IS NULL OR "payments"."status" IN ('APPROVED', 'DECLINED', 'TIMEOUT', 'UNKNOWN')),
	CONSTRAINT "payments_result_shape_check" CHECK (
    ("payments"."status" IS NULL AND "payments"."payment_id" IS NULL AND "payments"."provider_reference" IS NULL AND "payments"."decline_code" IS NULL AND "payments"."occurred_at" IS NULL)
    OR ("payments"."status" = 'APPROVED' AND "payments"."payment_id" IS NOT NULL AND "payments"."decline_code" IS NULL AND "payments"."occurred_at" IS NOT NULL)
    OR ("payments"."status" = 'DECLINED' AND "payments"."decline_code" IS NOT NULL AND "payments"."provider_reference" IS NULL AND "payments"."occurred_at" IS NOT NULL)
    OR ("payments"."status" = 'TIMEOUT' AND "payments"."payment_id" IS NULL AND "payments"."provider_reference" IS NULL AND "payments"."decline_code" IS NULL AND "payments"."occurred_at" IS NOT NULL)
    OR ("payments"."status" = 'UNKNOWN' AND "payments"."provider_reference" IS NULL AND "payments"."decline_code" IS NULL AND "payments"."occurred_at" IS NOT NULL)
  ),
	CONSTRAINT "payments_correlation_id_check" CHECK ("payments"."correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
	CONSTRAINT "payments_idempotency_key_check" CHECK (length("payments"."idempotency_key") BETWEEN 8 AND 128 AND "payments"."idempotency_key" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')
);
--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_mandate_identity_fk" FOREIGN KEY ("mandate_id","agent_id","principal_id") REFERENCES "public"."mandates"("mandate_id","agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_checkout_hash_fk" FOREIGN KEY ("checkout_id","checkout_hash") REFERENCES "public"."checkouts"("checkout_id","checkout_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_agent_principal_fk" FOREIGN KEY ("agent_id","principal_id") REFERENCES "public"."agents"("agent_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_credential_principal_fk" FOREIGN KEY ("credential_id","principal_id") REFERENCES "public"."payment_credentials"("credential_id","principal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonces" ADD CONSTRAINT "nonces_mandate_agent_fk" FOREIGN KEY ("mandate_id","agent_id") REFERENCES "public"."mandates"("mandate_id","agent_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonces" ADD CONSTRAINT "nonces_checkout_hash_fk" FOREIGN KEY ("checkout_id","checkout_hash") REFERENCES "public"."checkouts"("checkout_id","checkout_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_checkouts_checkout_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("checkout_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_authorization_id_authorizations_authorization_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("authorization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_payments_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("payment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_audit_event_id_audit_events_event_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("event_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_authorization_id_authorizations_authorization_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("authorization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_credential_id_payment_credentials_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."payment_credentials"("credential_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_principal_id_idx" ON "agents" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_recorded_idx" ON "audit_events" USING btree ("correlation_id","recorded_at");--> statement-breakpoint
CREATE INDEX "audit_events_subject_recorded_idx" ON "audit_events" USING btree ("subject_id","recorded_at");--> statement-breakpoint
CREATE INDEX "authorizations_mandate_status_idx" ON "authorizations" USING btree ("mandate_id","status");--> statement-breakpoint
CREATE INDEX "authorizations_checkout_id_idx" ON "authorizations" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "authorizations_status_expires_idx" ON "authorizations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "checkouts_merchant_expires_idx" ON "checkouts" USING btree ("merchant_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_hash_idx" ON "checkouts" USING btree ("checkout_hash");--> statement-breakpoint
CREATE INDEX "mandates_agent_status_idx" ON "mandates" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "mandates_principal_status_idx" ON "mandates" USING btree ("principal_id","status");--> statement-breakpoint
CREATE INDEX "mandates_expires_at_idx" ON "mandates" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nonces_mandate_recorded_idx" ON "nonces" USING btree ("mandate_id","recorded_at");--> statement-breakpoint
CREATE INDEX "nonces_checkout_id_idx" ON "nonces" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "orders_checkout_id_idx" ON "orders" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "orders_authorization_id_idx" ON "orders" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_issued_idx" ON "orders" USING btree ("merchant_id","issued_at");--> statement-breakpoint
CREATE INDEX "payment_credentials_principal_id_idx" ON "payment_credentials" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "payments_authorization_created_idx" ON "payments" USING btree ("authorization_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_updated_idx" ON "payments" USING btree ("status","updated_at");