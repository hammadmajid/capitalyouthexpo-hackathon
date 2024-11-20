CREATE TYPE "public"."meal_enum" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TYPE "public"."transport_route_status_enum" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."transport_subscription_status_enum" AS ENUM('requested', 'active', 'ended', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."complaint_category_enum" AS ENUM('electricity', 'plumbing', 'wifi', 'cleaning', 'furniture', 'ac', 'geyser', 'mess', 'security', 'staff', 'other');--> statement-breakpoint
CREATE TYPE "public"."complaint_status_enum" AS ENUM('open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed');--> statement-breakpoint
CREATE TYPE "public"."review_category_enum" AS ENUM('cleanliness', 'security', 'food', 'staff', 'wifi', 'facilities', 'location', 'value', 'overall');--> statement-breakpoint
CREATE TYPE "public"."review_status_enum" AS ENUM('published', 'hidden', 'removed');--> statement-breakpoint
ALTER TYPE "public"."resident_charge_kind_enum" ADD VALUE 'transport';--> statement-breakpoint
ALTER TYPE "public"."resident_billing_item" ADD VALUE 'transport';--> statement-breakpoint
CREATE TABLE "branch_menus" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_menus_version_check" CHECK ("branch_menus"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"meal" "meal_enum" NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "menu_items_cell_uq" UNIQUE("branch_id","day_of_week","meal"),
	CONSTRAINT "menu_items_day_check" CHECK ("menu_items"."day_of_week" between 1 and 7),
	CONSTRAINT "menu_items_text_check" CHECK (length(btrim("menu_items"."description")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"monthly_charge_paisa" bigint NOT NULL,
	"departure_times" text[] NOT NULL,
	"stops" text[] NOT NULL,
	"status" "transport_route_status_enum" NOT NULL,
	"version" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_routes_scope_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "transport_routes_name_check" CHECK (length(btrim("transport_routes"."name")) between 1 and 120),
	CONSTRAINT "transport_routes_description_check" CHECK ("transport_routes"."description" is null or length(btrim("transport_routes"."description")) between 1 and 500),
	CONSTRAINT "transport_routes_charge_check" CHECK ("transport_routes"."monthly_charge_paisa" between 1 and 9007199254740991),
	CONSTRAINT "transport_routes_lists_check" CHECK (cardinality("transport_routes"."departure_times") between 1 and 12 and cardinality("transport_routes"."stops") between 1 and 30),
	CONSTRAINT "transport_routes_version_check" CHECK ("transport_routes"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "transport_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"status" "transport_subscription_status_enum" NOT NULL,
	"monthly_charge_paisa" bigint NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"end_requested_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"reason" text,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transport_subscriptions_charge_check" CHECK ("transport_subscriptions"."monthly_charge_paisa" between 1 and 9007199254740991),
	CONSTRAINT "transport_subscriptions_dates_check" CHECK (("transport_subscriptions"."status" in ('active','ended')) = ("transport_subscriptions"."effective_from" is not null) and ("transport_subscriptions"."status" = 'ended') = ("transport_subscriptions"."effective_to" is not null) and ("transport_subscriptions"."effective_to" is null or "transport_subscriptions"."effective_to" > "transport_subscriptions"."effective_from")),
	CONSTRAINT "transport_subscriptions_decision_check" CHECK (("transport_subscriptions"."status" in ('active','ended','rejected')) = ("transport_subscriptions"."decided_by_user_id" is not null) and ("transport_subscriptions"."status" <> 'rejected' or length(btrim(coalesce("transport_subscriptions"."reason", ''))) between 1 and 500)),
	CONSTRAINT "transport_subscriptions_version_check" CHECK ("transport_subscriptions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "complaint_attachments" (
	"complaint_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_attachments_complaint_id_file_id_pk" PRIMARY KEY("complaint_id","file_id"),
	CONSTRAINT "complaint_attachments_file_uq" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "complaint_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"complaint_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"from_status" "complaint_status_enum",
	"to_status" "complaint_status_enum" NOT NULL,
	"note" text,
	"assigned_to_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaint_events_role_check" CHECK ("complaint_events"."actor_role" in ('resident','owner','manager')),
	CONSTRAINT "complaint_events_note_check" CHECK ("complaint_events"."note" is null or length(btrim("complaint_events"."note")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" uuid,
	"seat_id" uuid,
	"category" "complaint_category_enum" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "complaint_status_enum" NOT NULL,
	"assigned_to_user_id" uuid,
	"reopen_count" smallint DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "complaints_scope_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "complaints_title_check" CHECK (length(btrim("complaints"."title")) between 1 and 120),
	CONSTRAINT "complaints_description_check" CHECK (length(btrim("complaints"."description")) between 1 and 2000),
	CONSTRAINT "complaints_version_check" CHECK ("complaints"."version" > 0),
	CONSTRAINT "complaints_reopen_check" CHECK ("complaints"."reopen_count" between 0 and 1000),
	CONSTRAINT "complaints_closed_check" CHECK (("complaints"."status" = 'closed') = ("complaints"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_ratings" (
	"review_id" uuid NOT NULL,
	"category" "review_category_enum" NOT NULL,
	"rating" smallint NOT NULL,
	CONSTRAINT "review_ratings_review_id_category_pk" PRIMARY KEY("review_id","category"),
	CONSTRAINT "review_ratings_range_check" CHECK ("review_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "review_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "review_replies_review_uq" UNIQUE("review_id"),
	CONSTRAINT "review_replies_body_check" CHECK (length(btrim("review_replies"."body")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "review_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_id" uuid NOT NULL,
	"previous_body" text,
	"previous_ratings" jsonb NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text,
	"status" "review_status_enum" NOT NULL,
	"moderation_reason" text,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "reviews_stay_uq" UNIQUE("stay_id"),
	CONSTRAINT "reviews_body_check" CHECK ("reviews"."body" is null or length(btrim("reviews"."body")) between 1 and 2000),
	CONSTRAINT "reviews_moderation_check" CHECK (("reviews"."status" = 'published') = ("reviews"."moderation_reason" is null)),
	CONSTRAINT "reviews_version_check" CHECK ("reviews"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "branch_menus" ADD CONSTRAINT "branch_menus_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_menus" ADD CONSTRAINT "branch_menus_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_branch_id_branch_menus_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch_menus"("branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_subscriptions" ADD CONSTRAINT "transport_subscriptions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_subscriptions" ADD CONSTRAINT "transport_subscriptions_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_subscriptions" ADD CONSTRAINT "transport_subscriptions_branch_id_route_id_transport_routes_branch_id_id_fk" FOREIGN KEY ("branch_id","route_id") REFERENCES "public"."transport_routes"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_seat_id_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ratings" ADD CONSTRAINT "review_ratings_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revisions" ADD CONSTRAINT "review_revisions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_menus_updater_idx" ON "branch_menus" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "transport_routes_branch_idx" ON "transport_routes" USING btree ("branch_id","status","id");--> statement-breakpoint
CREATE INDEX "transport_routes_creator_idx" ON "transport_routes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_subscriptions_live_uq" ON "transport_subscriptions" USING btree ("stay_id") WHERE "transport_subscriptions"."status" in ('requested', 'active');--> statement-breakpoint
CREATE INDEX "transport_subscriptions_branch_idx" ON "transport_subscriptions" USING btree ("branch_id","status","id");--> statement-breakpoint
CREATE INDEX "transport_subscriptions_route_idx" ON "transport_subscriptions" USING btree ("branch_id","route_id");--> statement-breakpoint
CREATE INDEX "transport_subscriptions_decider_idx" ON "transport_subscriptions" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE INDEX "complaint_events_complaint_idx" ON "complaint_events" USING btree ("complaint_id","id");--> statement-breakpoint
CREATE INDEX "complaint_events_actor_idx" ON "complaint_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "complaint_events_assignee_idx" ON "complaint_events" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "complaints_branch_queue_idx" ON "complaints" USING btree ("branch_id","status","id");--> statement-breakpoint
CREATE INDEX "complaints_stay_idx" ON "complaints" USING btree ("stay_id","id");--> statement-breakpoint
CREATE INDEX "complaints_user_idx" ON "complaints" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "complaints_room_idx" ON "complaints" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "complaints_seat_idx" ON "complaints" USING btree ("seat_id");--> statement-breakpoint
CREATE INDEX "complaints_assignee_idx" ON "complaints" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "review_replies_author_idx" ON "review_replies" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "review_revisions_review_idx" ON "review_revisions" USING btree ("review_id","id");--> statement-breakpoint
CREATE INDEX "reviews_branch_idx" ON "reviews" USING btree ("branch_id","status","id");--> statement-breakpoint
CREATE INDEX "reviews_user_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
-- CMP-004 / p.33: complaint history and review edit history are append-only evidence.
CREATE TRIGGER complaint_events_immutable BEFORE UPDATE OR DELETE ON complaint_events
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER review_revisions_immutable BEFORE UPDATE OR DELETE ON review_revisions
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
-- REV-005: reviews, ratings and attachments are never deleted (moderation hides instead).
CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER complaints_no_delete BEFORE DELETE ON complaints
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();--> statement-breakpoint
CREATE TRIGGER complaint_attachments_immutable BEFORE UPDATE OR DELETE ON complaint_attachments
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
