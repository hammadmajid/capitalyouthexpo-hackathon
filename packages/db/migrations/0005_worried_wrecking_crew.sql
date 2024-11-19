CREATE TABLE "owner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"cnic_front_file_id" uuid NOT NULL,
	"cnic_back_file_id" uuid NOT NULL,
	"address" text NOT NULL,
	"agreement_version" text NOT NULL,
	"agreement_accepted_at" timestamp with time zone NOT NULL,
	"profile_completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_profiles_distinct_sides_check" CHECK ("owner_profiles"."cnic_front_file_id" <> "owner_profiles"."cnic_back_file_id"),
	CONSTRAINT "owner_profiles_address_check" CHECK (char_length(trim("owner_profiles"."address")) between 5 and 500),
	CONSTRAINT "owner_profiles_agreement_check" CHECK ("owner_profiles"."agreement_version" = 'owner-foundation-v1')
);
--> statement-breakpoint
CREATE TABLE "registration_setups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "registration_setups_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "registration_setups_expiry_check" CHECK ("registration_setups"."expires_at" > "registration_setups"."created_at"),
	CONSTRAINT "registration_setups_hash_check" CHECK ("registration_setups"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "age" smallint;--> statement-breakpoint
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_cnic_front_file_id_files_id_fk" FOREIGN KEY ("cnic_front_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_profiles" ADD CONSTRAINT "owner_profiles_cnic_back_file_id_files_id_fk" FOREIGN KEY ("cnic_back_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_setups" ADD CONSTRAINT "registration_setups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_profiles_front_idx" ON "owner_profiles" USING btree ("cnic_front_file_id");--> statement-breakpoint
CREATE INDEX "owner_profiles_back_idx" ON "owner_profiles" USING btree ("cnic_back_file_id");--> statement-breakpoint
CREATE INDEX "registration_setups_user_idx" ON "registration_setups" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "profiles_age_check" CHECK ("customer_profiles"."age" is null or "customer_profiles"."age" between 18 and 120);