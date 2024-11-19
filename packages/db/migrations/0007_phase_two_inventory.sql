CREATE TYPE "public"."booking_document_kind_enum" AS ENUM('cnic', 'student_id', 'admission_proof', 'employment_proof');--> statement-breakpoint
CREATE TYPE "public"."booking_document_state_enum" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."booking_state_enum" AS ENUM('pending_request', 'confirmed', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode_enum" AS ENUM('per_bed', 'whole_room', 'both');--> statement-breakpoint
CREATE TYPE "public"."inventory_status_enum" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"inventory_mode" "inventory_mode_enum" NOT NULL,
	"capacity" integer NOT NULL,
	"bed_monthly_rent_paisa" bigint,
	"room_monthly_rent_paisa" bigint,
	"deposit_paisa" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "room_types_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "room_types_name_check" CHECK (length(btrim("room_types"."name")) between 1 and 120),
	CONSTRAINT "room_types_capacity_check" CHECK ("room_types"."capacity" between 1 and 1000),
	CONSTRAINT "room_types_prices_check" CHECK (
    "room_types"."deposit_paisa" >= 0
    and ("room_types"."bed_monthly_rent_paisa" is null or "room_types"."bed_monthly_rent_paisa" >= 0)
    and ("room_types"."room_monthly_rent_paisa" is null or "room_types"."room_monthly_rent_paisa" >= 0)
    and ("room_types"."inventory_mode" = 'whole_room' or "room_types"."bed_monthly_rent_paisa" is not null)
    and ("room_types"."inventory_mode" = 'per_bed' or "room_types"."room_monthly_rent_paisa" is not null))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"status" "inventory_status_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "rooms_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "rooms_branch_type_id_uq" UNIQUE("branch_id","room_type_id","id"),
	CONSTRAINT "rooms_label_check" CHECK (length(btrim("rooms"."label")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "seats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"label" text NOT NULL,
	"status" "inventory_status_enum" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "seats_room_ordinal_uq" UNIQUE("room_id","ordinal"),
	CONSTRAINT "seats_branch_room_id_ordinal_uq" UNIQUE("branch_id","room_id","id","ordinal"),
	CONSTRAINT "seats_branch_room_id_uq" UNIQUE("branch_id","room_id","id"),
	CONSTRAINT "seats_ordinal_check" CHECK ("seats"."ordinal" between 1 and 1000),
	CONSTRAINT "seats_label_check" CHECK (length(btrim("seats"."label")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "booking_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_id" uuid,
	"branch_id" uuid,
	"room_type_id" uuid,
	"policy" jsonb NOT NULL,
	"platform_limits" jsonb,
	"is_current" boolean NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_policies_scope_check" CHECK (
    ("booking_policies"."brand_id" is null or ("booking_policies"."branch_id" is null and "booking_policies"."room_type_id" is null))
    and ("booking_policies"."room_type_id" is null or "booking_policies"."branch_id" is not null)),
	CONSTRAINT "booking_policies_limits_check" CHECK (
    ("booking_policies"."brand_id" is null and "booking_policies"."branch_id" is null and "booking_policies"."platform_limits" is not null)
    or (("booking_policies"."brand_id" is not null or "booking_policies"."branch_id" is not null) and "booking_policies"."platform_limits" is null)),
	CONSTRAINT "booking_policies_json_check" CHECK (jsonb_typeof("booking_policies"."policy") = 'object'
    and ("booking_policies"."platform_limits" is null or jsonb_typeof("booking_policies"."platform_limits") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "amenities" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean NOT NULL,
	CONSTRAINT "amenities_code_check" CHECK ("amenities"."code" ~ '^[a-z][a-z0-9_]{1,47}$'),
	CONSTRAINT "amenities_name_check" CHECK (length(btrim("amenities"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "branch_amenities" (
	"branch_id" uuid NOT NULL,
	"amenity_code" text NOT NULL,
	CONSTRAINT "branch_amenities_branch_id_amenity_code_pk" PRIMARY KEY("branch_id","amenity_code")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_branch_id_pk" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"alt_text" text NOT NULL,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_media_order_check" CHECK ("listing_media"."sort_order" >= 0),
	CONSTRAINT "listing_media_alt_check" CHECK (length(btrim("listing_media"."alt_text")) between 1 and 240),
	CONSTRAINT "listing_media_publication_pair_check" CHECK (
    ("listing_media"."published_at" is null) = ("listing_media"."published_by_user_id" is null))
);
--> statement-breakpoint
CREATE TABLE "room_type_amenities" (
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"amenity_code" text NOT NULL,
	CONSTRAINT "room_type_amenities_room_type_id_amenity_code_pk" PRIMARY KEY("room_type_id","amenity_code")
);
--> statement-breakpoint
CREATE TABLE "booking_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"previous_state" "booking_state_enum",
	"next_state" "booking_state_enum" NOT NULL,
	"reason_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid,
	"move_in_date" date NOT NULL,
	"move_out_date" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"quote_snapshot" jsonb NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_holds_scope_uq" UNIQUE("branch_id","room_id","id"),
	CONSTRAINT "booking_holds_customer_branch_id_uq" UNIQUE("customer_user_id","branch_id","id"),
	CONSTRAINT "booking_holds_range_check" CHECK ("booking_holds"."move_in_date" < "booking_holds"."move_out_date"),
	CONSTRAINT "booking_holds_expiry_check" CHECK ("booking_holds"."expires_at" > "booking_holds"."created_at"),
	CONSTRAINT "booking_holds_snapshot_check" CHECK (jsonb_typeof("booking_holds"."quote_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid,
	"hold_id" uuid,
	"move_in_date" date NOT NULL,
	"move_out_date" date NOT NULL,
	"state" "booking_state_enum" NOT NULL,
	"request_expires_at" timestamp with time zone,
	"quote_snapshot" jsonb NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_scope_uq" UNIQUE("branch_id","room_id","id"),
	CONSTRAINT "bookings_customer_branch_id_uq" UNIQUE("customer_user_id","branch_id","id"),
	CONSTRAINT "bookings_range_check" CHECK ("bookings"."move_in_date" < "bookings"."move_out_date"),
	CONSTRAINT "bookings_request_expiry_check" CHECK (
    ("bookings"."state" <> 'pending_request' or "bookings"."request_expires_at" is not null)
    and ("bookings"."request_expires_at" is null or "bookings"."request_expires_at" > "bookings"."created_at")),
	CONSTRAINT "bookings_snapshot_check" CHECK (jsonb_typeof("bookings"."quote_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "inventory_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid,
	"move_in_date" date NOT NULL,
	"move_out_date" date NOT NULL,
	"reason" integer NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "inventory_blocks_scope_uq" UNIQUE("branch_id","room_id","id"),
	CONSTRAINT "inventory_blocks_range_check" CHECK ("inventory_blocks"."move_in_date" < "inventory_blocks"."move_out_date"),
	CONSTRAINT "inventory_blocks_reason_check" CHECK ("inventory_blocks"."reason" in (1, 2))
);
--> statement-breakpoint
CREATE TABLE "inventory_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"seat_id" uuid,
	"seat_ordinal" integer,
	"hold_id" uuid,
	"booking_id" uuid,
	"block_id" uuid,
	"move_in_date" date NOT NULL,
	"move_out_date" date NOT NULL,
	"stay_range" daterange GENERATED ALWAYS AS (daterange(move_in_date, move_out_date, '[)')) STORED,
	"slot_range" "int4range" GENERATED ALWAYS AS (
    CASE WHEN seat_ordinal IS NULL THEN int4range(NULL, NULL, '[)')
    ELSE int4range(seat_ordinal, seat_ordinal + 1, '[)') END) STORED,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_claims_source_check" CHECK (num_nonnulls("inventory_claims"."hold_id", "inventory_claims"."booking_id", "inventory_claims"."block_id") = 1),
	CONSTRAINT "inventory_claims_seat_pair_check" CHECK (("inventory_claims"."seat_id" is null) = ("inventory_claims"."seat_ordinal" is null)),
	CONSTRAINT "inventory_claims_range_check" CHECK ("inventory_claims"."move_in_date" < "inventory_claims"."move_out_date"),
	CONSTRAINT "inventory_claims_expiry_check" CHECK ("inventory_claims"."hold_id" is null or "inventory_claims"."expires_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "booking_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"kind" "booking_document_kind_enum" NOT NULL,
	"file_id" uuid NOT NULL,
	"state" "booking_document_state_enum" NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_documents_kind_uq" UNIQUE("booking_id","kind"),
	CONSTRAINT "booking_documents_review_check" CHECK (
    ("booking_documents"."state" = 'pending' and "booking_documents"."reviewed_at" is null and "booking_documents"."reviewed_by_user_id" is null)
    or ("booking_documents"."state" <> 'pending' and "booking_documents"."reviewed_at" is not null and "booking_documents"."reviewed_by_user_id" is not null)),
	CONSTRAINT "booking_documents_rejection_check" CHECK (
    ("booking_documents"."state" = 'rejected') = ("booking_documents"."rejection_code" is not null))
);
--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_amenity_code_amenities_code_fk" FOREIGN KEY ("amenity_code") REFERENCES "public"."amenities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_amenity_code_amenities_code_fk" FOREIGN KEY ("amenity_code") REFERENCES "public"."amenities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_amenities" ADD CONSTRAINT "room_type_amenities_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_history" ADD CONSTRAINT "booking_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_history" ADD CONSTRAINT "booking_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_policy_version_id_booking_policies_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."booking_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_branch_id_room_id_seat_id_seats_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","seat_id") REFERENCES "public"."seats"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_policy_version_id_booking_policies_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."booking_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_room_id_seat_id_seats_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","seat_id") REFERENCES "public"."seats"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_user_id_branch_id_hold_id_booking_holds_customer_user_id_branch_id_id_fk" FOREIGN KEY ("customer_user_id","branch_id","hold_id") REFERENCES "public"."booking_holds"("customer_user_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_branch_id_room_id_seat_id_seats_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","seat_id") REFERENCES "public"."seats"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_seat_id_seat_ordinal_seats_branch_id_room_id_id_ordinal_fk" FOREIGN KEY ("branch_id","room_id","seat_id","seat_ordinal") REFERENCES "public"."seats"("branch_id","room_id","id","ordinal") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_hold_id_booking_holds_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","hold_id") REFERENCES "public"."booking_holds"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_booking_id_bookings_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","booking_id") REFERENCES "public"."bookings"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_block_id_inventory_blocks_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","block_id") REFERENCES "public"."inventory_blocks"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_customer_user_id_branch_id_booking_id_bookings_customer_user_id_branch_id_id_fk" FOREIGN KEY ("customer_user_id","branch_id","booking_id") REFERENCES "public"."bookings"("customer_user_id","branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_types_branch_idx" ON "room_types" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_live_label_uq" ON "rooms" USING btree ("branch_id","label") WHERE "rooms"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "rooms_type_idx" ON "rooms" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "seats_branch_idx" ON "seats" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_policies_platform_current_uq" ON "booking_policies" USING btree ("is_current") WHERE "booking_policies"."is_current" and "booking_policies"."brand_id" is null and "booking_policies"."branch_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_policies_brand_current_uq" ON "booking_policies" USING btree ("brand_id") WHERE "booking_policies"."is_current" and "booking_policies"."brand_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_policies_branch_current_uq" ON "booking_policies" USING btree ("branch_id") WHERE "booking_policies"."is_current" and "booking_policies"."branch_id" is not null and "booking_policies"."room_type_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_policies_type_current_uq" ON "booking_policies" USING btree ("room_type_id") WHERE "booking_policies"."is_current" and "booking_policies"."room_type_id" is not null;--> statement-breakpoint
CREATE INDEX "booking_policies_creator_idx" ON "booking_policies" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "favorites_branch_idx" ON "favorites" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "listing_media_branch_idx" ON "listing_media" USING btree ("branch_id","sort_order");--> statement-breakpoint
CREATE INDEX "listing_media_file_idx" ON "listing_media" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "booking_history_booking_idx" ON "booking_history" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_holds_expiry_idx" ON "booking_holds" USING btree ("expires_at") WHERE "booking_holds"."released_at" is null;--> statement-breakpoint
CREATE INDEX "booking_holds_customer_idx" ON "booking_holds" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "bookings_customer_state_idx" ON "bookings" USING btree ("customer_user_id","state");--> statement-breakpoint
CREATE INDEX "bookings_branch_state_idx" ON "bookings" USING btree ("branch_id","state");--> statement-breakpoint
CREATE INDEX "bookings_expiry_idx" ON "bookings" USING btree ("request_expires_at") WHERE "bookings"."state" = 'pending_request';--> statement-breakpoint
CREATE INDEX "inventory_blocks_branch_idx" ON "inventory_blocks" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "inventory_claims_room_idx" ON "inventory_claims" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "inventory_claims_expiry_idx" ON "inventory_claims" USING btree ("expires_at") WHERE "inventory_claims"."released_at" is null;--> statement-breakpoint
CREATE INDEX "inventory_claims_booking_idx" ON "inventory_claims" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "inventory_claims_hold_idx" ON "inventory_claims" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "inventory_claims_block_idx" ON "inventory_claims" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "booking_documents_branch_idx" ON "booking_documents" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "booking_documents_customer_idx" ON "booking_documents" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "booking_documents_file_idx" ON "booking_documents" USING btree ("file_id");