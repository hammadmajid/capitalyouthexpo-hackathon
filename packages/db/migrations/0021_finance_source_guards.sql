-- FIN-001 / PAY-008 / OUT-004: immutable financial sources and exact posting provenance.
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['resident_charges','resident_charge_adjustments',
    'resident_payments','resident_receipts','resident_payment_reversals',
    'resident_fund_movements','resident_ledger','resident_invoice_charges'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation()', relation || '_immutable', relation);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_catalog_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at')
    OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
    RAISE EXCEPTION 'Referenced charge catalog history is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_charge_catalog_immutable BEFORE UPDATE ON resident_charge_catalog
FOR EACH ROW EXECUTE FUNCTION hsm_finance_catalog_guard();
--> statement-breakpoint
CREATE TRIGGER resident_charge_catalog_retain BEFORE DELETE OR TRUNCATE ON resident_charge_catalog
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_invoice_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state <> 'issued' OR NEW.state <> 'voided'
    OR (to_jsonb(NEW) - ARRAY['state','voided_at','voided_by_user_id','void_reason'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','voided_at','voided_by_user_id','void_reason']) THEN
    RAISE EXCEPTION 'Issued invoice facts are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_invoices_immutable BEFORE UPDATE ON resident_invoices
FOR EACH ROW EXECUTE FUNCTION hsm_finance_invoice_guard();
--> statement-breakpoint
CREATE TRIGGER resident_invoices_retain BEFORE DELETE OR TRUNCATE ON resident_invoices
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_charge_catalog_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'custom' AND NOT EXISTS (
    SELECT 1 FROM resident_charge_catalog c JOIN stay_agreements a ON a.id = NEW.agreement_id
    WHERE c.id = NEW.catalog_id AND c.branch_id = NEW.branch_id AND c.archived_at IS NULL
      AND a.branch_id = NEW.branch_id AND a.stay_id = NEW.stay_id
      AND a.terms_snapshot->'policy'->>'customCharges' = 'catalog_only'
      AND NEW.amount_paisa::numeric = c.unit_amount_paisa::numeric * NEW.quantity::numeric
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.terms_snapshot->'catalog') item
        WHERE item->>'catalogId' = c.id::text AND item->>'code' = c.code
          AND item->>'name' = c.name AND item->>'unitLabel' = c.unit_label
          AND (item->>'unitAmountPaisa')::numeric = c.unit_amount_paisa)
  ) THEN RAISE EXCEPTION 'Custom charge requires active catalog and disclosed agreement policy' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_charges_catalog_guard BEFORE INSERT ON resident_charges
FOR EACH ROW EXECUTE FUNCTION hsm_finance_charge_catalog_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_payment_proof_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proof_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM files f JOIN stays s ON s.id = NEW.stay_id AND s.branch_id = NEW.branch_id
    WHERE f.id = NEW.proof_file_id AND f.visibility = 'private' AND f.purpose = 'payment_proof'
      AND f.scan_status = 'clean' AND (f.uploaded_by = s.user_id OR f.uploaded_by = NEW.approved_by_user_id)
  ) THEN RAISE EXCEPTION 'Payment proof purpose, scan or identity mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_payments_proof_guard BEFORE INSERT ON resident_payments
FOR EACH ROW EXECUTE FUNCTION hsm_finance_payment_proof_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_receipt_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resident_label text; branch_label text; hostel_label text;
BEGIN
  SELECT r.display_name, b.name, h.name INTO resident_label, branch_label, hostel_label
    FROM resident_payments p JOIN stays s ON s.id = p.stay_id AND s.branch_id = p.branch_id
    JOIN residents r ON r.id = s.resident_id AND r.branch_id = s.branch_id
    JOIN branches b ON b.id = s.branch_id JOIN brands h ON h.id = b.brand_id
    WHERE p.id = NEW.payment_id AND p.branch_id = NEW.branch_id AND p.stay_id = NEW.stay_id;
  IF NOT FOUND OR NEW.snapshot->>'residentName' IS DISTINCT FROM btrim(resident_label)
    OR NEW.snapshot->>'branchName' IS DISTINCT FROM btrim(branch_label)
    OR NEW.snapshot->>'hostelName' IS DISTINCT FROM btrim(hostel_label) THEN
    RAISE EXCEPTION 'Receipt party identity mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_receipts_identity_guard BEFORE INSERT ON resident_receipts
FOR EACH ROW EXECUTE FUNCTION hsm_finance_receipt_identity_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_ledger_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE amount bigint; expected_side resident_ledger_side_enum; parent_payment uuid;
  parent_invoice uuid; movement resident_fund_movement_kind_enum; original resident_ledger%ROWTYPE;
BEGIN
  IF NEW.funding_payment_id IS NOT NULL THEN
    PERFORM id FROM resident_payments WHERE id = NEW.funding_payment_id
      AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id FOR UPDATE;
    IF NOT FOUND OR (NEW.payment_reversal_id IS NULL AND EXISTS (
      SELECT 1 FROM resident_payment_reversals WHERE payment_id = NEW.funding_payment_id
    )) THEN RAISE EXCEPTION 'Funding payment unavailable' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM id FROM resident_invoices WHERE id = NEW.invoice_id
      AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE = '23514'; END IF;
  END IF;
  IF NEW.charge_id IS NOT NULL THEN
    SELECT amount_paisa INTO amount FROM resident_charges WHERE id = NEW.charge_id
      AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id;
    IF NOT FOUND OR NEW.amount_paisa IS DISTINCT FROM amount OR NEW.account <> 'receivable'
      OR NEW.side <> 'debit' OR NEW.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Charge posting mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.adjustment_id IS NOT NULL THEN
    SELECT amount_paisa, side INTO amount, expected_side FROM resident_charge_adjustments
      WHERE id = NEW.adjustment_id AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id;
    IF NOT FOUND OR NEW.amount_paisa IS DISTINCT FROM amount OR NEW.side IS DISTINCT FROM expected_side
      OR NEW.account <> 'receivable' OR NEW.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Adjustment posting mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.payment_id IS NOT NULL THEN
    IF NEW.side <> 'credit' OR (NEW.account = 'receivable' AND NEW.invoice_id IS NULL) THEN
      RAISE EXCEPTION 'Approved payment posting mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.fund_movement_id IS NOT NULL THEN
    SELECT amount_paisa, kind, payment_id, invoice_id INTO amount, movement, parent_payment, parent_invoice
      FROM resident_fund_movements WHERE id = NEW.fund_movement_id
        AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id;
    IF NOT FOUND OR NEW.amount_paisa IS DISTINCT FROM amount
      OR NEW.funding_payment_id IS DISTINCT FROM parent_payment OR NOT (
        (movement IN ('deposit_apply','advance_apply') AND (
          (NEW.account = 'receivable' AND NEW.side = 'credit' AND NEW.invoice_id IS NOT DISTINCT FROM parent_invoice)
          OR (NEW.account = CASE WHEN movement = 'deposit_apply' THEN 'deposit'::resident_ledger_account_enum ELSE 'advance'::resident_ledger_account_enum END
            AND NEW.side = 'debit' AND NEW.invoice_id IS NULL)))
        OR (movement IN ('deposit_deduct','deposit_refund','advance_refund') AND NEW.side = 'debit'
          AND NEW.invoice_id IS NULL AND NEW.account = CASE WHEN movement = 'advance_refund'
            THEN 'advance'::resident_ledger_account_enum ELSE 'deposit'::resident_ledger_account_enum END)
      ) THEN RAISE EXCEPTION 'Fund movement posting mismatch' USING ERRCODE = '23514'; END IF;
  ELSIF NEW.payment_reversal_id IS NOT NULL THEN
    SELECT payment_id INTO parent_payment FROM resident_payment_reversals
      WHERE id = NEW.payment_reversal_id AND branch_id = NEW.branch_id AND stay_id = NEW.stay_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment reversal unavailable' USING ERRCODE = '23514'; END IF;
    SELECT * INTO original FROM resident_ledger WHERE id = NEW.reversed_entry_id;
    IF NOT FOUND OR original.payment_id IS DISTINCT FROM parent_payment
      OR original.branch_id IS DISTINCT FROM NEW.branch_id OR original.stay_id IS DISTINCT FROM NEW.stay_id
      OR original.amount_paisa IS DISTINCT FROM NEW.amount_paisa OR original.account IS DISTINCT FROM NEW.account
      OR original.invoice_id IS DISTINCT FROM NEW.invoice_id OR original.side = NEW.side
      OR NEW.funding_payment_id IS DISTINCT FROM parent_payment THEN
      RAISE EXCEPTION 'Payment reversal posting mismatch' USING ERRCODE = '23514'; END IF;
  ELSE RAISE EXCEPTION 'Unknown ledger source' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_ledger_source_guard BEFORE INSERT ON resident_ledger
FOR EACH ROW EXECUTE FUNCTION hsm_finance_ledger_source_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_queue(check_kind finance_check_kind_enum, subject uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF subject IS NOT NULL THEN
    INSERT INTO resident_finance_checks(transaction_id,kind,subject_id)
      VALUES(txid_current(),check_kind,subject) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_queue_charge(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM hsm_finance_queue('charge',subject);
  INSERT INTO resident_finance_checks(transaction_id,kind,subject_id)
    SELECT txid_current(),'invoice'::finance_check_kind_enum,invoice_id FROM resident_invoice_charges WHERE charge_id = subject
    ON CONFLICT DO NOTHING;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_enqueue_checks() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE charge uuid;
BEGIN
  CASE TG_TABLE_NAME
  WHEN 'resident_charges' THEN PERFORM hsm_finance_queue_charge(NEW.id);
  WHEN 'resident_charge_adjustments' THEN
    PERFORM hsm_finance_queue('adjustment',NEW.id); PERFORM hsm_finance_queue_charge(NEW.charge_id);
  WHEN 'resident_invoices' THEN PERFORM hsm_finance_queue('invoice',NEW.id);
  WHEN 'resident_invoice_charges' THEN PERFORM hsm_finance_queue('invoice',NEW.invoice_id);
  WHEN 'resident_payments' THEN
    PERFORM hsm_finance_queue('payment',NEW.id); PERFORM hsm_finance_queue('funding',NEW.id);
  WHEN 'resident_receipts' THEN PERFORM hsm_finance_queue('payment',NEW.payment_id);
  WHEN 'resident_fund_movements' THEN
    PERFORM hsm_finance_queue('movement',NEW.id); PERFORM hsm_finance_queue('funding',NEW.payment_id);
    PERFORM hsm_finance_queue('invoice',NEW.invoice_id);
  WHEN 'resident_payment_reversals' THEN
    PERFORM hsm_finance_queue('reversal',NEW.id); PERFORM hsm_finance_queue('funding',NEW.payment_id);
    INSERT INTO resident_finance_checks(transaction_id,kind,subject_id)
      SELECT DISTINCT txid_current(),'invoice'::finance_check_kind_enum,invoice_id FROM resident_ledger
      WHERE payment_id = NEW.payment_id AND invoice_id IS NOT NULL ON CONFLICT DO NOTHING;
  WHEN 'resident_ledger' THEN
    PERFORM hsm_finance_queue_charge(NEW.charge_id);
    PERFORM hsm_finance_queue('adjustment',NEW.adjustment_id);
    IF NEW.adjustment_id IS NOT NULL THEN
      SELECT charge_id INTO charge FROM resident_charge_adjustments WHERE id = NEW.adjustment_id;
      PERFORM hsm_finance_queue_charge(charge);
    END IF;
    PERFORM hsm_finance_queue('payment',NEW.payment_id);
    PERFORM hsm_finance_queue('movement',NEW.fund_movement_id);
    PERFORM hsm_finance_queue('reversal',NEW.payment_reversal_id);
    PERFORM hsm_finance_queue('funding',NEW.funding_payment_id);
    PERFORM hsm_finance_queue('invoice',NEW.invoice_id);
  ELSE RAISE EXCEPTION 'Unknown financial source' USING ERRCODE = '23514'; END CASE;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['resident_charges','resident_charge_adjustments','resident_invoices',
    'resident_invoice_charges','resident_payments','resident_receipts',
    'resident_fund_movements','resident_payment_reversals','resident_ledger'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON %I FOR EACH ROW EXECUTE FUNCTION hsm_finance_enqueue_checks()', relation || '_checks',relation);
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_invoices_void_checks AFTER UPDATE ON resident_invoices
FOR EACH ROW EXECUTE FUNCTION hsm_finance_enqueue_checks();
