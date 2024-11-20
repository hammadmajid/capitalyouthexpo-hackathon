-- AUD-004 / FIN-002: install integrity before considering any nullable human actor transition.
-- Existing posted_by_user_id / issued_by_user_id NOT NULL constraints are preserved.
ALTER TABLE resident_billing_origins ALTER CONSTRAINT resident_billing_origins_execution_fk DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION hsm_resident_billing_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM resident_charges c JOIN resident_invoices i ON i.id=NEW.invoice_id
      JOIN resident_invoice_charges link ON link.charge_id=c.id AND link.invoice_id=i.id
    WHERE c.id=NEW.charge_id AND c.branch_id=NEW.branch_id AND c.stay_id=NEW.stay_id
      AND c.agreement_id=NEW.agreement_id AND c.posted_by_user_id IS NULL
      AND i.branch_id=NEW.branch_id AND i.stay_id=NEW.stay_id AND i.issued_by_user_id IS NULL
      AND i.state='issued' AND i.total_paisa=c.amount_paisa
      AND (SELECT count(*) FROM resident_invoice_charges item
        WHERE item.branch_id=NEW.branch_id AND item.stay_id=NEW.stay_id AND item.invoice_id=i.id)=1
  ) THEN
    RAISE EXCEPTION 'Scheduled origin requires exact system financial sources' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER resident_billing_origin_guard BEFORE INSERT ON resident_billing_origins
FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_origin_guard();
--> statement-breakpoint
CREATE TRIGGER resident_billing_origins_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON resident_billing_origins
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
--> statement-breakpoint
CREATE FUNCTION hsm_resident_billing_origin_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM resident_billing_executions e WHERE e.id=NEW.execution_id
      AND e.branch_id=NEW.branch_id AND e.stay_id=NEW.stay_id AND e.agreement_id=NEW.agreement_id
      AND e.charge_id=NEW.charge_id AND e.invoice_id=NEW.invoice_id AND e.outcome='posted'
  ) THEN
    RAISE EXCEPTION 'Scheduled origin completion proof missing' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_billing_origin_completion AFTER INSERT ON resident_billing_origins
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_origin_completion();
--> statement-breakpoint
CREATE FUNCTION hsm_resident_financial_origin_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='resident_charges' THEN
    IF (NEW.posted_by_user_id IS NULL) <> EXISTS (
      SELECT 1 FROM resident_billing_origins o WHERE o.charge_id=NEW.id
        AND o.branch_id=NEW.branch_id AND o.stay_id=NEW.stay_id AND o.agreement_id=NEW.agreement_id
    ) THEN
      RAISE EXCEPTION 'Charge requires exactly one human or scheduled origin' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (NEW.issued_by_user_id IS NULL) <> EXISTS (
      SELECT 1 FROM resident_billing_origins o WHERE o.invoice_id=NEW.id
        AND o.branch_id=NEW.branch_id AND o.stay_id=NEW.stay_id
    ) THEN
      RAISE EXCEPTION 'Invoice requires exactly one human or scheduled origin' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_charge_origin_check AFTER INSERT OR UPDATE ON resident_charges
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_financial_origin_check();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_invoice_origin_check AFTER INSERT OR UPDATE ON resident_invoices
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_financial_origin_check();
