-- BKG-004/005/008 / AUD-001: captured upfront terms, payment instructions and proof history are append-only.
CREATE FUNCTION hsm_booking_upfront_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Append-only booking payment history' USING ERRCODE = '23514';
  END IF;
  IF NEW.booking_id <> OLD.booking_id OR NEW.branch_id <> OLD.branch_id
    OR NEW.customer_user_id <> OLD.customer_user_id OR NEW.requirement <> OLD.requirement
    OR NEW.amount_paisa <> OLD.amount_paisa OR NEW.created_at <> OLD.created_at
    OR OLD.approved_at IS NOT NULL OR NEW.approved_at IS NULL OR NEW.approved_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Upfront terms are immutable except one approval' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_upfront_terms_guard BEFORE UPDATE OR DELETE ON booking_upfront_terms
FOR EACH ROW EXECUTE FUNCTION hsm_booking_upfront_terms_guard();
--> statement-breakpoint
CREATE TRIGGER booking_upfront_terms_truncate_guard BEFORE TRUNCATE ON booking_upfront_terms
FOR EACH STATEMENT EXECUTE FUNCTION hsm_booking_upfront_terms_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_booking_payment_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Append-only booking payment history' USING ERRCODE = '23514';
  END IF;
  IF OLD.state <> 'submitted' OR NEW.state = 'submitted'
    OR NEW.id <> OLD.id OR NEW.booking_id <> OLD.booking_id OR NEW.branch_id <> OLD.branch_id
    OR NEW.customer_user_id <> OLD.customer_user_id OR NEW.file_id <> OLD.file_id
    OR NEW.amount_paisa <> OLD.amount_paisa OR NEW.method <> OLD.method
    OR NEW.paid_on <> OLD.paid_on OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Payment proofs allow one review only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_payment_proof_guard BEFORE UPDATE OR DELETE ON booking_payment_proofs
FOR EACH ROW EXECUTE FUNCTION hsm_booking_payment_proof_guard();
--> statement-breakpoint
CREATE TRIGGER booking_payment_proof_truncate_guard BEFORE TRUNCATE ON booking_payment_proofs
FOR EACH STATEMENT EXECUTE FUNCTION hsm_booking_payment_proof_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_branch_payment_instruction_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Append-only booking payment history' USING ERRCODE = '23514';
  END IF;
  IF OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL
    OR NEW.id <> OLD.id OR NEW.branch_id <> OLD.branch_id OR NEW.method <> OLD.method
    OR NEW.account_title <> OLD.account_title OR NEW.account_identifier <> OLD.account_identifier
    OR NEW.instructions IS DISTINCT FROM OLD.instructions
    OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Payment instructions can only be archived' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER branch_payment_instruction_guard BEFORE UPDATE OR DELETE ON branch_payment_instructions
FOR EACH ROW EXECUTE FUNCTION hsm_branch_payment_instruction_guard();
--> statement-breakpoint
CREATE TRIGGER branch_payment_instruction_truncate_guard BEFORE TRUNCATE ON branch_payment_instructions
FOR EACH STATEMENT EXECUTE FUNCTION hsm_branch_payment_instruction_guard();
--> statement-breakpoint
-- ACC-004: a booking with captured upfront terms cannot confirm without an approved proof.
CREATE FUNCTION hsm_booking_upfront_confirmation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state = 'confirmed' AND OLD.state <> 'confirmed'
    AND EXISTS (SELECT 1 FROM booking_upfront_terms t WHERE t.booking_id = NEW.id)
    AND NOT EXISTS (SELECT 1 FROM booking_payment_proofs p
      WHERE p.booking_id = NEW.id AND p.state = 'approved') THEN
    RAISE EXCEPTION 'Upfront payment is not verified' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_upfront_confirmation_guard BEFORE UPDATE OF state ON bookings
FOR EACH ROW EXECUTE FUNCTION hsm_booking_upfront_confirmation_guard();
