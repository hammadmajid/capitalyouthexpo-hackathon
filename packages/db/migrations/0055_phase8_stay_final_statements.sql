CREATE TABLE "stay_final_statements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_final_statements_snapshot_check" CHECK (jsonb_typeof("stay_final_statements"."snapshot") = 'object')
);
--> statement-breakpoint
ALTER TABLE "stay_final_statements" ADD CONSTRAINT "stay_final_statements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_final_statements" ADD CONSTRAINT "stay_final_statements_branch_id_stay_id_stays_branch_id_id_fk" FOREIGN KEY ("branch_id","stay_id") REFERENCES "public"."stays"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stay_final_statements_stay_uq" ON "stay_final_statements" USING btree ("stay_id");--> statement-breakpoint
-- OUT-005: a frozen final statement is immutable history.
CREATE TRIGGER stay_final_statements_immutable BEFORE UPDATE OR DELETE ON stay_final_statements
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();
