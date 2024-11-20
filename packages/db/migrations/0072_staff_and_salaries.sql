CREATE TYPE "public"."staff_job_title_enum" AS ENUM('receptionist', 'security_guard', 'cleaner', 'cook', 'maintenance', 'supervisor', 'other');--> statement-breakpoint
CREATE TYPE "public"."staff_payment_kind_enum" AS ENUM('payment', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."staff_payment_method_enum" AS ENUM('cash', 'bank_transfer', 'mobile_wallet', 'other');--> statement-breakpoint
CREATE TYPE "public"."staff_status_enum" AS ENUM('active', 'inactive', 'ended');--> statement-breakpoint
ALTER TYPE "public"."file_purpose_enum" ADD VALUE 'staff_agreement';--> statement-breakpoint
CREATE TABLE "staff_agreements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"effective_on" date NOT NULL,
	"terms_id" uuid,
	"file_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_agreements_version_uq" UNIQUE("staff_id","version"),
	CONSTRAINT "staff_agreements_title_check" CHECK (length(btrim("staff_agreements"."title")) between 2 and 120),
	CONSTRAINT "staff_agreements_body_check" CHECK (length(btrim("staff_agreements"."body")) between 1 and 5000),
	CONSTRAINT "staff_agreements_version_check" CHECK ("staff_agreements"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"job_title" "staff_job_title_enum" NOT NULL,
	"custom_title" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" "staff_status_enum" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_members_branch_uq" UNIQUE("id","branch_id"),
	CONSTRAINT "staff_members_name_check" CHECK (length(btrim("staff_members"."full_name")) between 2 and 120),
	CONSTRAINT "staff_members_phone_check" CHECK ("staff_members"."phone" is null or "staff_members"."phone" ~ '^\+92[0-9]{10}$'),
	CONSTRAINT "staff_members_title_check" CHECK (("staff_members"."job_title" = 'other') = ("staff_members"."custom_title" is not null) and ("staff_members"."custom_title" is null or length(btrim("staff_members"."custom_title")) between 2 and 60)),
	CONSTRAINT "staff_members_dates_check" CHECK ("staff_members"."ends_on" is null or "staff_members"."ends_on" >= "staff_members"."starts_on"),
	CONSTRAINT "staff_members_version_check" CHECK ("staff_members"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_salaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"terms_id" uuid NOT NULL,
	"month" date NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"due_on" date NOT NULL,
	"explicit_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_salaries_month_uq" UNIQUE("staff_id","month"),
	CONSTRAINT "staff_salaries_branch_uq" UNIQUE("id","branch_id","staff_id"),
	CONSTRAINT "staff_salaries_amount_check" CHECK ("staff_salaries"."amount_paisa" >= 0),
	CONSTRAINT "staff_salaries_month_check" CHECK (extract(day from "staff_salaries"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "staff_salary_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salary_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"kind" "staff_payment_kind_enum" DEFAULT 'payment' NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" "staff_payment_method_enum" NOT NULL,
	"reference" text,
	"note" text,
	"reverses_payment_id" uuid,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_salary_payments_reversal_uq" UNIQUE("reverses_payment_id"),
	CONSTRAINT "staff_salary_payments_amount_check" CHECK ("staff_salary_payments"."amount_paisa" > 0),
	CONSTRAINT "staff_salary_payments_kind_check" CHECK (("staff_salary_payments"."kind" = 'reversal') = ("staff_salary_payments"."reverses_payment_id" is not null)),
	CONSTRAINT "staff_salary_payments_text_check" CHECK (("staff_salary_payments"."reference" is null or length("staff_salary_payments"."reference") <= 80) and ("staff_salary_payments"."note" is null or length("staff_salary_payments"."note") <= 300))
);
--> statement-breakpoint
CREATE TABLE "staff_salary_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"due_day" smallint NOT NULL,
	"effective_from" date NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_salary_terms_version_uq" UNIQUE("staff_id","version"),
	CONSTRAINT "staff_salary_terms_month_uq" UNIQUE("staff_id","effective_from"),
	CONSTRAINT "staff_salary_terms_amount_check" CHECK ("staff_salary_terms"."amount_paisa" > 0),
	CONSTRAINT "staff_salary_terms_due_day_check" CHECK ("staff_salary_terms"."due_day" between 1 and 28),
	CONSTRAINT "staff_salary_terms_month_check" CHECK (extract(day from "staff_salary_terms"."effective_from") = 1),
	CONSTRAINT "staff_salary_terms_version_check" CHECK ("staff_salary_terms"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "manager_inventory_grants" DROP CONSTRAINT "manager_inventory_grants_permission_check";--> statement-breakpoint
ALTER TABLE "staff_agreements" ADD CONSTRAINT "staff_agreements_terms_id_staff_salary_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."staff_salary_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_agreements" ADD CONSTRAINT "staff_agreements_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_agreements" ADD CONSTRAINT "staff_agreements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_agreements" ADD CONSTRAINT "staff_agreements_staff_id_branch_id_staff_members_id_branch_id_fk" FOREIGN KEY ("staff_id","branch_id") REFERENCES "public"."staff_members"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_terms_id_staff_salary_terms_id_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."staff_salary_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_explicit_by_user_id_users_id_fk" FOREIGN KEY ("explicit_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salaries" ADD CONSTRAINT "staff_salaries_staff_id_branch_id_staff_members_id_branch_id_fk" FOREIGN KEY ("staff_id","branch_id") REFERENCES "public"."staff_members"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_payments" ADD CONSTRAINT "staff_salary_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_payments" ADD CONSTRAINT "staff_salary_payments_salary_id_branch_id_staff_id_staff_salaries_id_branch_id_staff_id_fk" FOREIGN KEY ("salary_id","branch_id","staff_id") REFERENCES "public"."staff_salaries"("id","branch_id","staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_payments" ADD CONSTRAINT "staff_salary_payments_reverses_payment_id_staff_salary_payments_id_fk" FOREIGN KEY ("reverses_payment_id") REFERENCES "public"."staff_salary_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_terms" ADD CONSTRAINT "staff_salary_terms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_salary_terms" ADD CONSTRAINT "staff_salary_terms_staff_id_branch_id_staff_members_id_branch_id_fk" FOREIGN KEY ("staff_id","branch_id") REFERENCES "public"."staff_members"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_agreements_terms_idx" ON "staff_agreements" USING btree ("terms_id");--> statement-breakpoint
CREATE INDEX "staff_agreements_file_idx" ON "staff_agreements" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "staff_agreements_creator_idx" ON "staff_agreements" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "staff_members_branch_idx" ON "staff_members" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "staff_members_creator_idx" ON "staff_members" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "staff_salaries_branch_month_idx" ON "staff_salaries" USING btree ("branch_id","month");--> statement-breakpoint
CREATE INDEX "staff_salaries_due_idx" ON "staff_salaries" USING btree ("branch_id","due_on");--> statement-breakpoint
CREATE INDEX "staff_salaries_terms_idx" ON "staff_salaries" USING btree ("terms_id");--> statement-breakpoint
CREATE INDEX "staff_salaries_explicit_idx" ON "staff_salaries" USING btree ("explicit_by_user_id");--> statement-breakpoint
CREATE INDEX "staff_salary_payments_salary_idx" ON "staff_salary_payments" USING btree ("salary_id");--> statement-breakpoint
CREATE INDEX "staff_salary_payments_branch_idx" ON "staff_salary_payments" USING btree ("branch_id","recorded_at");--> statement-breakpoint
CREATE INDEX "staff_salary_payments_recorder_idx" ON "staff_salary_payments" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "staff_salary_terms_creator_idx" ON "staff_salary_terms" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "manager_inventory_grants" ADD CONSTRAINT "manager_inventory_grants_permission_check" CHECK ("manager_inventory_grants"."permission" in (
    'listing_edit', 'inventory_edit', 'pricing_edit', 'policy_edit',
    'media_publish', 'block_manage', 'booking_manage', 'document_review',
    'stay_manage', 'rent_manage', 'payment_record', 'finance_view', 'checkout_manage',
    'staff_manage', 'staff_payroll_manage'));