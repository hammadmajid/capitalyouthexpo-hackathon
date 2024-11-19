CREATE TYPE "public"."account_status_enum" AS ENUM('unclaimed', 'active', 'suspended', 'banned', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."admin_role_enum" AS ENUM('verification', 'support', 'content_moderator', 'billing');--> statement-breakpoint
CREATE TYPE "public"."admin_status_enum" AS ENUM('invited', 'active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."area_level_enum" AS ENUM('zone', 'area', 'sector', 'sub_area');--> statement-breakpoint
CREATE TYPE "public"."notification_channel_enum" AS ENUM('in_app', 'email', 'push', 'sms');--> statement-breakpoint
CREATE TYPE "public"."client_enum" AS ENUM('mobile', 'web');--> statement-breakpoint
CREATE TYPE "public"."delivery_status_enum" AS ENUM('pending', 'sent', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."file_purpose_enum" AS ENUM('listing_photo', 'payment_proof', 'resident_document', 'verification_document', 'chat_attachment', 'complaint_attachment', 'receipt_pdf', 'export', 'avatar', 'import');--> statement-breakpoint
CREATE TYPE "public"."gender_enum" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."hostel_category_enum" AS ENUM('boys', 'girls', 'working_male', 'working_female');--> statement-breakpoint
CREATE TYPE "public"."late_fee_type_enum" AS ENUM('disabled', 'fixed', 'percentage', 'manual');--> statement-breakpoint
CREATE TYPE "public"."manager_status_enum" AS ENUM('pending_activation', 'active', 'suspended', 'deactivated');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose_enum" AS ENUM('signup_verify', 'password_reset', 'email_change', 'walk_in_claim');--> statement-breakpoint
CREATE TYPE "public"."place_type_enum" AS ENUM('university', 'office', 'business_hub');--> statement-breakpoint
CREATE TYPE "public"."plan_status_enum" AS ENUM('free');--> statement-breakpoint
CREATE TYPE "public"."scan_status_enum" AS ENUM('pending', 'clean', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."upfront_enum" AS ENUM('none', 'deposit', 'first_rent', 'deposit_and_first_rent');--> statement-breakpoint
CREATE TYPE "public"."verification_status_enum" AS ENUM('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."file_visibility_enum" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"university_place_id" uuid,
	"employer_place_id" uuid,
	"institution_text" text,
	"desired_area_id" uuid,
	"profile_completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" "citext" NOT NULL,
	"purpose" "otp_purpose_enum" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_otps_attempts_check" CHECK ("email_otps"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_expo_push_token_unique" UNIQUE("expo_push_token"),
	CONSTRAINT "push_tokens_platform_check" CHECK ("push_tokens"."platform" in ('android','ios'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"client" "client_enum" NOT NULL,
	"device_label" text,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"replaced_by_session_id" uuid,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" "citext",
	"email_verified_at" timestamp with time zone,
	"phone_e164" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"gender" "gender_enum",
	"date_of_birth" date,
	"cnic_hash" "bytea",
	"cnic_encrypted" "bytea",
	"cnic_last4" char(4),
	"permanent_address" text,
	"profile_photo_file_id" uuid,
	"account_status" "account_status_enum" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164"),
	CONSTRAINT "users_cnic_hash_unique" UNIQUE("cnic_hash")
);
--> statement-breakpoint
CREATE TABLE "branch_settings" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"reservation_expiry_hours" integer DEFAULT 48 NOT NULL,
	"upfront_requirement" "upfront_enum" DEFAULT 'none' NOT NULL,
	"proof_retry_allowed" boolean DEFAULT true NOT NULL,
	"partial_payments_enabled" boolean DEFAULT false NOT NULL,
	"rent_due_day" smallint DEFAULT 5 NOT NULL,
	"grace_days" smallint DEFAULT 3 NOT NULL,
	"late_fee_type" "late_fee_type_enum" DEFAULT 'disabled' NOT NULL,
	"late_fee_value" bigint,
	"notice_period_days" smallint DEFAULT 30 NOT NULL,
	"booking_request_response_hours" integer DEFAULT 24 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	CONSTRAINT "branch_settings_due_day_check" CHECK ("branch_settings"."rent_due_day" between 1 and 28),
	CONSTRAINT "branch_settings_nonnegative_check" CHECK ("branch_settings"."grace_days" >= 0 and "branch_settings"."notice_period_days" >= 0 and ("branch_settings"."late_fee_value" is null or "branch_settings"."late_fee_value" >= 0)),
	CONSTRAINT "branch_settings_hours_check" CHECK ("branch_settings"."reservation_expiry_hours" > 0 and "branch_settings"."booking_request_response_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"category" "hostel_category_enum" NOT NULL,
	"city_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"sub_area_id" uuid,
	"address_line" text NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"description" text,
	"public_phone" text,
	"public_email" "citext",
	"show_public_contact" boolean DEFAULT false NOT NULL,
	"mess_included" boolean DEFAULT false NOT NULL,
	"mess_notes" text,
	"verification_status" "verification_status_enum" DEFAULT 'draft' NOT NULL,
	"first_approved_at" timestamp with time zone,
	"listing_hidden_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"plan_status" "plan_status_enum" DEFAULT 'free' NOT NULL,
	"completeness_score" smallint,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "branches_slug_unique" UNIQUE("slug"),
	CONSTRAINT "branches_organization_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"logo_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "brands_organization_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "manager_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "manager_status_enum" DEFAULT 'pending_activation' NOT NULL,
	"temp_password_hash" text,
	"temp_password_expires_at" timestamp with time zone,
	"temp_password_attempts" smallint DEFAULT 0 NOT NULL,
	"appointed_by_user_id" uuid NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_assignments_attempts_check" CHECK ("manager_assignments"."temp_password_attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"city_id" uuid NOT NULL,
	"parent_id" uuid,
	"level" "area_level_enum" NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"centroid" geography(Point,4326),
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "areas_city_slug_uq" UNIQUE("city_id","slug"),
	CONSTRAINT "areas_city_id_uq" UNIQUE("city_id","id")
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "place_type_enum" NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"slug" "citext" NOT NULL,
	"city_id" uuid NOT NULL,
	"area_id" uuid,
	"address" text,
	"location" geography(Point,4326) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "places_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploaded_by" uuid,
	"visibility" "file_visibility_enum" NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" "bytea",
	"purpose" "file_purpose_enum" NOT NULL,
	"scan_status" "scan_status_enum" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "files_size_check" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_clean_digest_check" CHECK ("files"."scan_status" <> 'clean' or octet_length("files"."sha256") = 32 and "files"."sha256" is not null)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"response_status" smallint NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"channel" "notification_channel_enum" NOT NULL,
	"recipient_user_id" uuid,
	"recipient_address" text,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" "delivery_status_enum" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_attempts_check" CHECK ("notification_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"deep_link" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"is_root" boolean DEFAULT false NOT NULL,
	"status" "admin_status_enum" DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_role_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"role" "admin_role_enum" NOT NULL,
	"granted_by_user_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hostel_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hostel_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" uuid NOT NULL,
	"branch_id" uuid
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_access_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sensitive_access_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" uuid NOT NULL,
	"subject_user_id" uuid,
	"resource" text NOT NULL,
	"resource_id" uuid,
	"purpose" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_university_place_id_places_id_fk" FOREIGN KEY ("university_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_employer_place_id_places_id_fk" FOREIGN KEY ("employer_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_desired_area_id_areas_id_fk" FOREIGN KEY ("desired_area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_otps" ADD CONSTRAINT "email_otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_replaced_by_session_id_sessions_id_fk" FOREIGN KEY ("replaced_by_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_profile_photo_file_id_files_id_fk" FOREIGN KEY ("profile_photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_brand_id_brands_organization_id_id_fk" FOREIGN KEY ("organization_id","brand_id") REFERENCES "public"."brands"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_city_id_area_id_areas_city_id_id_fk" FOREIGN KEY ("city_id","area_id") REFERENCES "public"."areas"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_city_id_sub_area_id_areas_city_id_id_fk" FOREIGN KEY ("city_id","sub_area_id") REFERENCES "public"."areas"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_assignments" ADD CONSTRAINT "manager_assignments_appointed_by_user_id_users_id_fk" FOREIGN KEY ("appointed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_areas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_city_fk" FOREIGN KEY ("city_id","parent_id") REFERENCES "public"."areas"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_city_id_area_id_areas_city_id_id_fk" FOREIGN KEY ("city_id","area_id") REFERENCES "public"."areas"("city_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_grants" ADD CONSTRAINT "admin_role_grants_admin_user_id_admin_accounts_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_grants" ADD CONSTRAINT "admin_role_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_audit_log" ADD CONSTRAINT "hostel_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_audit_log" ADD CONSTRAINT "hostel_audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_audit_log" ADD CONSTRAINT "hostel_audit_log_organization_id_branch_id_branches_organization_id_id_fk" FOREIGN KEY ("organization_id","branch_id") REFERENCES "public"."branches"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_log" ADD CONSTRAINT "sensitive_access_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_log" ADD CONSTRAINT "sensitive_access_log_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_university_idx" ON "customer_profiles" USING btree ("university_place_id");--> statement-breakpoint
CREATE INDEX "profiles_employer_idx" ON "customer_profiles" USING btree ("employer_place_id");--> statement-breakpoint
CREATE INDEX "profiles_area_idx" ON "customer_profiles" USING btree ("desired_area_id");--> statement-breakpoint
CREATE INDEX "email_otps_lookup_idx" ON "email_otps" USING btree ("email","purpose","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "email_otps_user_idx" ON "email_otps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_active_user_idx" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_replacement_idx" ON "sessions" USING btree ("replaced_by_session_id");--> statement-breakpoint
CREATE INDEX "users_photo_idx" ON "users" USING btree ("profile_photo_file_id");--> statement-breakpoint
CREATE INDEX "branch_settings_updater_idx" ON "branch_settings" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE INDEX "branches_brand_idx" ON "branches" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "branches_sub_area_idx" ON "branches" USING btree ("sub_area_id");--> statement-breakpoint
CREATE INDEX "branches_city_area_idx" ON "branches" USING btree ("city_id","area_id");--> statement-breakpoint
CREATE INDEX "branches_verification_idx" ON "branches" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "branches_location_idx" ON "branches" USING gist ("location");--> statement-breakpoint
CREATE INDEX "brands_logo_idx" ON "brands" USING btree ("logo_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_assignments_one_live_branch_uq" ON "manager_assignments" USING btree ("user_id") WHERE "manager_assignments"."status" <> 'deactivated';--> statement-breakpoint
CREATE INDEX "manager_assignments_user_idx" ON "manager_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manager_assignments_branch_status_idx" ON "manager_assignments" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "manager_assignments_owner_idx" ON "manager_assignments" USING btree ("appointed_by_user_id");--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "areas_parent_idx" ON "areas" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "areas_centroid_idx" ON "areas" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX "places_city_idx" ON "places" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "places_area_idx" ON "places" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "places_location_idx" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "files_uploader_idx" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idempotency_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_delivery_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_recipient_idx" ON "notification_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("user_id","read_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_branch_idx" ON "notifications" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "admin_accounts_inviter_idx" ON "admin_accounts" USING btree ("invited_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_role_grants_live_uq" ON "admin_role_grants" USING btree ("admin_user_id","role") WHERE "admin_role_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "admin_role_grants_granter_idx" ON "admin_role_grants" USING btree ("granted_by_user_id");--> statement-breakpoint
CREATE INDEX "hostel_audit_branch_idx" ON "hostel_audit_log" USING btree ("branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "hostel_audit_org_idx" ON "hostel_audit_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hostel_audit_actor_idx" ON "hostel_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "hostel_audit_target_idx" ON "hostel_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "platform_audit_actor_idx" ON "platform_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "platform_audit_created_idx" ON "platform_audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "platform_audit_target_idx" ON "platform_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "sensitive_access_actor_idx" ON "sensitive_access_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "sensitive_access_subject_idx" ON "sensitive_access_log" USING btree ("subject_user_id");