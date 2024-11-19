-- STAY-001 / RES-004 / ACC-001: one canonical conflict domain for reservations and actual assignments.
CREATE OR REPLACE FUNCTION hsm_inventory_claim_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_branch uuid; source_room uuid; source_seat uuid; source_start date; source_end date;
BEGIN
  PERFORM id FROM rooms WHERE id = NEW.room_id AND branch_id = NEW.branch_id FOR UPDATE;
  IF NEW.assignment_id IS NOT NULL THEN
    SELECT a.branch_id,a.room_id,a.seat_id,(a.started_at AT TIME ZONE 'Asia/Karachi')::date,s.expected_leave_date
      INTO source_branch,source_room,source_seat,source_start,source_end
      FROM stay_assignments a JOIN stays s ON s.id = a.stay_id AND s.branch_id = a.branch_id
      WHERE a.id = NEW.assignment_id;
    IF source_branch IS NULL OR (NEW.branch_id,NEW.room_id,NEW.seat_id)
      IS DISTINCT FROM (source_branch,source_room,source_seat) OR NEW.expires_at IS NOT NULL
      OR (TG_OP = 'INSERT' AND (NEW.move_in_date,NEW.move_out_date) IS DISTINCT FROM (source_start,source_end)) THEN
      RAISE EXCEPTION 'Stay claim target or period mismatch' USING ERRCODE = '23514'; END IF;
  ELSE
    IF NEW.hold_id IS NOT NULL THEN
      SELECT branch_id,room_id,seat_id,move_in_date,move_out_date
        INTO source_branch,source_room,source_seat,source_start,source_end FROM booking_holds WHERE id = NEW.hold_id;
    ELSIF NEW.booking_id IS NOT NULL THEN
      SELECT branch_id,room_id,seat_id,move_in_date,move_out_date
        INTO source_branch,source_room,source_seat,source_start,source_end FROM bookings WHERE id = NEW.booking_id;
    ELSE
      SELECT branch_id,room_id,seat_id,move_in_date,move_out_date
        INTO source_branch,source_room,source_seat,source_start,source_end FROM inventory_blocks WHERE id = NEW.block_id;
    END IF;
    IF source_branch IS NULL OR (NEW.branch_id,NEW.room_id,NEW.seat_id,NEW.move_in_date,NEW.move_out_date)
      IS DISTINCT FROM (source_branch,source_room,source_seat,source_start,source_end) OR NEW.move_out_date IS NULL THEN
      RAISE EXCEPTION 'Inventory claim target mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  -- An expected departure does not check out an actual occupant. Room lock serializes current-day admission/hold paths.
  IF NEW.released_at IS NULL AND EXISTS (
    SELECT 1 FROM stay_assignments a JOIN stays s ON s.id = a.stay_id AND s.branch_id = a.branch_id
    WHERE a.room_id = NEW.room_id AND a.branch_id = NEW.branch_id
      AND a.ended_at IS NULL AND a.started_at <= CURRENT_TIMESTAMP
      AND (NEW.move_out_date IS NULL OR (a.started_at AT TIME ZONE 'Asia/Karachi')::date < NEW.move_out_date)
      AND (NEW.assignment_id IS NULL OR a.id <> NEW.assignment_id)
      AND (NEW.seat_id IS NULL OR a.seat_id IS NULL OR a.seat_id = NEW.seat_id)
      AND (NEW.move_in_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date
        OR s.expected_leave_date IS NULL OR s.expected_leave_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Karachi')::date)
  ) THEN RAISE EXCEPTION 'Inventory is actually occupied or its departure plan is stale' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hsm_check_inventory_source(source_kind text, source_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE required boolean; present integer; source_expiry timestamptz; claim_expiry timestamptz;
  source_start date; source_end date; claim_start date; claim_end date; stay_state stay_state_enum;
BEGIN
  IF source_id IS NULL THEN RETURN; END IF;
  IF source_kind = 'hold' THEN
    SELECT released_at IS NULL,expires_at INTO required,source_expiry FROM booking_holds WHERE id = source_id;
    SELECT count(*),min(expires_at) INTO present,claim_expiry FROM inventory_claims WHERE hold_id = source_id AND released_at IS NULL;
  ELSIF source_kind = 'booking' THEN
    SELECT (state = 'confirmed' AND NOT EXISTS (
      SELECT 1 FROM stays s WHERE s.booking_id = bookings.id AND s.checked_in_at IS NOT NULL AND (
        (s.state IN ('completed','terminated','abandoned') AND EXISTS (SELECT 1 FROM stay_assignments a WHERE a.stay_id = s.id))
        OR (s.state IN ('active','notice_given','checkout_pending') AND EXISTS (
          SELECT 1 FROM stay_assignments a JOIN inventory_claims c ON c.assignment_id = a.id AND c.released_at IS NULL
          WHERE a.stay_id = s.id AND a.ended_at IS NULL))
      ))) OR (state = 'pending_request' AND quote_snapshot->'policy'->>'requestReservesInventory' = 'true'),
      CASE WHEN state = 'pending_request' THEN request_expires_at ELSE NULL END
      INTO required,source_expiry FROM bookings WHERE id = source_id;
    SELECT count(*),min(expires_at) INTO present,claim_expiry FROM inventory_claims WHERE booking_id = source_id AND released_at IS NULL;
  ELSIF source_kind = 'block' THEN
    SELECT released_at IS NULL INTO required FROM inventory_blocks WHERE id = source_id;
    SELECT count(*),min(expires_at) INTO present,claim_expiry FROM inventory_claims WHERE block_id = source_id AND released_at IS NULL;
  ELSIF source_kind = 'assignment' THEN
    SELECT a.ended_at IS NULL,(a.started_at AT TIME ZONE 'Asia/Karachi')::date,s.expected_leave_date,s.state
      INTO required,source_start,source_end,stay_state FROM stay_assignments a JOIN stays s ON s.id = a.stay_id
      WHERE a.id = source_id;
    SELECT count(*),min(expires_at),min(move_in_date),min(move_out_date)
      INTO present,claim_expiry,claim_start,claim_end FROM inventory_claims WHERE assignment_id = source_id AND released_at IS NULL;
    IF required AND (stay_state NOT IN ('active','notice_given','checkout_pending')
      OR claim_start IS DISTINCT FROM source_start OR claim_end IS DISTINCT FROM source_end
      OR (source_end IS NULL AND NOT EXISTS (SELECT 1 FROM stay_agreements g JOIN stay_assignments a ON a.stay_id = g.stay_id
        WHERE a.id = source_id AND g.terms_snapshot->'policy'->>'allowOpenEnded' = 'true'
          AND g.version = (SELECT max(version) FROM stay_agreements WHERE stay_id = g.stay_id)))) THEN
      RAISE EXCEPTION 'Active assignment requires exact Stay period and explicit open-ended policy' USING ERRCODE = '23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown inventory source' USING ERRCODE = '23514'; END IF;
  IF required IS NULL OR present <> (CASE WHEN required THEN 1 ELSE 0 END)
    OR (required AND claim_expiry IS DISTINCT FROM source_expiry) THEN
    RAISE EXCEPTION 'Inventory source and claim must commit together' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hsm_inventory_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'booking_holds' THEN PERFORM hsm_check_inventory_source('hold',NEW.id);
  ELSIF TG_TABLE_NAME = 'bookings' THEN PERFORM hsm_check_inventory_source('booking',NEW.id);
  ELSIF TG_TABLE_NAME = 'inventory_blocks' THEN PERFORM hsm_check_inventory_source('block',NEW.id);
  ELSE
    PERFORM hsm_check_inventory_source('hold',NEW.hold_id);
    PERFORM hsm_check_inventory_source('booking',NEW.booking_id);
    PERFORM hsm_check_inventory_source('block',NEW.block_id);
    PERFORM hsm_check_inventory_source('assignment',NEW.assignment_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_stay_inventory_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment uuid; booking uuid;
BEGIN
  IF TG_TABLE_NAME = 'stay_assignments' THEN
    PERFORM hsm_check_inventory_source('assignment',NEW.id);
    SELECT booking_id INTO booking FROM stays WHERE id = NEW.stay_id;
  ELSE
    FOR assignment IN SELECT id FROM stay_assignments WHERE stay_id = NEW.id AND ended_at IS NULL LOOP
      PERFORM hsm_check_inventory_source('assignment',assignment);
    END LOOP;
    booking := NEW.booking_id;
  END IF;
  PERFORM hsm_check_inventory_source('booking',booking);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stay_assignments_claim_guard AFTER INSERT OR UPDATE ON stay_assignments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_stay_inventory_source_guard();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stays_claim_guard AFTER INSERT OR UPDATE ON stays
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_stay_inventory_source_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_fulfilled_booking_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IS DISTINCT FROM NEW.state AND EXISTS (SELECT 1 FROM stays s
    WHERE s.booking_id = OLD.id AND s.checked_in_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM stay_assignments a WHERE a.stay_id = s.id)) THEN
    RAISE EXCEPTION 'Checked-in booking must use Stay lifecycle' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bookings_fulfilled_guard BEFORE UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_fulfilled_booking_guard();
