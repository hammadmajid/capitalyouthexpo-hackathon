CREATE TABLE "resident_billing_origins" (
	"execution_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "resident_billing_origins_charge_uq" UNIQUE("charge_id"),
	CONSTRAINT "resident_billing_origins_invoice_uq" UNIQUE("invoice_id")
);
--> statement-breakpoint
ALTER TABLE "resident_billing_executions" ADD CONSTRAINT "resident_billing_executions_scope_uq" UNIQUE("branch_id","stay_id","agreement_id","id");
--> statement-breakpoint
ALTER TABLE "resident_billing_origins" ADD CONSTRAINT "resident_billing_origins_execution_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id","execution_id") REFERENCES "public"."resident_billing_executions"("branch_id","stay_id","agreement_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_origins" ADD CONSTRAINT "resident_billing_origins_charge_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id","charge_id") REFERENCES "public"."resident_charges"("branch_id","stay_id","agreement_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resident_billing_origins" ADD CONSTRAINT "resident_billing_origins_invoice_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "resident_billing_origins_scope_idx" ON "resident_billing_origins" USING btree ("branch_id","stay_id","agreement_id","execution_id");
