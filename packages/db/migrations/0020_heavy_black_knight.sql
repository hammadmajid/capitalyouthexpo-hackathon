CREATE TYPE "public"."external_payment_method_enum" AS ENUM('cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_document_state_enum" AS ENUM('issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."resident_adjustment_kind_enum" AS ENUM('correction', 'discount', 'waiver', 'agreement_amendment');--> statement-breakpoint
CREATE TYPE "public"."resident_charge_kind_enum" AS ENUM('rent', 'mess', 'utilities', 'admission', 'custom', 'late_fee');--> statement-breakpoint
CREATE TYPE "public"."resident_fund_movement_kind_enum" AS ENUM('deposit_apply', 'deposit_deduct', 'deposit_refund', 'advance_apply', 'advance_refund');--> statement-breakpoint
CREATE TYPE "public"."resident_ledger_account_enum" AS ENUM('receivable', 'deposit', 'advance');--> statement-breakpoint
CREATE TYPE "public"."resident_ledger_side_enum" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."finance_check_kind_enum" AS ENUM('charge', 'adjustment', 'invoice', 'payment', 'movement', 'reversal', 'funding');--> statement-breakpoint
CREATE TABLE "resident_charge_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"agreement_id" uuid,
	"kind" "resident_adjustment_kind_enum" NOT NULL,
	"source_key" text NOT NULL,
	"side" "resident_ledger_side_enum" NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"reason" text NOT NULL,
	"posted_by_user_id" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_charge_adjustments_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_charge_adjustments_source_uq" UNIQUE("stay_id","source_key"),
	CONSTRAINT "resident_charge_adjustments_agreement_check" CHECK ("resident_charge_adjustments"."kind" <> 'agreement_amendment' or "resident_charge_adjustments"."agreement_id" is not null),
	CONSTRAINT "resident_charge_adjustments_amount_check" CHECK ("resident_charge_adjustments"."amount_paisa" > 0),
	CONSTRAINT "resident_charge_adjustments_reason_check" CHECK (length(btrim("resident_charge_adjustments"."reason")) between 1 and 500),
	CONSTRAINT "resident_charge_adjustments_source_check" CHECK (length(btrim("resident_charge_adjustments"."source_key")) between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "resident_charge_catalog" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "resident_charge_catalog_scope_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "resident_charge_catalog_code_uq" UNIQUE("branch_id","code"),
	CONSTRAINT "resident_charge_catalog_code_check" CHECK ("resident_charge_catalog"."code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "resident_charge_catalog_name_check" CHECK (length(btrim("resident_charge_catalog"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "resident_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"catalog_id" uuid,
	"kind" "resident_charge_kind_enum" NOT NULL,
	"source_key" text NOT NULL,
	"description_snapshot" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"period_start" date,
	"period_end" date,
	"posted_by_user_id" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_charges_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_charges_source_uq" UNIQUE("stay_id","source_key"),
	CONSTRAINT "resident_charges_catalog_check" CHECK (("resident_charges"."kind" = 'custom') = ("resident_charges"."catalog_id" is not null)),
	CONSTRAINT "resident_charges_amount_check" CHECK ("resident_charges"."amount_paisa" > 0),
	CONSTRAINT "resident_charges_description_check" CHECK (length(btrim("resident_charges"."description_snapshot")) between 1 and 240),
	CONSTRAINT "resident_charges_source_check" CHECK (length(btrim("resident_charges"."source_key")) between 1 and 240),
	CONSTRAINT "resident_charges_period_check" CHECK (("resident_charges"."period_start" is null and "resident_charges"."period_end" is null) or ("resident_charges"."period_start" is not null and "resident_charges"."period_end" is not null and "resident_charges"."period_start" < "resident_charges"."period_end"))
);
--> statement-breakpoint
CREATE TABLE "resident_invoice_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	CONSTRAINT "resident_invoice_charges_charge_uq" UNIQUE("charge_id")
);
--> statement-breakpoint
CREATE TABLE "resident_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"number" text NOT NULL,
	"total_paisa" bigint NOT NULL,
	"due_date" date NOT NULL,
	"state" "invoice_document_state_enum" NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	CONSTRAINT "resident_invoices_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_invoices_number_uq" UNIQUE("branch_id","number"),
	CONSTRAINT "resident_invoices_number_check" CHECK (length("resident_invoices"."number") between 1 and 64),
	CONSTRAINT "resident_invoices_total_check" CHECK ("resident_invoices"."total_paisa" >= 0),
	CONSTRAINT "resident_invoices_void_check" CHECK (("resident_invoices"."state" = 'issued' and num_nonnulls("resident_invoices"."voided_at","resident_invoices"."voided_by_user_id","resident_invoices"."void_reason") = 0) or ("resident_invoices"."state" = 'voided' and num_nonnulls("resident_invoices"."voided_at","resident_invoices"."voided_by_user_id","resident_invoices"."void_reason") = 3 and length(btrim("resident_invoices"."void_reason")) between 1 and 500 and "resident_invoices"."voided_at" >= "resident_invoices"."issued_at"))
);
--> statement-breakpoint
CREATE TABLE "resident_payment_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_payment_reversals_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_payment_reversals_payment_uq" UNIQUE("payment_id"),
	CONSTRAINT "resident_payment_reversals_reason_check" CHECK (length(btrim("resident_payment_reversals"."reason")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "resident_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "external_payment_method_enum" NOT NULL,
	"transaction_reference" text,
	"proof_file_id" uuid,
	"paid_on" date NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "resident_payments_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_payments_source_uq" UNIQUE("stay_id","source_key"),
	CONSTRAINT "resident_payments_proof_uq" UNIQUE("proof_file_id"),
	CONSTRAINT "resident_payments_amount_check" CHECK ("resident_payments"."amount_paisa" > 0),
	CONSTRAINT "resident_payments_source_check" CHECK (length(btrim("resident_payments"."source_key")) between 1 and 240),
	CONSTRAINT "resident_payments_note_check" CHECK (length(btrim("resident_payments"."note")) between 1 and 500),
	CONSTRAINT "resident_payments_reference_check" CHECK ("resident_payments"."transaction_reference" is null or length(btrim("resident_payments"."transaction_reference")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "resident_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"number" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_receipts_payment_uq" UNIQUE("payment_id"),
	CONSTRAINT "resident_receipts_number_uq" UNIQUE("branch_id","number"),
	CONSTRAINT "resident_receipts_number_check" CHECK (length("resident_receipts"."number") between 1 and 64),
	CONSTRAINT "resident_receipts_snapshot_check" CHECK (jsonb_typeof("resident_receipts"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "resident_fund_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid,
	"kind" "resident_fund_movement_kind_enum" NOT NULL,
	"source_key" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"reason" text NOT NULL,
	"external_reference" text,
	"posted_by_user_id" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_fund_movements_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "resident_fund_movements_source_uq" UNIQUE("stay_id","source_key"),
	CONSTRAINT "resident_fund_movements_invoice_check" CHECK (("resident_fund_movements"."kind" in ('deposit_apply','advance_apply')) = ("resident_fund_movements"."invoice_id" is not null)),
	CONSTRAINT "resident_fund_movements_amount_check" CHECK ("resident_fund_movements"."amount_paisa" > 0),
	CONSTRAINT "resident_fund_movements_reason_check" CHECK (length(btrim("resident_fund_movements"."reason")) between 1 and 500),
	CONSTRAINT "resident_fund_movements_source_check" CHECK (length(btrim("resident_fund_movements"."source_key")) between 1 and 240),
	CONSTRAINT "resident_fund_movements_reference_check" CHECK ("resident_fund_movements"."external_reference" is null or length(btrim("resident_fund_movements"."external_reference")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "resident_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"account" "resident_ledger_account_enum" NOT NULL,
	"side" "resident_ledger_side_enum" NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"invoice_id" uuid,
	"charge_id" uuid,
	"adjustment_id" uuid,
	"payment_id" uuid,
	"fund_movement_id" uuid,
	"payment_reversal_id" uuid,
	"funding_payment_id" uuid,
	"reversed_entry_id" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_ledger_source_check" CHECK (num_nonnulls("resident_ledger"."charge_id","resident_ledger"."adjustment_id","resident_ledger"."payment_id","resident_ledger"."fund_movement_id","resident_ledger"."payment_reversal_id") = 1),
	CONSTRAINT "resident_ledger_amount_check" CHECK ("resident_ledger"."amount_paisa" > 0),
	CONSTRAINT "resident_ledger_funding_check" CHECK ((("resident_ledger"."payment_id" is not null or "resident_ledger"."fund_movement_id" is not null or "resident_ledger"."payment_reversal_id" is not null) = ("resident_ledger"."funding_payment_id" is not null)) and ("resident_ledger"."payment_id" is null or "resident_ledger"."payment_id" = "resident_ledger"."funding_payment_id")),
	CONSTRAINT "resident_ledger_reversal_check" CHECK (("resident_ledger"."payment_reversal_id" is not null) = ("resident_ledger"."reversed_entry_id" is not null) and ("resident_ledger"."reversed_entry_id" is null or "resident_ledger"."reversed_entry_id" <> "resident_ledger"."id")),
	CONSTRAINT "resident_ledger_invoice_account_check" CHECK ("resident_ledger"."invoice_id" is null or "resident_ledger"."account" = 'receivable')
);
--> statement-breakpoint
CREATE TABLE "resident_finance_checks" (
	"transaction_id" bigint DEFAULT txid_current() NOT NULL,
	"kind" "finance_check_kind_enum" NOT NULL,
	"subject_id" uuid NOT NULL,
	CONSTRAINT "resident_finance_checks_transaction_id_kind_subject_id_pk" PRIMARY KEY("transaction_id","kind","subject_id")
);
--> statement-breakpoint
ALTER TABLE "resident_charge_adjustments" ADD CONSTRAINT "resident_charge_adjustments_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charge_adjustments" ADD CONSTRAINT "resident_charge_adjustments_branch_id_stay_id_charge_id_resident_charges_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","charge_id") REFERENCES "public"."resident_charges"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charge_adjustments" ADD CONSTRAINT "resident_charge_adjustments_branch_id_stay_id_agreement_id_stay_agreements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id") REFERENCES "public"."stay_agreements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charge_catalog" ADD CONSTRAINT "resident_charge_catalog_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charge_catalog" ADD CONSTRAINT "resident_charge_catalog_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charges" ADD CONSTRAINT "resident_charges_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charges" ADD CONSTRAINT "resident_charges_branch_id_stay_id_agreement_id_stay_agreements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id") REFERENCES "public"."stay_agreements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_charges" ADD CONSTRAINT "resident_charges_branch_id_catalog_id_resident_charge_catalog_branch_id_id_fk" FOREIGN KEY ("branch_id","catalog_id") REFERENCES "public"."resident_charge_catalog"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_charges" ADD CONSTRAINT "resident_invoice_charges_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoice_charges" ADD CONSTRAINT "resident_invoice_charges_branch_id_stay_id_charge_id_resident_charges_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","charge_id") REFERENCES "public"."resident_charges"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoices" ADD CONSTRAINT "resident_invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoices" ADD CONSTRAINT "resident_invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_invoices" ADD CONSTRAINT "resident_invoices_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_reversals" ADD CONSTRAINT "resident_payment_reversals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_reversals" ADD CONSTRAINT "resident_payment_reversals_branch_id_stay_id_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payments" ADD CONSTRAINT "resident_payments_proof_file_id_files_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payments" ADD CONSTRAINT "resident_payments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payments" ADD CONSTRAINT "resident_payments_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_receipts" ADD CONSTRAINT "resident_receipts_branch_id_stay_id_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_fund_movements" ADD CONSTRAINT "resident_fund_movements_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_fund_movements" ADD CONSTRAINT "resident_fund_movements_branch_id_stay_id_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_fund_movements" ADD CONSTRAINT "resident_fund_movements_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_reversed_entry_id_resident_ledger_id_fk" FOREIGN KEY ("reversed_entry_id") REFERENCES "public"."resident_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_charge_id_resident_charges_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","charge_id") REFERENCES "public"."resident_charges"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_adjustment_id_resident_charge_adjustments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","adjustment_id") REFERENCES "public"."resident_charge_adjustments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_funding_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","funding_payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_fund_movement_id_resident_fund_movements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","fund_movement_id") REFERENCES "public"."resident_fund_movements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_payment_reversal_id_resident_payment_reversals_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_reversal_id") REFERENCES "public"."resident_payment_reversals"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_ledger" ADD CONSTRAINT "resident_ledger_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resident_charge_adjustments_page_idx" ON "resident_charge_adjustments" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_charges_page_idx" ON "resident_charges" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_invoice_charges_invoice_idx" ON "resident_invoice_charges" USING btree ("branch_id","stay_id","invoice_id");--> statement-breakpoint
CREATE INDEX "resident_invoices_page_idx" ON "resident_invoices" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_invoices_due_idx" ON "resident_invoices" USING btree ("branch_id","due_date","id");--> statement-breakpoint
CREATE INDEX "resident_payments_page_idx" ON "resident_payments" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_receipts_page_idx" ON "resident_receipts" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_fund_movements_page_idx" ON "resident_fund_movements" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_charge_uq" ON "resident_ledger" USING btree ("charge_id") WHERE "resident_ledger"."charge_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_adjustment_uq" ON "resident_ledger" USING btree ("adjustment_id") WHERE "resident_ledger"."adjustment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_payment_invoice_uq" ON "resident_ledger" USING btree ("payment_id","invoice_id") WHERE "resident_ledger"."payment_id" is not null and "resident_ledger"."account" = 'receivable';--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_payment_fund_uq" ON "resident_ledger" USING btree ("payment_id","account") WHERE "resident_ledger"."payment_id" is not null and "resident_ledger"."account" <> 'receivable';--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_movement_account_uq" ON "resident_ledger" USING btree ("fund_movement_id","account") WHERE "resident_ledger"."fund_movement_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_ledger_reversed_entry_uq" ON "resident_ledger" USING btree ("reversed_entry_id") WHERE "resident_ledger"."reversed_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "resident_ledger_page_idx" ON "resident_ledger" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "resident_ledger_funding_idx" ON "resident_ledger" USING btree ("branch_id","stay_id","funding_payment_id","account");--> statement-breakpoint
CREATE INDEX "resident_ledger_invoice_idx" ON "resident_ledger" USING btree ("branch_id","stay_id","invoice_id");