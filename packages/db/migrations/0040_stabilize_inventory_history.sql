CREATE OR REPLACE FUNCTION hsm_inventory_immutable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[];
BEGIN
  IF TG_TABLE_NAME = 'booking_policies' THEN allowed := ARRAY['is_current'];
  ELSIF TG_TABLE_NAME = 'bookings' THEN allowed := ARRAY['state', 'updated_at'];
  ELSIF TG_TABLE_NAME = 'booking_holds' THEN allowed := ARRAY['released_at'];
  ELSIF TG_TABLE_NAME = 'inventory_blocks' THEN allowed := ARRAY['released_at'];
  ELSIF TG_TABLE_NAME = 'inventory_claims' THEN
    allowed := ARRAY['released_at', 'expires_at', 'slot_range', 'stay_range'];
  ELSE RAISE EXCEPTION 'Unknown immutable inventory table' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Inventory terms are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME IN ('booking_holds', 'inventory_blocks', 'inventory_claims') THEN
    IF OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at THEN
      RAISE EXCEPTION 'Released inventory cannot be restored' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'booking_policies' THEN
    IF NOT OLD.is_current AND NEW.is_current THEN
      RAISE EXCEPTION 'Superseded policy cannot be restored' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER waitlist_vacancy_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON waitlist_vacancy_events FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER waitlist_fanout_pages_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON waitlist_fanout_pages FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
