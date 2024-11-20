ALTER TABLE "resident_billing_origins" DROP CONSTRAINT "resident_billing_origins_invoice_uq";--> statement-breakpoint
ALTER TABLE "resident_billing_origins" DROP CONSTRAINT "resident_billing_origins_pkey";--> statement-breakpoint
ALTER TABLE "resident_billing_origins" ADD CONSTRAINT "resident_billing_origins_execution_id_charge_id_pk" PRIMARY KEY("execution_id","charge_id");--> statement-breakpoint
CREATE INDEX "resident_billing_origins_invoice_idx" ON "resident_billing_origins" USING btree ("invoice_id");
--> statement-breakpoint
-- CHG-061 / AUD-004: retain immutable per-charge execution proof for a two-line invoice.
CREATE OR REPLACE FUNCTION hsm_resident_billing_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM resident_charges c JOIN resident_invoices i ON i.id=NEW.invoice_id
      JOIN resident_invoice_charges link ON link.charge_id=c.id AND link.invoice_id=i.id
    WHERE c.id=NEW.charge_id AND c.branch_id=NEW.branch_id AND c.stay_id=NEW.stay_id
      AND c.agreement_id=NEW.agreement_id AND c.posted_by_user_id IS NULL
      AND i.branch_id=NEW.branch_id AND i.stay_id=NEW.stay_id AND i.issued_by_user_id IS NULL
      AND i.state='issued'
  ) THEN
    RAISE EXCEPTION 'Scheduled origin requires exact system financial sources' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hsm_resident_billing_origin_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM resident_billing_executions e
      JOIN resident_billing_schedules s ON s.id=e.schedule_id AND s.branch_id=e.branch_id
        AND s.stay_id=e.stay_id AND s.agreement_id=e.agreement_id
      JOIN resident_charges main ON main.id=e.charge_id AND main.branch_id=e.branch_id
        AND main.stay_id=e.stay_id AND main.agreement_id=e.agreement_id
      JOIN resident_invoice_charges main_link ON main_link.charge_id=main.id AND main_link.invoice_id=e.invoice_id
      JOIN resident_charges c ON c.id=NEW.charge_id AND c.branch_id=e.branch_id
        AND c.stay_id=e.stay_id AND c.agreement_id=e.agreement_id
      JOIN resident_invoices i ON i.id=e.invoice_id AND i.branch_id=e.branch_id AND i.stay_id=e.stay_id
    WHERE e.id=NEW.execution_id AND e.branch_id=NEW.branch_id AND e.stay_id=NEW.stay_id
      AND e.agreement_id=NEW.agreement_id AND e.invoice_id=NEW.invoice_id AND e.outcome='posted'
      AND main.kind::text=s.item::text AND main.source_key=e.source_key AND main.amount_paisa=e.amount_paisa
      AND main.period_start IS NOT DISTINCT FROM e.period_start AND main.period_end IS NOT DISTINCT FROM e.period_end
      AND i.due_date=e.due_date
      AND i.total_paisa=(SELECT sum(line.amount_paisa) FROM resident_invoice_charges link
        JOIN resident_charges line ON line.id=link.charge_id WHERE link.invoice_id=i.id)
      AND (c.id=main.id OR (
        main.kind IN ('rent','transport') AND c.kind IN ('rent','transport') AND c.kind<>main.kind
        AND c.period_start=main.period_start AND c.period_end=main.period_end
        AND (SELECT count(*) FROM resident_invoice_charges link WHERE link.invoice_id=i.id)=2
        AND EXISTS (SELECT 1 FROM resident_billing_schedules companion
          WHERE companion.branch_id=e.branch_id AND companion.stay_id=e.stay_id
            AND companion.agreement_id=e.agreement_id AND companion.item::text=c.kind::text
            AND companion.cadence='periodic' AND companion.state IN ('active','exhausted'))
        AND EXISTS (SELECT 1 FROM transport_subscriptions sub
          WHERE sub.branch_id=e.branch_id AND sub.stay_id=e.stay_id AND sub.status IN ('active','ended')
            AND sub.effective_from<c.period_end AND (sub.effective_to IS NULL OR sub.effective_to>c.period_start))
      ))
  ) THEN
    RAISE EXCEPTION 'Scheduled origin completion proof or authorized item missing' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
