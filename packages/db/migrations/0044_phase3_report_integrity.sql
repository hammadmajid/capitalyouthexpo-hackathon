CREATE FUNCTION hsm_report_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Referenced report history cannot be removed' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['status','handled_by_user_id','resolution','resolved_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','handled_by_user_id','resolution','resolved_at']) THEN
    RAISE EXCEPTION 'Report source and submitted evidence are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.target_type = 'chat_message' THEN
    PERFORM id FROM chat_messages WHERE id = NEW.target_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reported message source is unavailable' USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reports_history BEFORE INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION hsm_report_history_guard();
--> statement-breakpoint
CREATE TRIGGER reports_no_truncate BEFORE TRUNCATE ON reports FOR EACH STATEMENT EXECUTE FUNCTION hsm_report_history_guard();
