CREATE TABLE "expected_vacancies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"expected_vacancy_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_vacancy_type_uq" UNIQUE("branch_id","room_type_id")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"room_type_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "waitlist_entries_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "waitlist_left_order_check" CHECK ("waitlist_entries"."left_at" is null or "waitlist_entries"."left_at" >= "waitlist_entries"."joined_at")
);
--> statement-breakpoint
CREATE TABLE "waitlist_availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid,
	"available" boolean NOT NULL,
	"event_id" uuid,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "waitlist_availability_event_check" CHECK ("waitlist_availability"."event_id" is null or "waitlist_availability"."available")
);
--> statement-breakpoint
CREATE TABLE "waitlist_fanout_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"after_entry_id" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_vacancy_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid,
	"branch_became_available" boolean NOT NULL,
	"type_became_available" boolean NOT NULL,
	"available_on" date NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "waitlist_vacancy_event_branch_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "waitlist_vacancy_transition_check" CHECK ("waitlist_vacancy_events"."branch_became_available" or "waitlist_vacancy_events"."type_became_available"),
	CONSTRAINT "waitlist_vacancy_preference_check" CHECK (not "waitlist_vacancy_events"."type_became_available" or "waitlist_vacancy_events"."room_type_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "expected_vacancies" ADD CONSTRAINT "expected_vacancies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_vacancies" ADD CONSTRAINT "expected_vacancies_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_availability" ADD CONSTRAINT "waitlist_availability_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_availability" ADD CONSTRAINT "waitlist_availability_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_availability" ADD CONSTRAINT "waitlist_availability_branch_id_event_id_waitlist_vacancy_events_branch_id_id_fk" FOREIGN KEY ("branch_id","event_id") REFERENCES "public"."waitlist_vacancy_events"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_fanout_pages" ADD CONSTRAINT "waitlist_fanout_pages_branch_id_event_id_waitlist_vacancy_events_branch_id_id_fk" FOREIGN KEY ("branch_id","event_id") REFERENCES "public"."waitlist_vacancy_events"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_fanout_pages" ADD CONSTRAINT "waitlist_fanout_pages_branch_id_after_entry_id_waitlist_entries_branch_id_id_fk" FOREIGN KEY ("branch_id","after_entry_id") REFERENCES "public"."waitlist_entries"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_vacancy_events" ADD CONSTRAINT "waitlist_vacancy_events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_vacancy_events" ADD CONSTRAINT "waitlist_vacancy_events_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_active_branch_uq" ON "waitlist_entries" USING btree ("customer_user_id","branch_id") WHERE "waitlist_entries"."left_at" is null and "waitlist_entries"."room_type_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_active_type_uq" ON "waitlist_entries" USING btree ("customer_user_id","branch_id","room_type_id") WHERE "waitlist_entries"."left_at" is null and "waitlist_entries"."room_type_id" is not null;--> statement-breakpoint
CREATE INDEX "waitlist_customer_page_idx" ON "waitlist_entries" USING btree ("customer_user_id","id");--> statement-breakpoint
CREATE INDEX "waitlist_branch_page_idx" ON "waitlist_entries" USING btree ("branch_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_availability_branch_uq" ON "waitlist_availability" USING btree ("branch_id") WHERE "waitlist_availability"."room_type_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_availability_type_uq" ON "waitlist_availability" USING btree ("branch_id","room_type_id") WHERE "waitlist_availability"."room_type_id" is not null;--> statement-breakpoint
CREATE INDEX "waitlist_availability_event_idx" ON "waitlist_availability" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_fanout_first_uq" ON "waitlist_fanout_pages" USING btree ("event_id") WHERE "waitlist_fanout_pages"."after_entry_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_fanout_after_uq" ON "waitlist_fanout_pages" USING btree ("event_id","after_entry_id") WHERE "waitlist_fanout_pages"."after_entry_id" is not null;--> statement-breakpoint
CREATE INDEX "waitlist_vacancy_type_idx" ON "waitlist_vacancy_events" USING btree ("branch_id","room_type_id","id");