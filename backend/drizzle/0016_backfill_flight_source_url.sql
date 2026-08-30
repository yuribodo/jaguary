WITH selected_sources AS (
	SELECT DISTINCT ON (conversation."selected_checkout_id", conversation."receipt_id")
		conversation."selected_checkout_id" AS "checkout_id",
		conversation."receipt_id",
		offer.value->>'source_url' AS "source_url"
	FROM "travel_conversations" AS conversation
	CROSS JOIN LATERAL jsonb_array_elements(conversation."offers") AS offer(value)
	WHERE conversation."selected_checkout_id" IS NOT NULL
		AND conversation."receipt_id" IS NOT NULL
		AND offer.value->>'offer_id' = conversation."intent"->>'selected_offer_id'
		AND offer.value->>'source_url' LIKE 'https://%'
)
UPDATE "checkouts" AS checkout
SET "fulfillment" = jsonb_set(
	checkout."fulfillment",
	'{source_url}',
	to_jsonb(selected_sources."source_url"),
	true
)
FROM selected_sources
WHERE checkout."checkout_id" = selected_sources."checkout_id"
	AND NOT (checkout."fulfillment" ? 'source_url');
--> statement-breakpoint
WITH selected_sources AS (
	SELECT DISTINCT ON (conversation."selected_checkout_id", conversation."receipt_id")
		conversation."selected_checkout_id" AS "checkout_id",
		conversation."receipt_id",
		offer.value->>'source_url' AS "source_url"
	FROM "travel_conversations" AS conversation
	CROSS JOIN LATERAL jsonb_array_elements(conversation."offers") AS offer(value)
	WHERE conversation."selected_checkout_id" IS NOT NULL
		AND conversation."receipt_id" IS NOT NULL
		AND offer.value->>'offer_id' = conversation."intent"->>'selected_offer_id'
		AND offer.value->>'source_url' LIKE 'https://%'
)
UPDATE "orders" AS purchase_order
SET "fulfillment" = jsonb_set(
	purchase_order."fulfillment",
	'{source_url}',
	to_jsonb(selected_sources."source_url"),
	true
)
FROM selected_sources
WHERE purchase_order."receipt_id" = selected_sources."receipt_id"
	AND purchase_order."checkout_id" = selected_sources."checkout_id"
	AND NOT (purchase_order."fulfillment" ? 'source_url');
