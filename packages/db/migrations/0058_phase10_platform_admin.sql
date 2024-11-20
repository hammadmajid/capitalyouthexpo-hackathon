CREATE TYPE "public"."announcement_audience_enum" AS ENUM('all_managers', 'selected_branches', 'customers', 'city');--> statement-breakpoint
CREATE TYPE "public"."announcement_status_enum" AS ENUM('scheduled', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."support_priority_enum" AS ENUM('normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."support_status_enum" AS ENUM('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"audience" "announcement_audience_enum" NOT NULL,
	"branch_ids" uuid[] NOT NULL,
	"city_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "announcement_status_enum" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"recipient_count" integer,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_title_check" CHECK (length(btrim("announcements"."title")) between 1 and 120),
	CONSTRAINT "announcements_body_check" CHECK (length(btrim("announcements"."body")) between 1 and 2000),
	CONSTRAINT "announcements_audience_check" CHECK (("announcements"."audience" = 'selected_branches') = (cardinality("announcements"."branch_ids") between 1 and 200) and ("announcements"."audience" = 'city') = ("announcements"."city_id" is not null)),
	CONSTRAINT "announcements_sent_check" CHECK (("announcements"."status" = 'sent') = ("announcements"."sent_at" is not null and "announcements"."recipient_count" is not null))
);
--> statement-breakpoint
CREATE TABLE "branch_verification_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"from_status" "verification_status_enum" NOT NULL,
	"to_status" "verification_status_enum" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_verification_events_reason_check" CHECK ("branch_verification_events"."reason" is null or length(btrim("branch_verification_events"."reason")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_action_check" CHECK ("moderation_actions"."action" in ('hide_review','remove_review','restore_review','dismiss_report')),
	CONSTRAINT "moderation_actions_reason_check" CHECK (length(btrim("moderation_actions"."reason")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_messages_body_check" CHECK (length(btrim("support_ticket_messages"."body")) between 1 and 4000),
	CONSTRAINT "support_ticket_messages_visibility_check" CHECK ("support_ticket_messages"."visibility" in ('public','internal'))
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"priority" "support_priority_enum" NOT NULL,
	"status" "support_status_enum" NOT NULL,
	"assigned_admin_user_id" uuid,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_subject_check" CHECK (length(btrim("support_tickets"."subject")) between 1 and 160),
	CONSTRAINT "support_tickets_category_check" CHECK ("support_tickets"."category" in ('account','listing','booking','payment','technical','other')),
	CONSTRAINT "support_tickets_version_check" CHECK ("support_tickets"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_verification_events" ADD CONSTRAINT "branch_verification_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_verification_events" ADD CONSTRAINT "branch_verification_events_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_admin_user_id_users_id_fk" FOREIGN KEY ("assigned_admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_due_idx" ON "announcements" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "announcements_creator_idx" ON "announcements" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "announcements_city_idx" ON "announcements" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "branch_verification_events_branch_idx" ON "branch_verification_events" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "branch_verification_events_admin_idx" ON "branch_verification_events" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_target_idx" ON "moderation_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_admin_idx" ON "moderation_actions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_report_idx" ON "moderation_actions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_author_idx" ON "support_ticket_messages" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_queue_idx" ON "support_tickets" USING btree ("status","priority","id");--> statement-breakpoint
CREATE INDEX "support_tickets_opener_idx" ON "support_tickets" USING btree ("opened_by_user_id","id");--> statement-breakpoint
CREATE INDEX "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assigned_admin_user_id");--> statement-breakpoint
-- ADM-007/008/009: verification history, moderation actions and ticket messages are evidence.
CREATE TRIGGER branch_verification_events_immutable BEFORE UPDATE OR DELETE ON branch_verification_events
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER moderation_actions_immutable BEFORE UPDATE OR DELETE ON moderation_actions
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER support_ticket_messages_immutable BEFORE UPDATE OR DELETE ON support_ticket_messages
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER support_tickets_no_delete BEFORE DELETE ON support_tickets
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER announcements_no_delete BEFORE DELETE ON announcements
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
