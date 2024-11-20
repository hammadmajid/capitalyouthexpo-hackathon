CREATE TABLE "resident_payment_proof_invoices" (
	"proof_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	CONSTRAINT "resident_payment_proof_invoices_proof_id_invoice_id_pk" PRIMARY KEY("proof_id","invoice_id")
);
--> statement-breakpoint
ALTER TABLE "resident_payment_proof_invoices" ADD CONSTRAINT "resident_payment_proof_invoices_proof_id_resident_payment_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."resident_payment_proofs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proof_invoices" ADD CONSTRAINT "resident_payment_proof_invoices_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resident_payment_proof_invoices_invoice_idx" ON "resident_payment_proof_invoices" USING btree ("invoice_id");