-- FIN-001 / PAY-008 / OUT-004: exact, transaction-complete financial history.
CREATE FUNCTION hsm_finance_json_money(value jsonb) RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE amount numeric;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Invalid receipt money' USING ERRCODE = '23514'; END IF;
  amount := value::text::numeric;
  IF amount < 0 OR amount > 9007199254740991 OR amount <> trunc(amount) THEN
    RAISE EXCEPTION 'Invalid receipt money' USING ERRCODE = '23514'; END IF;
  RETURN amount;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_receipt(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE payment resident_payments%ROWTYPE; document jsonb; distribution jsonb;
  allocated numeric; deposit numeric; advance numeric; actual jsonb; declared jsonb;
  fields text[] := ARRAY['version','currency','paymentId','branchId','stayId','residentName',
    'hostelName','branchName','amountPaisa','method','transactionReference','paidOn','approvedAt','allocations','distribution'];
BEGIN
  SELECT * INTO STRICT payment FROM resident_payments WHERE id = subject;
  SELECT snapshot INTO STRICT document FROM resident_receipts WHERE payment_id = subject;
  IF NOT (document ?& fields) OR document - fields <> '{}'::jsonb
    OR document->'version' IS DISTINCT FROM '1'::jsonb OR document->>'currency' IS DISTINCT FROM 'PKR'
    OR document->>'paymentId' IS DISTINCT FROM payment.id::text
    OR document->>'branchId' IS DISTINCT FROM payment.branch_id::text
    OR document->>'stayId' IS DISTINCT FROM payment.stay_id::text
    OR document->>'method' IS DISTINCT FROM payment.method::text
    OR document->>'transactionReference' IS DISTINCT FROM payment.transaction_reference
    OR document->>'paidOn' IS DISTINCT FROM payment.paid_on::text
    OR (document->>'approvedAt')::timestamptz IS DISTINCT FROM payment.approved_at
    OR hsm_finance_json_money(document->'amountPaisa') <> payment.amount_paisa THEN
    RAISE EXCEPTION 'Receipt payment facts mismatch' USING ERRCODE = '23514'; END IF;
  distribution := document->'distribution';
  IF jsonb_typeof(distribution) IS DISTINCT FROM 'object'
    OR NOT (distribution ?& ARRAY['allocatedPaisa','depositPaisa','advanceCreditPaisa'])
    OR distribution - ARRAY['allocatedPaisa','depositPaisa','advanceCreditPaisa'] <> '{}'::jsonb
    OR jsonb_typeof(document->'allocations') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid receipt distribution' USING ERRCODE = '23514'; END IF;
  IF jsonb_array_length(document->'allocations') > 100 THEN
    RAISE EXCEPTION 'Receipt allocation limit exceeded' USING ERRCODE = '23514'; END IF;
  SELECT coalesce(sum(amount_paisa) FILTER (WHERE account = 'receivable'),0),
    coalesce(sum(amount_paisa) FILTER (WHERE account = 'deposit'),0),
    coalesce(sum(amount_paisa) FILTER (WHERE account = 'advance'),0)
    INTO allocated, deposit, advance FROM resident_ledger WHERE payment_id = subject;
  IF hsm_finance_json_money(distribution->'allocatedPaisa') <> allocated
    OR hsm_finance_json_money(distribution->'depositPaisa') <> deposit
    OR hsm_finance_json_money(distribution->'advanceCreditPaisa') <> advance THEN
    RAISE EXCEPTION 'Receipt distribution mismatch' USING ERRCODE = '23514'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invoiceId',l.invoice_id::text,
    'invoiceNumber',i.number,'amountPaisa',l.amount_paisa) ORDER BY l.invoice_id),'[]'::jsonb)
    INTO actual FROM resident_ledger l JOIN resident_invoices i ON i.id = l.invoice_id
    WHERE l.payment_id = subject AND l.account = 'receivable';
  SELECT coalesce(jsonb_agg(item ORDER BY (item->>'invoiceId')::uuid),'[]'::jsonb)
    INTO declared FROM jsonb_array_elements(document->'allocations') item;
  IF actual IS DISTINCT FROM declared THEN
    RAISE EXCEPTION 'Receipt allocation facts mismatch' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_payment(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE amount bigint; posted numeric; receipts bigint;
BEGIN
  SELECT amount_paisa INTO STRICT amount FROM resident_payments WHERE id = subject FOR UPDATE;
  SELECT coalesce(sum(amount_paisa),0) INTO posted FROM resident_ledger WHERE payment_id = subject;
  SELECT count(*) INTO receipts FROM resident_receipts WHERE payment_id = subject;
  IF posted <> amount OR receipts <> 1 THEN
    RAISE EXCEPTION 'Approved payment requires complete ledger and receipt' USING ERRCODE = '23514'; END IF;
  PERFORM hsm_finance_check_receipt(subject);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_charge(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE amount bigint; posted numeric; entries bigint; amendment numeric;
BEGIN
  SELECT amount_paisa INTO STRICT amount FROM resident_charges WHERE id = subject FOR UPDATE;
  SELECT count(*),coalesce(sum(amount_paisa),0) INTO entries,posted
    FROM resident_ledger WHERE charge_id = subject;
  SELECT coalesce(sum(CASE WHEN l.side = 'debit' THEN l.amount_paisa ELSE -l.amount_paisa END),0)
    INTO amendment FROM resident_ledger l JOIN resident_charge_adjustments a ON a.id = l.adjustment_id
    WHERE a.charge_id = subject;
  IF entries <> 1 OR posted <> amount OR amount + amendment < 0 THEN
    RAISE EXCEPTION 'Charge ledger incomplete or negative' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_adjustment(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE amount bigint; posted numeric; entries bigint;
BEGIN
  SELECT amount_paisa INTO STRICT amount FROM resident_charge_adjustments WHERE id = subject;
  SELECT count(*),coalesce(sum(amount_paisa),0) INTO entries,posted
    FROM resident_ledger WHERE adjustment_id = subject;
  IF entries <> 1 OR posted <> amount THEN
    RAISE EXCEPTION 'Adjustment ledger incomplete' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_invoice(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE invoice resident_invoices%ROWTYPE; face numeric; amendment numeric; allocated numeric;
BEGIN
  SELECT * INTO STRICT invoice FROM resident_invoices WHERE id = subject FOR UPDATE;
  SELECT coalesce(sum(c.amount_paisa),0) INTO face FROM resident_invoice_charges ic
    JOIN resident_charges c ON c.id = ic.charge_id WHERE ic.invoice_id = subject;
  SELECT coalesce(sum(CASE WHEN l.side = 'debit' THEN l.amount_paisa ELSE -l.amount_paisa END),0)
    INTO amendment FROM resident_invoice_charges ic JOIN resident_charge_adjustments a ON a.charge_id = ic.charge_id
    JOIN resident_ledger l ON l.adjustment_id = a.id WHERE ic.invoice_id = subject;
  SELECT coalesce(sum(CASE WHEN side = 'credit' THEN amount_paisa ELSE -amount_paisa END),0)
    INTO allocated FROM resident_ledger WHERE invoice_id = subject;
  IF face <> invoice.total_paisa OR face + amendment < 0 OR allocated < 0
    OR allocated > face + amendment
    OR (invoice.state = 'voided' AND (face + amendment <> 0 OR allocated <> 0)) THEN
    RAISE EXCEPTION 'Invoice face, adjustment or allocation mismatch' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_funding(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM resident_payments WHERE id = subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funding payment missing' USING ERRCODE = '23514'; END IF;
  IF EXISTS (SELECT account FROM resident_ledger WHERE funding_payment_id = subject
    AND account IN ('deposit','advance') GROUP BY account
    HAVING sum(CASE WHEN side = 'credit' THEN amount_paisa ELSE -amount_paisa END) < 0) THEN
    RAISE EXCEPTION 'Deposit or advance would become negative' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_movement(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE movement resident_fund_movements%ROWTYPE; entries bigint;
BEGIN
  SELECT * INTO STRICT movement FROM resident_fund_movements WHERE id = subject;
  SELECT count(*) INTO entries FROM resident_ledger WHERE fund_movement_id = subject;
  IF entries <> (CASE WHEN movement.kind IN ('deposit_apply','advance_apply') THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'Fund movement ledger incomplete' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_check_reversal(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE payment uuid; originals bigint; entries bigint;
BEGIN
  SELECT payment_id INTO STRICT payment FROM resident_payment_reversals WHERE id = subject;
  SELECT count(*) INTO originals FROM resident_ledger WHERE payment_id = payment;
  SELECT count(*) INTO entries FROM resident_ledger WHERE payment_reversal_id = subject;
  IF originals = 0 OR entries <> originals THEN
    RAISE EXCEPTION 'Payment reversal ledger incomplete' USING ERRCODE = '23514'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_finance_validate_subject() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transaction_id <> txid_current() THEN
    RAISE EXCEPTION 'Invalid financial validation transaction' USING ERRCODE = '23514'; END IF;
  CASE NEW.kind
    WHEN 'charge' THEN PERFORM hsm_finance_check_charge(NEW.subject_id);
    WHEN 'adjustment' THEN PERFORM hsm_finance_check_adjustment(NEW.subject_id);
    WHEN 'invoice' THEN PERFORM hsm_finance_check_invoice(NEW.subject_id);
    WHEN 'payment' THEN PERFORM hsm_finance_check_payment(NEW.subject_id);
    WHEN 'movement' THEN PERFORM hsm_finance_check_movement(NEW.subject_id);
    WHEN 'reversal' THEN PERFORM hsm_finance_check_reversal(NEW.subject_id);
    WHEN 'funding' THEN PERFORM hsm_finance_check_funding(NEW.subject_id);
    ELSE RAISE EXCEPTION 'Unknown financial check' USING ERRCODE = '23514';
  END CASE;
  DELETE FROM resident_finance_checks WHERE transaction_id = NEW.transaction_id
    AND kind = NEW.kind AND subject_id = NEW.subject_id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_finance_validate AFTER INSERT ON resident_finance_checks
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_finance_validate_subject();
--> statement-breakpoint
CREATE FUNCTION hsm_finance_protect_checks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'DELETE' OR pg_trigger_depth() <> 2 THEN
    RAISE EXCEPTION 'Financial validation queue is internal' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resident_finance_checks_protect BEFORE UPDATE OR DELETE OR TRUNCATE
ON resident_finance_checks FOR EACH STATEMENT EXECUTE FUNCTION hsm_finance_protect_checks();
