-- RENT-004 / AUD-004: unused metadata remains protected before worker activation.
CREATE FUNCTION hsm_resident_billing_schedule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE audit hostel_audit_log%ROWTYPE; work notification_outbox%ROWTYPE;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Billing schedule history cannot be removed' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id,NEW.branch_id,NEW.stay_id,NEW.agreement_id,NEW.item,NEW.cadence,
        NEW.authorized_by_user_id,NEW.authorization_audit_id,NEW.created_at)
      IS DISTINCT FROM
       (OLD.id,OLD.branch_id,OLD.stay_id,OLD.agreement_id,OLD.item,OLD.cadence,
        OLD.authorized_by_user_id,OLD.authorization_audit_id,OLD.created_at)
      OR OLD.state IN ('exhausted','superseded','stopped')
      OR NEW.version::bigint <> OLD.version::bigint + 1
      OR NEW.period_index NOT BETWEEN OLD.period_index AND OLD.period_index + 1
      OR NEW.updated_at < OLD.updated_at THEN
      RAISE EXCEPTION 'Billing schedule transition mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.version <> 1 THEN
      RAISE EXCEPTION 'Initial billing schedule revision must be one' USING ERRCODE='23514';
    END IF;
    SELECT * INTO audit FROM hostel_audit_log WHERE id=NEW.authorization_audit_id;
    IF audit.id IS NULL OR audit.branch_id IS DISTINCT FROM NEW.branch_id
      OR audit.actor_user_id IS DISTINCT FROM NEW.authorized_by_user_id
      OR audit.actor_role NOT IN ('owner','manager')
      OR audit.action <> 'billing.schedule.authorized'
      OR audit.target_type <> 'resident_billing_schedule' OR audit.target_id <> NEW.id
      OR audit.after IS DISTINCT FROM jsonb_build_object('agreementId',NEW.agreement_id,
        'item',NEW.item,'cadence',NEW.cadence,'periodIndex',NEW.period_index) THEN
      RAISE EXCEPTION 'Billing schedule authorization mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.state = 'active' THEN
    SELECT * INTO work FROM notification_outbox WHERE id=NEW.current_job_id;
    IF work.id IS NULL OR work.channel <> 'internal' OR work.event_type <> 'resident.billing.period'
      OR work.recipient_user_id IS NOT NULL OR work.recipient_address IS NOT NULL
      OR work.status <> 'pending' OR work.lease_token IS NOT NULL
      OR work.next_attempt_at IS DISTINCT FROM NEW.next_run_at
      OR work.payload IS DISTINCT FROM jsonb_build_object('scheduleId',NEW.id,
        'version',NEW.version,'periodIndex',NEW.period_index)
      OR work.dedupe_key <> 'resident.billing:'||NEW.id||':v'||NEW.version||':p'||NEW.period_index THEN
      RAISE EXCEPTION 'Billing schedule work mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER resident_billing_schedule_guard BEFORE INSERT OR UPDATE OR DELETE ON resident_billing_schedules
FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_schedule_guard();
--> statement-breakpoint
CREATE TRIGGER resident_billing_schedule_truncate_guard BEFORE TRUNCATE ON resident_billing_schedules
FOR EACH STATEMENT EXECUTE FUNCTION hsm_resident_billing_schedule_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_resident_billing_execution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE schedule resident_billing_schedules%ROWTYPE; work notification_outbox%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Billing execution history is immutable' USING ERRCODE='23514';
  END IF;
  -- Canonical caller locks parents first; retain Stay -> schedule -> lease order even for direct inserts.
  PERFORM id FROM stays WHERE id=NEW.stay_id AND branch_id=NEW.branch_id FOR UPDATE;
  SELECT * INTO schedule FROM resident_billing_schedules WHERE id=NEW.schedule_id FOR UPDATE;
  SELECT * INTO work FROM notification_outbox WHERE id=NEW.job_id FOR UPDATE;
  IF work.id IS NULL OR work.channel <> 'internal' OR work.event_type <> 'resident.billing.period'
    OR work.recipient_user_id IS NOT NULL OR work.recipient_address IS NOT NULL
    OR work.payload IS DISTINCT FROM jsonb_build_object('scheduleId',NEW.schedule_id,
      'version',NEW.schedule_version,'periodIndex',NEW.period_index)
    OR work.dedupe_key <> 'resident.billing:'||NEW.schedule_id||':v'||NEW.schedule_version||':p'||NEW.period_index
    OR work.status <> 'pending' OR work.lease_token IS DISTINCT FROM NEW.lease_token
    OR work.lease_expires_at IS DISTINCT FROM NEW.lease_expires_at
    OR work.lease_expires_at <= clock_timestamp()
    OR NEW.executed_at < work.created_at OR NEW.executed_at > clock_timestamp()
    OR schedule.id IS NULL OR (schedule.branch_id,schedule.stay_id,schedule.agreement_id)
      IS DISTINCT FROM (NEW.branch_id,NEW.stay_id,NEW.agreement_id)
    OR NEW.schedule_version > schedule.version OR NEW.period_index > schedule.period_index THEN
    RAISE EXCEPTION 'Billing execution work or lease mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome = 'obsolete' THEN
    IF schedule.state = 'active' AND (schedule.version,schedule.period_index,schedule.current_job_id)
      IS NOT DISTINCT FROM (NEW.schedule_version,NEW.period_index,NEW.job_id) THEN
      RAISE EXCEPTION 'Current billing work is not obsolete' USING ERRCODE='23514';
    END IF;
  ELSIF schedule.state <> 'active' OR (schedule.version,schedule.period_index,schedule.current_job_id)
    IS DISTINCT FROM (NEW.schedule_version,NEW.period_index,NEW.job_id) THEN
    RAISE EXCEPTION 'Billing execution is not current' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome = 'posted' AND EXISTS (
    SELECT 1 FROM resident_charges c WHERE c.id=NEW.charge_id AND c.posted_by_user_id IS NOT NULL
  ) THEN
    -- Still human-only: a later additive provenance migration must enable actual system sources.
    RAISE EXCEPTION 'Human posting cannot impersonate scheduled execution' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome IN ('posted','existing') AND NOT EXISTS (
    SELECT 1 FROM resident_charges c JOIN resident_invoice_charges link ON link.charge_id=c.id
      JOIN resident_invoices invoice ON invoice.id=link.invoice_id
    WHERE c.id=NEW.charge_id AND invoice.id=NEW.invoice_id
      AND c.branch_id=NEW.branch_id AND c.stay_id=NEW.stay_id AND c.agreement_id=NEW.agreement_id
      AND c.source_key=NEW.source_key AND c.amount_paisa=NEW.amount_paisa
      AND c.period_start IS NOT DISTINCT FROM NEW.period_start AND c.period_end IS NOT DISTINCT FROM NEW.period_end
      AND invoice.branch_id=NEW.branch_id AND invoice.stay_id=NEW.stay_id
      AND invoice.due_date=NEW.due_date AND invoice.state='issued'
  ) THEN
    RAISE EXCEPTION 'Billing execution result source mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER resident_billing_execution_guard BEFORE INSERT OR UPDATE OR DELETE ON resident_billing_executions
FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_execution_guard();
--> statement-breakpoint
CREATE TRIGGER resident_billing_execution_truncate_guard BEFORE TRUNCATE ON resident_billing_executions
FOR EACH STATEMENT EXECUTE FUNCTION hsm_resident_billing_execution_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_resident_billing_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE work notification_outbox%ROWTYPE; schedule resident_billing_schedules%ROWTYPE;
BEGIN
  SELECT * INTO work FROM notification_outbox WHERE id=NEW.job_id;
  SELECT * INTO schedule FROM resident_billing_schedules WHERE id=NEW.schedule_id;
  IF work.channel <> 'internal' OR work.event_type <> 'resident.billing.period'
    OR work.recipient_user_id IS NOT NULL OR work.recipient_address IS NOT NULL
    OR work.payload IS DISTINCT FROM jsonb_build_object('scheduleId',NEW.schedule_id,
      'version',NEW.schedule_version,'periodIndex',NEW.period_index)
    OR work.dedupe_key <> 'resident.billing:'||NEW.schedule_id||':v'||NEW.schedule_version||':p'||NEW.period_index
    OR NEW.lease_expires_at <= clock_timestamp() OR work.status <> 'sent' OR work.lease_token IS NOT NULL OR work.lease_expires_at IS NOT NULL
    OR work.sent_at IS NULL OR work.sent_at < NEW.executed_at OR work.sent_at >= NEW.lease_expires_at
    OR NOT EXISTS (
      SELECT 1 FROM hostel_audit_log a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id
      WHERE a.branch_id=NEW.branch_id AND a.actor_user_id IS NULL AND a.actor_role='system'
        AND a.action='billing.execution.completed' AND a.target_type='resident_billing_execution'
        AND a.target_id=NEW.id AND a.after=jsonb_build_object('scheduleId',NEW.schedule_id,
          'agreementId',NEW.agreement_id,'jobId',NEW.job_id,'outcome',NEW.outcome)
    ) THEN
    RAISE EXCEPTION 'Billing execution completion proof missing' USING ERRCODE='23514';
  END IF;
  IF NEW.outcome <> 'obsolete' THEN
    IF schedule.version::bigint <> NEW.schedule_version::bigint + 1
      OR schedule.period_index <> NEW.period_index + (CASE WHEN NEW.outcome IN ('posted','existing','no_charge') THEN 1 ELSE 0 END)
      OR (NEW.outcome = 'manual_required' AND schedule.state <> 'manual_required')
      OR (NEW.outcome = 'no_period' AND schedule.state <> 'exhausted')
      OR (NEW.outcome IN ('posted','existing','no_charge') AND schedule.state NOT IN ('active','exhausted')) THEN
      RAISE EXCEPTION 'Billing execution schedule advance missing' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_billing_completion_guard AFTER INSERT ON resident_billing_executions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_completion_guard();
--> statement-breakpoint
-- RENT-004 / AUD-004: schedule progress must also point back to its actual completion.
CREATE FUNCTION hsm_resident_billing_progress_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE execution resident_billing_executions%ROWTYPE;
BEGIN
  SELECT * INTO execution FROM resident_billing_executions
    WHERE schedule_id=OLD.id AND schedule_version=OLD.version AND period_index=OLD.period_index
      AND job_id=OLD.current_job_id AND branch_id=OLD.branch_id AND stay_id=OLD.stay_id
      AND agreement_id=OLD.agreement_id AND outcome <> 'obsolete';
  IF execution.id IS NOT NULL THEN
    IF NEW.period_index <> OLD.period_index + (CASE WHEN execution.outcome IN ('posted','existing','no_charge') THEN 1 ELSE 0 END)
      OR (execution.outcome IN ('posted','existing','no_charge') AND NEW.state NOT IN ('active','exhausted'))
      OR (execution.outcome = 'manual_required' AND NEW.state <> 'manual_required')
      OR (execution.outcome = 'no_period' AND NEW.state <> 'exhausted') THEN
      RAISE EXCEPTION 'Billing schedule completion mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.period_index <> OLD.period_index OR
      NOT ((OLD.state='active' AND NEW.state IN ('stopped','superseded')) OR
        (OLD.state='manual_required' AND NEW.state IN ('active','stopped','superseded'))) OR
      NOT EXISTS (
        SELECT 1 FROM hostel_audit_log a WHERE a.branch_id=NEW.branch_id
          AND a.actor_user_id IS NOT NULL AND a.actor_role IN ('owner','manager')
          AND a.action='billing.schedule.changed' AND a.target_type='resident_billing_schedule'
          AND a.target_id=NEW.id
          AND a.before=jsonb_build_object('version',OLD.version,'state',OLD.state,
            'periodIndex',OLD.period_index,'currentJobId',OLD.current_job_id)
          AND a.after=jsonb_build_object('version',NEW.version,'state',NEW.state,
            'periodIndex',NEW.period_index,'currentJobId',NEW.current_job_id)
      ) THEN
      RAISE EXCEPTION 'Billing schedule progress proof missing' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER resident_billing_progress_guard AFTER UPDATE ON resident_billing_schedules
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_resident_billing_progress_guard();
