CREATE TABLE "resident_account_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"matched_phone" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	CONSTRAINT "resident_account_links_stay_user_uq" UNIQUE("stay_id","user_id"),
	CONSTRAINT "resident_account_links_status_check" CHECK ("resident_account_links"."status" in ('pending','approved','rejected','expired')),
	CONSTRAINT "resident_account_links_decision_check" CHECK (("resident_account_links"."status" = 'pending' and "resident_account_links"."decided_at" is null and "resident_account_links"."decided_by_user_id" is null) or ("resident_account_links"."status" <> 'pending' and "resident_account_links"."decided_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "resident_account_links" ADD CONSTRAINT "resident_account_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_account_links" ADD CONSTRAINT "resident_account_links_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_account_links" ADD CONSTRAINT "resident_account_links_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resident_account_links_queue_idx" ON "resident_account_links" USING btree ("branch_id","status","id");