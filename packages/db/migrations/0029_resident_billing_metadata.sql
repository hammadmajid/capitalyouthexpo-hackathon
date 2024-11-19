CREATE TYPE "public"."resident_billing_cadence" AS ENUM('periodic', 'one_time');
--> statement-breakpoint
CREATE TYPE "public"."resident_billing_item" AS ENUM('rent', 'mess', 'utilities', 'admission');
--> statement-breakpoint
CREATE TYPE "public"."resident_billing_schedule_state" AS ENUM('active', 'manual_required', 'exhausted', 'superseded', 'stopped');
--> statement-breakpoint
CREATE TYPE "public"."resident_billing_outcome" AS ENUM('posted', 'existing', 'no_charge', 'no_period', 'manual_required', 'obsolete');
--> statement-breakpoint
CREATE TABLE "resident_billing_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"item" "resident_billing_item" NOT NULL,
	"cadence" "resident_billing_cadence" NOT NULL,
	"state" "resident_billing_schedule_state" NOT NULL,
	"authorized_by_user_id" uuid NOT NULL,
	"authorization_audit_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"period_index" bigint NOT NULL,
	"next_run_at" timestamp with time zone,
	"current_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_billing_schedules_scope_uq" UNIQUE("branch_id","stay_id","agreement_id","id"),
	CONSTRAINT "resident_billing_schedules_item_uq" UNIQUE("agreement_id","item","cadence"),
	CONSTRAINT "resident_billing_schedules_version_check" CHECK ("resident_billing_schedules"."version" > 0),
	CONSTRAINT "resident_billing_schedules_cursor_check" CHECK ("resident_billing_schedules"."period_index" between 0 and 9007199254740991),
	CONSTRAINT "resident_billing_schedules_rent_cadence_check" CHECK ("resident_billing_schedules"."item" <> 'rent' or "resident_billing_schedules"."cadence" = 'periodic'),
	CONSTRAINT "resident_billing_schedules_work_check" CHECK (("resident_billing_schedules"."state" = 'active' and "resident_billing_schedules"."next_run_at" is not null and "resident_billing_schedules"."current_job_id" is not null) or ("resident_billing_schedules"."state" <> 'active' and "resident_billing_schedules"."next_run_at" is null and "resident_billing_schedules"."current_job_id" is null))
);
--> statement-breakpoint
CREATE TABLE "resident_billing_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"schedule_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"lease_token" uuid NOT NULL,
	"lease_expires_at" timestamp with time zone NOT NULL,
	"schedule_version" integer NOT NULL,
	"period_index" bigint NOT NULL,
	"outcome" "resident_billing_outcome" NOT NULL,
	"source_key" text,
	"period_start" date,
	"period_end" date,
	"due_date" date,
	"amount_paisa" bigint,
	"charge_id" uuid,
	"invoice_id" uuid,
	"executed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "resident_billing_executions_job_uq" UNIQUE("job_id"),
	CONSTRAINT "resident_billing_executions_revision_uq" UNIQUE("schedule_id","schedule_version"),
	CONSTRAINT "resident_billing_executions_revision_check" CHECK ("resident_billing_executions"."schedule_version" > 0 and "resident_billing_executions"."period_index" between 0 and 9007199254740991),
	CONSTRAINT "resident_billing_executions_amount_check" CHECK ("resident_billing_executions"."amount_paisa" is null or "resident_billing_executions"."amount_paisa" between 0 and 9007199254740991),
	CONSTRAINT "resident_billing_executions_source_check" CHECK ("resident_billing_executions"."source_key" is null or length(btrim("resident_billing_executions"."source_key")) between 1 and 240),
	CONSTRAINT "resident_billing_executions_dates_check" CHECK ((("resident_billing_executions"."period_start" is null and "resident_billing_executions"."period_end" is null) or ("resident_billing_executions"."period_start" is not null and "resident_billing_executions"."period_end" is not null and "resident_billing_executions"."period_start" >= date '0001-01-01' and "resident_billing_executions"."period_end" <= date '9999-12-31' and "resident_billing_executions"."period_start" < "resident_billing_executions"."period_end")) and ("resident_billing_executions"."due_date" is null or "resident_billing_executions"."due_date" between date '0001-01-01' and date '9999-12-31')),
	CONSTRAINT "resident_billing_executions_lease_check" CHECK ("resident_billing_executions"."executed_at" < "resident_billing_executions"."lease_expires_at"),
	CONSTRAINT "resident_billing_executions_outcome_check" CHECK (case
    when "resident_billing_executions"."outcome" in ('posted', 'existing') then num_nonnulls("resident_billing_executions"."source_key", "resident_billing_executions"."due_date", "resident_billing_executions"."amount_paisa", "resident_billing_executions"."charge_id", "resident_billing_executions"."invoice_id") = 5 and "resident_billing_executions"."amount_paisa" > 0
    when "resident_billing_executions"."outcome" = 'no_charge' then "resident_billing_executions"."source_key" is not null and "resident_billing_executions"."due_date" is not null and "resident_billing_executions"."amount_paisa" = 0 and "resident_billing_executions"."charge_id" is null and "resident_billing_executions"."invoice_id" is null
    when "resident_billing_executions"."outcome" = 'manual_required' then "resident_billing_executions"."source_key" is not null and "resident_billing_executions"."due_date" is not null and num_nonnulls("resident_billing_executions"."amount_paisa", "resident_billing_executions"."charge_id", "resident_billing_executions"."invoice_id") = 0
    else num_nonnulls("resident_billing_executions"."source_key", "resident_billing_executions"."period_start", "resident_billing_executions"."period_end", "resident_billing_executions"."due_date", "resident_billing_executions"."amount_paisa", "resident_billing_executions"."charge_id", "resident_billing_executions"."invoice_id") = 0 end is true)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_audit_authorized_target_uq" ON "hostel_audit_log" USING btree ("branch_id","id","actor_user_id","target_id");
--> statement-breakpoint
ALTER TABLE "resident_charges" ADD CONSTRAINT "resident_charges_agreement_scope_uq" UNIQUE("branch_id","stay_id","agreement_id","id");
--> statement-breakpoint
ALTER TABLE "resident_billing_schedules" ADD CONSTRAINT "resident_billing_schedules_current_job_id_notification_outbox_id_fk" FOREIGN KEY ("current_job_id") REFERENCES "public"."notification_outbox"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_schedules" ADD CONSTRAINT "resident_billing_schedules_branch_id_stay_id_agreement_id_stay_agreements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id") REFERENCES "public"."stay_agreements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_schedules" ADD CONSTRAINT "resident_billing_schedules_branch_id_authorization_audit_id_authorized_by_user_id_id_hostel_audit_log_branch_id_id_actor_user_id_target_id_fk" FOREIGN KEY ("branch_id","authorization_audit_id","authorized_by_user_id","id") REFERENCES "public"."hostel_audit_log"("branch_id","id","actor_user_id","target_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_executions" ADD CONSTRAINT "resident_billing_executions_job_id_notification_outbox_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."notification_outbox"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_executions" ADD CONSTRAINT "resident_billing_executions_branch_id_stay_id_agreement_id_schedule_id_resident_billing_schedules_branch_id_stay_id_agreement_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id","schedule_id") REFERENCES "public"."resident_billing_schedules"("branch_id","stay_id","agreement_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_executions" ADD CONSTRAINT "resident_billing_executions_branch_id_stay_id_agreement_id_charge_id_resident_charges_branch_id_stay_id_agreement_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id","charge_id") REFERENCES "public"."resident_charges"("branch_id","stay_id","agreement_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_executions" ADD CONSTRAINT "resident_billing_executions_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "resident_billing_schedules_live_item_uq" ON "resident_billing_schedules" USING btree ("stay_id","item","cadence") WHERE "resident_billing_schedules"."state" in ('active', 'manual_required');
--> statement-breakpoint
CREATE INDEX "resident_billing_schedules_job_idx" ON "resident_billing_schedules" USING btree ("current_job_id");
--> statement-breakpoint
CREATE INDEX "resident_billing_schedules_authorizer_idx" ON "resident_billing_schedules" USING btree ("authorized_by_user_id");
--> statement-breakpoint
CREATE INDEX "resident_billing_schedules_audit_idx" ON "resident_billing_schedules" USING btree ("authorization_audit_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "resident_billing_executions_period_uq" ON "resident_billing_executions" USING btree ("schedule_id","period_index") WHERE "resident_billing_executions"."outcome" in ('posted', 'existing', 'no_charge');
--> statement-breakpoint
CREATE INDEX "resident_billing_executions_scope_idx" ON "resident_billing_executions" USING btree ("branch_id","stay_id","agreement_id","schedule_id");
--> statement-breakpoint
CREATE INDEX "resident_billing_executions_charge_idx" ON "resident_billing_executions" USING btree ("charge_id");
--> statement-breakpoint
CREATE INDEX "resident_billing_executions_invoice_idx" ON "resident_billing_executions" USING btree ("invoice_id");
