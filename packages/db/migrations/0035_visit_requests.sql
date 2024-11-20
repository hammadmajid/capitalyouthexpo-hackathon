CREATE TABLE "visit_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"requested_start" timestamp with time zone NOT NULL,
	"proposed_start" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_history_action_check" CHECK ("visit_history"."action" in ('request','approve','reschedule','reject','cancel','accept-reschedule','complete','no-show')),
	CONSTRAINT "visit_history_status_check" CHECK ("visit_history"."status" in ('requested','approved','rescheduled','rejected','cancelled','completed','no_show')),
	CONSTRAINT "visit_history_proposal_check" CHECK (("visit_history"."status" = 'rescheduled') = ("visit_history"."proposed_start" is not null)),
	CONSTRAINT "visit_history_reason_check" CHECK ("visit_history"."reason" is null or length(btrim("visit_history"."reason")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "visit_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"requested_start" timestamp with time zone NOT NULL,
	"proposed_start" timestamp with time zone,
	"status" text NOT NULL,
	"decided_by_user_id" uuid,
	"reason" text,
	"follow_up_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_requests_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "visit_requests_status_check" CHECK ("visit_requests"."status" in ('requested','approved','rescheduled','rejected','cancelled','completed','no_show')),
	CONSTRAINT "visit_requests_proposal_check" CHECK (("visit_requests"."status" = 'rescheduled') = ("visit_requests"."proposed_start" is not null)),
	CONSTRAINT "visit_requests_reason_check" CHECK ("visit_requests"."reason" is null or length(btrim("visit_requests"."reason")) between 1 and 500),
	CONSTRAINT "visit_requests_rejection_check" CHECK ("visit_requests"."status" <> 'rejected' or "visit_requests"."reason" is not null),
	CONSTRAINT "visit_requests_follow_up_check" CHECK ("visit_requests"."follow_up_sent_at" is null or "visit_requests"."status" = 'completed')
);
--> statement-breakpoint
CREATE TABLE "visiting_hours" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "visiting_hours_window_uq" UNIQUE("branch_id","day_of_week","opens_at","closes_at"),
	CONSTRAINT "visiting_hours_weekday_check" CHECK ("visiting_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "visiting_hours_order_check" CHECK ("visiting_hours"."opens_at" < "visiting_hours"."closes_at")
);
--> statement-breakpoint
ALTER TABLE "visit_history" ADD CONSTRAINT "visit_history_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_history" ADD CONSTRAINT "visit_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_history" ADD CONSTRAINT "visit_history_branch_id_visit_id_visit_requests_branch_id_id_fk" FOREIGN KEY ("branch_id","visit_id") REFERENCES "public"."visit_requests"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_requests" ADD CONSTRAINT "visit_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visiting_hours" ADD CONSTRAINT "visiting_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_history_visit_idx" ON "visit_history" USING btree ("branch_id","visit_id","id");--> statement-breakpoint
CREATE INDEX "visit_history_actor_idx" ON "visit_history" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visit_requests_active_time_uq" ON "visit_requests" USING btree ("customer_user_id","branch_id","requested_start") WHERE "visit_requests"."status" in ('requested','approved','rescheduled');--> statement-breakpoint
CREATE INDEX "visit_requests_customer_page_idx" ON "visit_requests" USING btree ("customer_user_id","id");--> statement-breakpoint
CREATE INDEX "visit_requests_branch_schedule_idx" ON "visit_requests" USING btree ("branch_id","requested_start","id");--> statement-breakpoint
CREATE INDEX "visit_requests_decider_idx" ON "visit_requests" USING btree ("decided_by_user_id");