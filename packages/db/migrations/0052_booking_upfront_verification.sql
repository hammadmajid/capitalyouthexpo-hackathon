CREATE TYPE "public"."booking_proof_state_enum" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "booking_payment_proofs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"method" "external_payment_method_enum" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"state" "booking_proof_state_enum" DEFAULT 'submitted' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_payment_proofs_amount_check" CHECK ("booking_payment_proofs"."amount_paisa" between 1 and 9007199254740991),
	CONSTRAINT "booking_payment_proofs_review_check" CHECK (("booking_payment_proofs"."state" = 'submitted') = ("booking_payment_proofs"."reviewed_at" is null)
        and ("booking_payment_proofs"."reviewed_at" is null) = ("booking_payment_proofs"."reviewed_by_user_id" is null)
        and ("booking_payment_proofs"."state" <> 'rejected' or length(btrim(coalesce("booking_payment_proofs"."review_reason", ''))) between 1 and 500)
        and ("booking_payment_proofs"."reference" is null or length(btrim("booking_payment_proofs"."reference")) between 1 and 120))
);
--> statement-breakpoint
CREATE TABLE "booking_upfront_terms" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"requirement" "upfront_enum" NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_upfront_terms_amount_check" CHECK ("booking_upfront_terms"."requirement" <> 'none' and "booking_upfront_terms"."amount_paisa" between 1 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "branch_payment_instructions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"method" "external_payment_method_enum" NOT NULL,
	"account_title" text NOT NULL,
	"account_identifier" text NOT NULL,
	"instructions" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "branch_payment_instructions_text_check" CHECK (length(btrim("branch_payment_instructions"."account_title")) between 1 and 120
        and length(btrim("branch_payment_instructions"."account_identifier")) between 1 and 80
        and ("branch_payment_instructions"."instructions" is null or length(btrim("branch_payment_instructions"."instructions")) between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "booking_payment_proofs" ADD CONSTRAINT "booking_payment_proofs_booking_id_booking_upfront_terms_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking_upfront_terms"("booking_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payment_proofs" ADD CONSTRAINT "booking_payment_proofs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payment_proofs" ADD CONSTRAINT "booking_payment_proofs_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payment_proofs" ADD CONSTRAINT "booking_payment_proofs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_payment_proofs" ADD CONSTRAINT "booking_payment_proofs_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_upfront_terms" ADD CONSTRAINT "booking_upfront_terms_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_upfront_terms" ADD CONSTRAINT "booking_upfront_terms_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_upfront_terms" ADD CONSTRAINT "booking_upfront_terms_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_upfront_terms" ADD CONSTRAINT "booking_upfront_terms_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_upfront_terms" ADD CONSTRAINT "booking_upfront_terms_customer_user_id_branch_id_booking_id_bookings_customer_user_id_branch_id_id_fk" FOREIGN KEY ("customer_user_id","branch_id","booking_id") REFERENCES "public"."bookings"("customer_user_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_payment_instructions" ADD CONSTRAINT "branch_payment_instructions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_payment_instructions" ADD CONSTRAINT "branch_payment_instructions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_proofs_open_uq" ON "booking_payment_proofs" USING btree ("booking_id") WHERE "booking_payment_proofs"."state" <> 'rejected';--> statement-breakpoint
CREATE UNIQUE INDEX "booking_payment_proofs_file_uq" ON "booking_payment_proofs" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "booking_payment_proofs_branch_state_idx" ON "booking_payment_proofs" USING btree ("branch_id","state");--> statement-breakpoint
CREATE INDEX "booking_upfront_terms_branch_idx" ON "booking_upfront_terms" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branch_payment_instructions_branch_idx" ON "branch_payment_instructions" USING btree ("branch_id","created_at") WHERE "branch_payment_instructions"."archived_at" is null;