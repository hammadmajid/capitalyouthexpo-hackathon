CREATE TYPE "public"."stay_source_enum" AS ENUM('booking', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stay_state_enum" AS ENUM('check_in_ready', 'active', 'notice_given', 'checkout_pending', 'completed', 'cancelled_before_checkin', 'terminated', 'abandoned');--> statement-breakpoint
CREATE TABLE "residents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"phone" text,
	"email" "citext",
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "residents_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "residents_branch_id_user_uq" UNIQUE("branch_id","id","user_id"),
	CONSTRAINT "residents_name_check" CHECK (length(btrim("residents"."display_name")) between 1 and 120),
	CONSTRAINT "residents_phone_check" CHECK ("residents"."phone" is null or "residents"."phone" ~ '^[+][1-9][0-9]{7,14}$'),
	CONSTRAINT "residents_email_check" CHECK ("residents"."email" is null or length("residents"."email") between 3 and 254)
);
--> statement-breakpoint
CREATE TABLE "stay_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"previous_state" "stay_state_enum",
	"next_state" "stay_state_enum" NOT NULL,
	"reason_code" text NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_history_detail_check" CHECK (jsonb_typeof("stay_history"."detail") = 'object'),
	CONSTRAINT "stay_history_reason_check" CHECK (length(btrim("stay_history"."reason_code")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "stays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"resident_id" uuid NOT NULL,
	"user_id" uuid,
	"booking_id" uuid,
	"source" "stay_source_enum" NOT NULL,
	"state" "stay_state_enum" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"move_in_date" date NOT NULL,
	"expected_leave_date" date,
	"checked_in_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stays_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "stays_booking_uq" UNIQUE("booking_id"),
	CONSTRAINT "stays_source_check" CHECK (("stays"."source" = 'booking' and "stays"."booking_id" is not null and "stays"."user_id" is not null) or ("stays"."source" = 'manual' and "stays"."booking_id" is null)),
	CONSTRAINT "stays_version_check" CHECK ("stays"."version" > 0),
	CONSTRAINT "stays_dates_check" CHECK ("stays"."expected_leave_date" is null or "stays"."move_in_date" < "stays"."expected_leave_date"),
	CONSTRAINT "stays_checkin_check" CHECK ("stays"."state" in ('check_in_ready', 'cancelled_before_checkin') or "stays"."checked_in_at" is not null),
	CONSTRAINT "stays_closed_check" CHECK (("stays"."state" in ('completed','terminated','abandoned') and "stays"."closed_at" is not null and "stays"."closed_at" >= "stays"."checked_in_at") or ("stays"."state" not in ('completed','terminated','abandoned') and "stays"."closed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "stay_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid,
	"seat_ordinal" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_assignments_scope_uq" UNIQUE("branch_id","room_id","id"),
	CONSTRAINT "stay_assignments_seat_pair_check" CHECK (("stay_assignments"."seat_id" is null) = ("stay_assignments"."seat_ordinal" is null)),
	CONSTRAINT "stay_assignments_period_check" CHECK ("stay_assignments"."ended_at" is null or "stay_assignments"."started_at" < "stay_assignments"."ended_at"),
	CONSTRAINT "stay_assignments_reason_check" CHECK (length(btrim("stay_assignments"."reason")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "billing_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid,
	"branch_id" uuid,
	"room_type_id" uuid,
	"policy" jsonb NOT NULL,
	"is_current" boolean NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_policies_scope_check" CHECK (("billing_policies"."brand_id" is null or ("billing_policies"."branch_id" is null and "billing_policies"."room_type_id" is null)) and ("billing_policies"."room_type_id" is null or "billing_policies"."branch_id" is not null)),
	CONSTRAINT "billing_policies_json_check" CHECK (jsonb_typeof("billing_policies"."policy") = 'object')
);
--> statement-breakpoint
CREATE TABLE "stay_agreements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"rent_amount_paisa" bigint NOT NULL,
	"deposit_paisa" bigint NOT NULL,
	"terms_snapshot" jsonb NOT NULL,
	"booking_snapshot" jsonb,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_agreements_scope_uq" UNIQUE("branch_id","stay_id","id"),
	CONSTRAINT "stay_agreements_version_uq" UNIQUE("stay_id","version"),
	CONSTRAINT "stay_agreements_version_check" CHECK ("stay_agreements"."version" > 0),
	CONSTRAINT "stay_agreements_money_check" CHECK ("stay_agreements"."rent_amount_paisa" >= 0 and "stay_agreements"."deposit_paisa" >= 0),
	CONSTRAINT "stay_agreements_json_check" CHECK (jsonb_typeof("stay_agreements"."terms_snapshot") = 'object' and ("stay_agreements"."booking_snapshot" is null or jsonb_typeof("stay_agreements"."booking_snapshot") = 'object')),
	CONSTRAINT "stay_agreements_reason_check" CHECK (length(btrim("stay_agreements"."reason")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_history" ADD CONSTRAINT "stay_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_history" ADD CONSTRAINT "stay_history_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_branch_id_resident_id_residents_branch_id_id_fk" FOREIGN KEY ("branch_id","resident_id") REFERENCES "public"."residents"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_branch_id_resident_id_user_id_residents_branch_id_id_user_id_fk" FOREIGN KEY ("branch_id","resident_id","user_id") REFERENCES "public"."residents"("branch_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_user_id_branch_id_booking_id_bookings_customer_user_id_branch_id_id_fk" FOREIGN KEY ("user_id","branch_id","booking_id") REFERENCES "public"."bookings"("customer_user_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_assignments" ADD CONSTRAINT "stay_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_assignments" ADD CONSTRAINT "stay_assignments_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_assignments" ADD CONSTRAINT "stay_assignments_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_assignments" ADD CONSTRAINT "stay_assignments_branch_id_room_type_id_room_id_rooms_branch_id_room_type_id_id_fk" FOREIGN KEY ("branch_id","room_type_id","room_id") REFERENCES "public"."rooms"("branch_id","room_type_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_assignments" ADD CONSTRAINT "stay_assignments_branch_id_room_id_seat_id_seat_ordinal_seats_branch_id_room_id_id_ordinal_fk" FOREIGN KEY ("branch_id","room_id","seat_id","seat_ordinal") REFERENCES "public"."seats"("branch_id","room_id","id","ordinal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_policies" ADD CONSTRAINT "billing_policies_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD CONSTRAINT "stay_agreements_policy_version_id_billing_policies_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."billing_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD CONSTRAINT "stay_agreements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD CONSTRAINT "stay_agreements_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "residents_branch_user_uq" ON "residents" USING btree ("branch_id","user_id") WHERE "residents"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "residents_directory_idx" ON "residents" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "residents_user_idx" ON "residents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stay_history_page_idx" ON "stay_history" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stays_active_user_uq" ON "stays" USING btree ("user_id") WHERE "stays"."state" in ('active','notice_given','checkout_pending') and "stays"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "stays_active_resident_uq" ON "stays" USING btree ("resident_id") WHERE "stays"."state" in ('active','notice_given','checkout_pending');--> statement-breakpoint
CREATE INDEX "stays_branch_state_page_idx" ON "stays" USING btree ("branch_id","state","id");--> statement-breakpoint
CREATE INDEX "stays_resident_page_idx" ON "stays" USING btree ("branch_id","resident_id","id");--> statement-breakpoint
CREATE INDEX "stays_user_page_idx" ON "stays" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stay_assignments_current_uq" ON "stay_assignments" USING btree ("stay_id") WHERE "stay_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "stay_assignments_history_idx" ON "stay_assignments" USING btree ("branch_id","stay_id","id");--> statement-breakpoint
CREATE INDEX "stay_assignments_room_idx" ON "stay_assignments" USING btree ("branch_id","room_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policies_platform_current_uq" ON "billing_policies" USING btree ("is_current") WHERE "billing_policies"."is_current" and "billing_policies"."brand_id" is null and "billing_policies"."branch_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policies_brand_current_uq" ON "billing_policies" USING btree ("brand_id") WHERE "billing_policies"."is_current" and "billing_policies"."brand_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policies_branch_current_uq" ON "billing_policies" USING btree ("branch_id") WHERE "billing_policies"."is_current" and "billing_policies"."branch_id" is not null and "billing_policies"."room_type_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policies_type_current_uq" ON "billing_policies" USING btree ("room_type_id") WHERE "billing_policies"."is_current" and "billing_policies"."room_type_id" is not null;--> statement-breakpoint
CREATE INDEX "billing_policies_creator_idx" ON "billing_policies" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "stay_agreements_page_idx" ON "stay_agreements" USING btree ("branch_id","stay_id","id");