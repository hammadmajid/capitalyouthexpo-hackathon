CREATE TABLE "verification_decision_submissions" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_snapshot_items" (
	"submission_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "verification_snapshot_items_submission_id_kind_source_id_pk" PRIMARY KEY("submission_id","kind","source_id"),
	CONSTRAINT "verification_snapshot_items_kind_check" CHECK ("verification_snapshot_items"."kind" in ('pricing','photo','fingerprint'))
);
--> statement-breakpoint
CREATE TABLE "verification_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"dossier" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_decision_submissions" ADD CONSTRAINT "verification_decision_submissions_event_id_branch_verification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."branch_verification_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_decision_submissions" ADD CONSTRAINT "verification_decision_submissions_submission_id_verification_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."verification_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_snapshot_items" ADD CONSTRAINT "verification_snapshot_items_submission_id_verification_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."verification_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_submissions" ADD CONSTRAINT "verification_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_decision_submissions_snapshot_idx" ON "verification_decision_submissions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "verification_submissions_branch_idx" ON "verification_submissions" USING btree ("branch_id","id");
--> statement-breakpoint
CREATE FUNCTION prevent_verification_snapshot_change() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Verification submission evidence is append-only' USING ERRCODE = '23514';
END; $$;
--> statement-breakpoint
CREATE TRIGGER verification_submissions_append_only BEFORE UPDATE OR DELETE ON verification_submissions
FOR EACH ROW EXECUTE FUNCTION prevent_verification_snapshot_change();
--> statement-breakpoint
CREATE TRIGGER verification_snapshot_items_append_only BEFORE UPDATE OR DELETE ON verification_snapshot_items
FOR EACH ROW EXECUTE FUNCTION prevent_verification_snapshot_change();
--> statement-breakpoint
CREATE TRIGGER verification_decision_submissions_append_only BEFORE UPDATE OR DELETE ON verification_decision_submissions
FOR EACH ROW EXECUTE FUNCTION prevent_verification_snapshot_change();
