-- PROP-001 / AUD-001: immutable validation source; one attributed atomic commit.
CREATE FUNCTION hsm_inventory_import_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM 1 FROM files f WHERE f.id = NEW.file_id AND f.uploaded_by = NEW.created_by_user_id
      AND f.visibility = 'private' AND f.purpose = 'import' AND f.mime_type = 'text/csv'
      AND f.scan_status = 'clean' AND f.sha256 = NEW.file_sha256;
    IF NOT FOUND OR NEW.status = 'committed' THEN
      RAISE EXCEPTION 'Import validation requires its clean source' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Import history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.branch_id, NEW.kind, NEW.file_id, NEW.file_sha256, NEW.total_rows,
      NEW.error_rows, NEW.rows, NEW.created_by_user_id, NEW.created_at)
    IS DISTINCT FROM
     (OLD.id, OLD.branch_id, OLD.kind, OLD.file_id, OLD.file_sha256, OLD.total_rows,
      OLD.error_rows, OLD.rows, OLD.created_by_user_id, OLD.created_at)
    OR OLD.status <> 'validated' OR NEW.status <> 'committed'
    OR NEW.committed_at IS NULL OR NEW.committed_at < OLD.created_at THEN
    RAISE EXCEPTION 'Import source and terminal history are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_import_history_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_import_runs
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_import_history_guard();
--> statement-breakpoint
CREATE TRIGGER inventory_import_truncate_guard BEFORE TRUNCATE ON inventory_import_runs
FOR EACH STATEMENT EXECUTE FUNCTION hsm_inventory_import_history_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_inventory_import_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.uploaded_by, NEW.visibility, NEW.bucket, NEW.object_key, NEW.mime_type,
      NEW.size_bytes, NEW.purpose, NEW.sha256)
    IS DISTINCT FROM
     (OLD.id, OLD.uploaded_by, OLD.visibility, OLD.bucket, OLD.object_key, OLD.mime_type,
      OLD.size_bytes, OLD.purpose, OLD.sha256)
    AND EXISTS (SELECT 1 FROM inventory_import_runs r WHERE r.file_id = OLD.id) THEN
    RAISE EXCEPTION 'Referenced import file source is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_import_file_guard BEFORE UPDATE ON files
FOR EACH ROW EXECUTE FUNCTION hsm_inventory_import_file_guard();
