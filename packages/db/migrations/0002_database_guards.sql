-- AUD-001..004: immutable audit rows, including protection against TRUNCATE.
CREATE FUNCTION hsm_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER hostel_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON hostel_audit_log FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON platform_audit_log FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER sensitive_access_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON sensitive_access_log FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
-- ADM-001: root mutations must also take this lock in the service transaction.
CREATE FUNCTION hsm_check_root_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  root_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(481001);
  SELECT count(*) INTO root_count FROM admin_accounts WHERE is_root AND status = 'active';
  IF root_count < 1 OR root_count > 3 THEN
    RAISE EXCEPTION 'Platform requires one to three active root administrators'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER admin_root_count
AFTER INSERT OR UPDATE OR DELETE ON admin_accounts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_check_root_count();
