-- CHG-008 / SEC-003 / BKG-001..009: private evidence has immutable provenance.
CREATE FUNCTION hsm_booking_document_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.consumed_at IS NOT NULL OR NEW.state = 'rejected'
      OR (NEW.booking_id IS NULL AND NEW.state <> 'pending') THEN
      RAISE EXCEPTION 'Evidence must begin unconsumed and pending review' USING ERRCODE = '23514';
    END IF;
    IF NEW.state = 'accepted' AND NOT EXISTS (
      SELECT 1 FROM booking_documents d WHERE d.id <> NEW.id
        AND d.customer_user_id = NEW.customer_user_id AND d.branch_id = NEW.branch_id
        AND d.kind = NEW.kind AND d.file_id = NEW.file_id AND d.state = 'accepted'
        AND d.reviewed_by_user_id = NEW.reviewed_by_user_id AND d.reviewed_at = NEW.reviewed_at
    ) THEN
      RAISE EXCEPTION 'Accepted evidence requires existing review provenance' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id, NEW.booking_id, NEW.branch_id, NEW.customer_user_id, NEW.kind, NEW.file_id, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.booking_id, OLD.branch_id, OLD.customer_user_id, OLD.kind, OLD.file_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Evidence identity and scope are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Consumed evidence cannot be changed or restored' USING ERRCODE = '23514';
  END IF;
  IF OLD.state <> 'pending' AND ROW(NEW.state, NEW.reviewed_by_user_id, NEW.reviewed_at, NEW.rejection_code)
    IS DISTINCT FROM ROW(OLD.state, OLD.reviewed_by_user_id, OLD.reviewed_at, OLD.rejection_code) THEN
    RAISE EXCEPTION 'Completed reviews are immutable; submit a new review record' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'pending' AND NEW.state <> 'pending' AND NOT EXISTS (
    SELECT 1 FROM branches b JOIN organizations o ON o.id = b.organization_id
      JOIN users u ON u.id = o.owner_user_id
    WHERE b.id = NEW.branch_id AND o.owner_user_id = NEW.reviewed_by_user_id AND u.account_status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM bookings b JOIN manager_assignments m ON m.branch_id = b.branch_id
      JOIN manager_inventory_grants g ON g.assignment_id = m.id
      JOIN users u ON u.id = m.user_id
    WHERE b.id = NEW.booking_id AND b.branch_id = NEW.branch_id AND b.state = 'confirmed'
      AND m.user_id = NEW.reviewed_by_user_id AND m.status = 'active'
      AND g.permission = 'document_review' AND u.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Pre-confirmation document review requires the owning Owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booking_documents_lifecycle_guard BEFORE INSERT OR UPDATE ON booking_documents
FOR EACH ROW EXECUTE FUNCTION hsm_booking_document_lifecycle();
--> statement-breakpoint
CREATE TRIGGER booking_documents_retain_history BEFORE DELETE OR TRUNCATE ON booking_documents
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
