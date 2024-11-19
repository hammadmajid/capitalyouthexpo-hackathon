-- ACC-001 / BKG-004: exclusion covers bed-bed and whole-room/bed conflicts.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE inventory_claims ADD CONSTRAINT inventory_claims_no_overlap
EXCLUDE USING gist (room_id WITH =, slot_range WITH &&, stay_range WITH &&)
WHERE (released_at IS NULL);
--> statement-breakpoint
-- Preserve snapshots, targets, identity and original dates, including direct SQL.
CREATE FUNCTION hsm_inventory_immutable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[];
BEGIN
  IF TG_TABLE_NAME = 'booking_policies' THEN allowed := ARRAY['is_current'];
  ELSIF TG_TABLE_NAME = 'bookings' THEN allowed := ARRAY['state', 'updated_at'];
  ELSIF TG_TABLE_NAME = 'booking_holds' THEN allowed := ARRAY['released_at'];
  ELSIF TG_TABLE_NAME = 'inventory_blocks' THEN allowed := ARRAY['released_at'];
  ELSIF TG_TABLE_NAME = 'inventory_claims' THEN allowed := ARRAY['released_at', 'expires_at'];
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
CREATE TRIGGER booking_policies_immutable_terms BEFORE UPDATE ON booking_policies
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_immutable_terms();
--> statement-breakpoint
CREATE TRIGGER booking_policies_retain_history BEFORE DELETE OR TRUNCATE ON booking_policies
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER bookings_immutable_terms BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_immutable_terms();
--> statement-breakpoint
CREATE TRIGGER bookings_retain_history BEFORE DELETE OR TRUNCATE ON bookings
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER booking_holds_immutable_terms BEFORE UPDATE ON booking_holds
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_immutable_terms();
--> statement-breakpoint
CREATE TRIGGER booking_holds_retain_history BEFORE DELETE OR TRUNCATE ON booking_holds
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_blocks_immutable_terms BEFORE UPDATE ON inventory_blocks
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_immutable_terms();
--> statement-breakpoint
CREATE TRIGGER inventory_blocks_retain_history BEFORE DELETE OR TRUNCATE ON inventory_blocks
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_claims_immutable_terms BEFORE UPDATE ON inventory_claims
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_immutable_terms();
--> statement-breakpoint
CREATE TRIGGER inventory_claims_retain_history BEFORE DELETE OR TRUNCATE ON inventory_claims
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER booking_history_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON booking_history FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION hsm_booking_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> NEW.state AND NOT (
    (OLD.state = 'pending_request' AND NEW.state IN ('confirmed', 'rejected', 'cancelled', 'expired'))
    OR (OLD.state = 'confirmed' AND NEW.state = 'cancelled')
  ) THEN RAISE EXCEPTION 'Invalid booking transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_transition_guard BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_booking_transition_guard();
--> statement-breakpoint
-- A claim must describe its source exactly, never another seat or date range.
CREATE FUNCTION hsm_inventory_claim_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_branch uuid; source_room uuid; source_seat uuid; source_start date; source_end date;
BEGIN
  IF NEW.hold_id IS NOT NULL THEN
    SELECT branch_id, room_id, seat_id, move_in_date, move_out_date
    INTO source_branch, source_room, source_seat, source_start, source_end
    FROM booking_holds WHERE id = NEW.hold_id;
  ELSIF NEW.booking_id IS NOT NULL THEN
    SELECT branch_id, room_id, seat_id, move_in_date, move_out_date
    INTO source_branch, source_room, source_seat, source_start, source_end
    FROM bookings WHERE id = NEW.booking_id;
  ELSE
    SELECT branch_id, room_id, seat_id, move_in_date, move_out_date
    INTO source_branch, source_room, source_seat, source_start, source_end
    FROM inventory_blocks WHERE id = NEW.block_id;
  END IF;
  IF source_branch IS NULL OR (NEW.branch_id, NEW.room_id, NEW.seat_id, NEW.move_in_date, NEW.move_out_date)
    IS DISTINCT FROM (source_branch, source_room, source_seat, source_start, source_end) THEN
    RAISE EXCEPTION 'Inventory claim target mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_claims_target_guard BEFORE INSERT OR UPDATE ON inventory_claims
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_claim_target_guard();
--> statement-breakpoint
-- Deferred guards ensure an active source cannot commit without its exact claim.
CREATE FUNCTION hsm_check_inventory_source(source_kind text, source_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE required boolean; present integer; source_expiry timestamptz; claim_expiry timestamptz;
BEGIN
  IF source_id IS NULL THEN RETURN; END IF;
  IF source_kind = 'hold' THEN
    SELECT released_at IS NULL, expires_at INTO required, source_expiry FROM booking_holds WHERE id = source_id;
    SELECT count(*), min(expires_at) INTO present, claim_expiry FROM inventory_claims
      WHERE hold_id = source_id AND released_at IS NULL;
  ELSIF source_kind = 'booking' THEN
    SELECT state = 'confirmed' OR (state = 'pending_request'
      AND quote_snapshot->'policy'->>'requestReservesInventory' = 'true'),
      CASE WHEN state = 'pending_request' THEN request_expires_at ELSE NULL END
    INTO required, source_expiry FROM bookings WHERE id = source_id;
    SELECT count(*), min(expires_at) INTO present, claim_expiry FROM inventory_claims
      WHERE booking_id = source_id AND released_at IS NULL;
  ELSIF source_kind = 'block' THEN
    SELECT released_at IS NULL INTO required FROM inventory_blocks WHERE id = source_id;
    SELECT count(*), min(expires_at) INTO present, claim_expiry FROM inventory_claims
      WHERE block_id = source_id AND released_at IS NULL;
  ELSE RAISE EXCEPTION 'Unknown inventory source' USING ERRCODE = '23514'; END IF;
  IF required IS NULL OR present <> (CASE WHEN required THEN 1 ELSE 0 END)
    OR (required AND claim_expiry IS DISTINCT FROM source_expiry) THEN
    RAISE EXCEPTION 'Inventory source and claim must commit together' USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_inventory_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'booking_holds' THEN PERFORM hsm_check_inventory_source('hold', NEW.id);
  ELSIF TG_TABLE_NAME = 'bookings' THEN PERFORM hsm_check_inventory_source('booking', NEW.id);
  ELSIF TG_TABLE_NAME = 'inventory_blocks' THEN PERFORM hsm_check_inventory_source('block', NEW.id);
  ELSE
    PERFORM hsm_check_inventory_source('hold', NEW.hold_id);
    PERFORM hsm_check_inventory_source('booking', NEW.booking_id);
    PERFORM hsm_check_inventory_source('block', NEW.block_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER booking_holds_source_guard AFTER INSERT OR UPDATE ON booking_holds
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_inventory_source_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bookings_source_guard AFTER INSERT OR UPDATE ON bookings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_inventory_source_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_blocks_source_guard AFTER INSERT OR UPDATE ON inventory_blocks
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_inventory_source_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER inventory_claims_source_guard AFTER INSERT OR UPDATE ON inventory_claims
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_inventory_source_guard();
--> statement-breakpoint
-- Stable physical ordinals and capacity serialize against room/type edits.
CREATE FUNCTION hsm_seat_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maximum integer; current_count integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.id, OLD.branch_id, OLD.room_id, OLD.ordinal)
    IS DISTINCT FROM (NEW.id, NEW.branch_id, NEW.room_id, NEW.ordinal) THEN
    RAISE EXCEPTION 'Physical bed identity cannot change' USING ERRCODE = '23514';
  END IF;
  SELECT rt.capacity INTO maximum FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = NEW.room_id AND r.branch_id = NEW.branch_id FOR UPDATE OF rt, r;
  SELECT count(*) INTO current_count FROM seats
    WHERE room_id = NEW.room_id AND archived_at IS NULL AND id <> NEW.id;
  IF NEW.archived_at IS NULL AND (maximum IS NULL OR current_count >= maximum) THEN
    RAISE EXCEPTION 'Physical beds exceed room capacity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER seats_capacity_guard BEFORE INSERT OR UPDATE ON seats
FOR EACH ROW EXECUTE FUNCTION hsm_seat_capacity_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_room_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM rooms r JOIN seats s ON s.room_id = r.id
    WHERE r.room_type_id = NEW.id AND s.archived_at IS NULL GROUP BY r.id HAVING count(*) > NEW.capacity) THEN
    RAISE EXCEPTION 'Room capacity is below existing physical beds' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER room_types_capacity_guard BEFORE UPDATE OF capacity ON room_types
FOR EACH ROW EXECUTE FUNCTION hsm_room_capacity_guard();

--> statement-breakpoint
-- BKG-001: the existing three-active-request cap survives concurrent direct writes.
CREATE FUNCTION hsm_booking_request_cap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  IF NEW.state <> 'pending_request' THEN RETURN NEW; END IF;
  PERFORM id FROM users WHERE id = NEW.customer_user_id FOR UPDATE;
  SELECT count(*) INTO total FROM bookings WHERE customer_user_id = NEW.customer_user_id
    AND id <> NEW.id AND state = 'pending_request' AND request_expires_at > CURRENT_TIMESTAMP;
  IF total >= 3 THEN RAISE EXCEPTION 'Active booking request limit reached' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_request_cap BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_booking_request_cap();
--> statement-breakpoint
CREATE FUNCTION hsm_booking_hold_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hold_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM booking_holds h WHERE h.id = NEW.hold_id
      AND (h.branch_id, h.room_id, h.seat_id, h.customer_user_id, h.move_in_date, h.move_out_date, h.quote_snapshot)
        IS NOT DISTINCT FROM (NEW.branch_id, NEW.room_id, NEW.seat_id, NEW.customer_user_id, NEW.move_in_date, NEW.move_out_date, NEW.quote_snapshot)
  ) THEN RAISE EXCEPTION 'Booking hold lineage mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_hold_lineage BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_booking_hold_lineage();

--> statement-breakpoint
CREATE FUNCTION hsm_booking_policy_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM booking_policies p JOIN branches b ON b.id = NEW.branch_id
    JOIN rooms r ON r.id = NEW.room_id AND r.branch_id = NEW.branch_id
    WHERE p.id = NEW.policy_version_id AND (
      (p.brand_id IS NULL AND p.branch_id IS NULL)
      OR p.brand_id = b.brand_id
      OR (p.branch_id = NEW.branch_id AND (p.room_type_id IS NULL OR p.room_type_id = r.room_type_id)))) THEN
    RAISE EXCEPTION 'Booking policy scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_policy_scope BEFORE INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_booking_policy_scope();
--> statement-breakpoint
CREATE TRIGGER booking_holds_policy_scope BEFORE INSERT ON booking_holds
FOR EACH ROW EXECUTE FUNCTION hsm_booking_policy_scope();
--> statement-breakpoint
CREATE FUNCTION hsm_booking_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM files WHERE id = NEW.file_id AND uploaded_by = NEW.customer_user_id
    AND visibility = 'private' AND purpose = 'resident_document' AND scan_status = 'clean') THEN
    RAISE EXCEPTION 'Booking document scope or scan mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booking_documents_scope_guard BEFORE INSERT OR UPDATE ON booking_documents
FOR EACH ROW EXECUTE FUNCTION hsm_booking_document_guard();
