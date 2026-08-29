ALTER TABLE "payments" DROP CONSTRAINT "payments_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_idempotency_key_check";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_idempotency_key" uuid;--> statement-breakpoint
UPDATE "payments" SET "provider_idempotency_key" = gen_random_uuid();--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "provider_idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "idempotency_key";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_unique" UNIQUE("checkout_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_authorization_id_unique" UNIQUE("authorization_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_authorization_id_unique" UNIQUE("authorization_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_idempotency_key_unique" UNIQUE("provider_idempotency_key");--> statement-breakpoint
CREATE FUNCTION enforce_authorization_status_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status
    OR (OLD.status = 'RESERVED' AND NEW.status IN ('PAYMENT_PENDING', 'CANCELLED'))
    OR (OLD.status = 'PAYMENT_PENDING' AND NEW.status IN ('CONSUMED', 'FAILED'))
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = format('invalid authorization status transition: %s -> %s', OLD.status, NEW.status);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER authorizations_status_transition_trigger
  BEFORE UPDATE OF status ON "authorizations"
  FOR EACH ROW EXECUTE FUNCTION enforce_authorization_status_transition();
