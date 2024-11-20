CREATE TYPE "public"."hostel_revision_status_enum" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "hostel_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "hostel_revision_status_enum" DEFAULT 'draft' NOT NULL,
	"changes" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_revisions_changes_check" CHECK (jsonb_typeof("hostel_revisions"."changes") = 'object'),
	CONSTRAINT "hostel_revisions_version_check" CHECK ("hostel_revisions"."version" > 0),
	CONSTRAINT "hostel_revisions_decision_check" CHECK (("hostel_revisions"."status" in ('approved', 'rejected')) = ("hostel_revisions"."decided_at" is not null and "hostel_revisions"."decided_by_user_id" is not null)),
	CONSTRAINT "hostel_revisions_submitted_check" CHECK ("hostel_revisions"."status" = 'draft' or "hostel_revisions"."status" = 'cancelled' or "hostel_revisions"."submitted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "hostel_revisions" ADD CONSTRAINT "hostel_revisions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_revisions" ADD CONSTRAINT "hostel_revisions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_revisions" ADD CONSTRAINT "hostel_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_revisions" ADD CONSTRAINT "hostel_revisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_revisions_open_uq" ON "hostel_revisions" USING btree ("branch_id") WHERE "hostel_revisions"."status" in ('draft', 'submitted');--> statement-breakpoint
CREATE INDEX "hostel_revisions_status_idx" ON "hostel_revisions" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "hostel_revisions_brand_idx" ON "hostel_revisions" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "hostel_revisions_branch_idx" ON "hostel_revisions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "hostel_revisions_created_by_idx" ON "hostel_revisions" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "hostel_revisions_decided_by_idx" ON "hostel_revisions" USING btree ("decided_by_user_id");