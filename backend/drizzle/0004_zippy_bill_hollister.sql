ALTER TABLE "audit_events" ADD COLUMN "sanitized_payload" jsonb;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_sanitized_payload_check" CHECK ("audit_events"."sanitized_payload" IS NULL OR jsonb_typeof("audit_events"."sanitized_payload") = 'object');--> statement-breakpoint
CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
