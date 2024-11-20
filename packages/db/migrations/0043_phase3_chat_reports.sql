CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by_user_id" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" in ('branch','review','chat_message','user')),
	CONSTRAINT "reports_reason_check" CHECK ("reports"."reason" in ('fake_listing','wrong_price','unsafe','harassment','scam','inappropriate_chat','spam','other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open','investigating','actioned','dismissed')),
	CONSTRAINT "reports_details_check" CHECK ("reports"."details" is null or (length(btrim("reports"."details")) between 1 and 4000)),
	CONSTRAINT "reports_resolution_check" CHECK (("reports"."status" in ('actioned','dismissed')) = ("reports"."resolved_at" is not null) and ("reports"."resolved_at" is null or ("reports"."handled_by_user_id" is not null and "reports"."resolution" is not null and length(btrim("reports"."resolution")) > 0)))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_user_id_admin_accounts_user_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."admin_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_reporter_page_idx" ON "reports" USING btree ("reporter_user_id","id");--> statement-breakpoint
CREATE INDEX "reports_queue_page_idx" ON "reports" USING btree ("status","target_type","id");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_handler_idx" ON "reports" USING btree ("handled_by_user_id");