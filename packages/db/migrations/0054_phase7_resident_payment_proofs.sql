CREATE TABLE "resident_payment_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "external_payment_method_enum" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"state" "booking_proof_state_enum" DEFAULT 'submitted' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resident_payment_proofs_amount_check" CHECK ("resident_payment_proofs"."amount_paisa" between 1 and 9007199254740991),
	CONSTRAINT "resident_payment_proofs_review_check" CHECK (("resident_payment_proofs"."state" = 'submitted') = ("resident_payment_proofs"."reviewed_at" is null)
        and ("resident_payment_proofs"."reviewed_at" is null) = ("resident_payment_proofs"."reviewed_by_user_id" is null)
        and ("resident_payment_proofs"."state" = 'approved') = ("resident_payment_proofs"."payment_id" is not null)
        and ("resident_payment_proofs"."state" <> 'rejected' or length(btrim(coalesce("resident_payment_proofs"."review_reason", ''))) between 1 and 500)
        and ("resident_payment_proofs"."reference" is null or length(btrim("resident_payment_proofs"."reference")) between 1 and 120))
);
--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_branch_id_stay_id_invoice_id_resident_invoices_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","invoice_id") REFERENCES "public"."resident_invoices"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_payment_proofs" ADD CONSTRAINT "resident_payment_proofs_branch_id_stay_id_payment_id_resident_payments_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","payment_id") REFERENCES "public"."resident_payments"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resident_payment_proofs_open_uq" ON "resident_payment_proofs" USING btree ("invoice_id") WHERE "resident_payment_proofs"."state" = 'submitted';--> statement-breakpoint
CREATE UNIQUE INDEX "resident_payment_proofs_file_uq" ON "resident_payment_proofs" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resident_payment_proofs_payment_uq" ON "resident_payment_proofs" USING btree ("payment_id") WHERE "resident_payment_proofs"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX "resident_payment_proofs_queue_idx" ON "resident_payment_proofs" USING btree ("branch_id","state","id");--> statement-breakpoint
CREATE INDEX "resident_payment_proofs_stay_idx" ON "resident_payment_proofs" USING btree ("branch_id","stay_id","id");