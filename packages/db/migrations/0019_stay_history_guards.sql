-- RES-004/005 / ACC-001: enforce actual occupancy and complete assignment history.
-- btree_gist is installed by migration 0009. No existing migration is rewritten.
ALTER TABLE stay_assignments ADD CONSTRAINT stay_assignments_no_stay_overlap
EXCLUDE USING gist (stay_id WITH =, tstzrange(started_at, ended_at, '[)') WITH &&);
--> statement-breakpoint
ALTER TABLE stay_assignments ADD CONSTRAINT stay_assignments_no_physical_overlap
EXCLUDE USING gist (room_id WITH =,
  (CASE WHEN seat_ordinal IS NULL THEN int4range(NULL, NULL, '[)')
    ELSE int4range(seat_ordinal, seat_ordinal + 1, '[)') END) WITH &&,
  tstzrange(started_at, ended_at, '[)') WITH &&);
--> statement-breakpoint
CREATE FUNCTION hsm_stay_transition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['state','version','expected_leave_date','checked_in_at','closed_at','updated_at','user_id'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['state','version','expected_leave_date','checked_in_at','closed_at','updated_at','user_id']) THEN
    RAISE EXCEPTION 'Stay origin is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.state IN ('completed','cancelled_before_checkin','terminated','abandoned') THEN
    RAISE EXCEPTION 'Closed stay is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Stay version must advance exactly once' USING ERRCODE = '23514';
  END IF;
  IF OLD.checked_in_at IS NOT NULL AND NEW.checked_in_at IS DISTINCT FROM OLD.checked_in_at THEN
    RAISE EXCEPTION 'Actual check-in is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Linked stay identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.state <> NEW.state AND NOT (
    (OLD.state = 'check_in_ready' AND NEW.state IN ('active','cancelled_before_checkin')) OR
    (OLD.state = 'active' AND NEW.state IN ('notice_given','checkout_pending','completed','terminated','abandoned')) OR
    (OLD.state = 'notice_given' AND NEW.state IN ('active','checkout_pending','completed','terminated','abandoned')) OR
    (OLD.state = 'checkout_pending' AND NEW.state IN ('active','notice_given','completed','terminated','abandoned'))
  ) THEN RAISE EXCEPTION 'Invalid stay transition' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stays_transition_guard BEFORE UPDATE ON stays
FOR EACH ROW EXECUTE FUNCTION hsm_stay_transition_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_assignment_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'ended_at') IS DISTINCT FROM (to_jsonb(OLD) - 'ended_at')
    OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
    RAISE EXCEPTION 'Assignment history cannot be rewritten' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stay_assignments_history_guard BEFORE UPDATE ON stay_assignments
FOR EACH ROW EXECUTE FUNCTION hsm_assignment_history_guard();
--> statement-breakpoint
CREATE TRIGGER stay_history_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON stay_history
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER stay_agreements_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON stay_agreements
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION hsm_billing_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'is_current') IS DISTINCT FROM (to_jsonb(OLD) - 'is_current')
    OR (NOT OLD.is_current AND NEW.is_current) THEN
    RAISE EXCEPTION 'Billing policy version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER billing_policies_immutable_terms BEFORE UPDATE ON billing_policies
FOR EACH ROW EXECUTE FUNCTION hsm_billing_policy_guard();
--> statement-breakpoint
CREATE TRIGGER residents_retain_history BEFORE DELETE OR TRUNCATE ON residents
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER stays_retain_history BEFORE DELETE OR TRUNCATE ON stays
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER stay_assignments_retain_history BEFORE DELETE OR TRUNCATE ON stay_assignments
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER billing_policies_retain_history BEFORE DELETE OR TRUNCATE ON billing_policies
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
-- STAY-003 / RES-003: nullable account linkage cannot bypass global active-stay uniqueness.
CREATE FUNCTION hsm_stay_resident_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resident_user uuid;
BEGIN
  SELECT user_id INTO resident_user FROM residents
    WHERE id = NEW.resident_id AND branch_id = NEW.branch_id FOR KEY SHARE;
  IF NOT FOUND OR NEW.user_id IS DISTINCT FROM resident_user THEN
    RAISE EXCEPTION 'Stay resident identity mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stays_resident_identity_guard BEFORE INSERT OR UPDATE ON stays
FOR EACH ROW EXECUTE FUNCTION hsm_stay_resident_identity_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_resident_active_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM residents r JOIN stays s ON s.resident_id = r.id
    WHERE r.id = NEW.id AND s.state IN ('active','notice_given','checkout_pending')
      AND s.user_id IS DISTINCT FROM r.user_id) THEN
    RAISE EXCEPTION 'Active stay identity must commit with explicit resident linkage' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER residents_active_identity_guard AFTER UPDATE ON residents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_active_identity_guard();
