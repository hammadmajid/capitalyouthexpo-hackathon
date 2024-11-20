-- AUD-004 / FIN-002: strengthen exact authorized item binding; retain all completion proof.
CREATE OR REPLACE FUNCTION hsm_resident_billing_origin_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM resident_billing_executions e WHERE e.id=NEW.execution_id
      AND e.branch_id=NEW.branch_id AND e.stay_id=NEW.stay_id AND e.agreement_id=NEW.agreement_id
      AND e.charge_id=NEW.charge_id AND e.invoice_id=NEW.invoice_id AND e.outcome='posted'
  ) THEN
    RAISE EXCEPTION 'Scheduled origin completion proof missing' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM resident_billing_executions e
      JOIN resident_billing_schedules s ON s.id=e.schedule_id AND s.branch_id=e.branch_id
        AND s.stay_id=e.stay_id AND s.agreement_id=e.agreement_id
      JOIN resident_charges c ON c.id=e.charge_id AND c.branch_id=e.branch_id
        AND c.stay_id=e.stay_id AND c.agreement_id=e.agreement_id
    WHERE e.id=NEW.execution_id AND c.kind::text=s.item::text
  ) THEN
    RAISE EXCEPTION 'Scheduled origin item mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
