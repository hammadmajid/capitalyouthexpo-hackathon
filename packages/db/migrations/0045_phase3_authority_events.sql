CREATE FUNCTION hsm_notify_authority_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'sessions' THEN
    IF OLD.revoked_at IS DISTINCT FROM NEW.revoked_at OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
      OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM pg_notify('hsm_authority_changed', json_build_object('kind','session','id',OLD.id)::text);
    END IF;
  ELSIF TG_TABLE_NAME = 'users' THEN
    IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
      PERFORM pg_notify('hsm_authority_changed', json_build_object('kind','user','id',OLD.id)::text);
    END IF;
  ELSIF TG_TABLE_NAME = 'manager_assignments' THEN
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.user_id IS DISTINCT FROM NEW.user_id
      OR OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
      PERFORM pg_notify('hsm_authority_changed', json_build_object('kind','user','id',OLD.user_id)::text);
    END IF;
  ELSIF TG_TABLE_NAME = 'organizations' THEN
    IF OLD.archived_at IS DISTINCT FROM NEW.archived_at OR OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
      PERFORM pg_notify('hsm_authority_changed', json_build_object('kind','hierarchy')::text);
    END IF;
  ELSE
    IF OLD.archived_at IS DISTINCT FROM NEW.archived_at
      OR (to_jsonb(OLD)->'organization_id') IS DISTINCT FROM (to_jsonb(NEW)->'organization_id')
      OR (to_jsonb(OLD)->'brand_id') IS DISTINCT FROM (to_jsonb(NEW)->'brand_id') THEN
      PERFORM pg_notify('hsm_authority_changed', json_build_object('kind','hierarchy')::text);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sessions_authority_changed AFTER UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
--> statement-breakpoint
CREATE TRIGGER users_authority_changed AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
--> statement-breakpoint
CREATE TRIGGER manager_assignments_authority_changed AFTER UPDATE ON manager_assignments FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
--> statement-breakpoint
CREATE TRIGGER organizations_authority_changed AFTER UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
--> statement-breakpoint
CREATE TRIGGER brands_authority_changed AFTER UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
--> statement-breakpoint
CREATE TRIGGER branches_authority_changed AFTER UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION hsm_notify_authority_change();
