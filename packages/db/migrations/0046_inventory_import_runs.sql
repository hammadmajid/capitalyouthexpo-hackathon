CREATE TABLE "inventory_import_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"file_sha256" "bytea" NOT NULL,
	"status" text NOT NULL,
	"total_rows" integer NOT NULL,
	"error_rows" integer NOT NULL,
	"rows" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	CONSTRAINT "inventory_import_kind_check" CHECK ("inventory_import_runs"."kind" in ('rooms','seats')),
	CONSTRAINT "inventory_import_digest_check" CHECK (octet_length("inventory_import_runs"."file_sha256") = 32),
	CONSTRAINT "inventory_import_rows_check" CHECK ("inventory_import_runs"."total_rows" between 1 and 500 and "inventory_import_runs"."error_rows" between 0 and "inventory_import_runs"."total_rows" and jsonb_typeof("inventory_import_runs"."rows") = 'array' and jsonb_array_length("inventory_import_runs"."rows") = "inventory_import_runs"."total_rows"),
	CONSTRAINT "inventory_import_status_check" CHECK ("inventory_import_runs"."status" in ('validated','failed','committed') and ("inventory_import_runs"."status" = 'failed') = ("inventory_import_runs"."error_rows" > 0) and ("inventory_import_runs"."status" = 'committed') = ("inventory_import_runs"."committed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "inventory_import_runs" ADD CONSTRAINT "inventory_import_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_import_runs" ADD CONSTRAINT "inventory_import_runs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_import_runs" ADD CONSTRAINT "inventory_import_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_import_branch_idx" ON "inventory_import_runs" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "inventory_import_file_idx" ON "inventory_import_runs" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "inventory_import_actor_idx" ON "inventory_import_runs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_import_committed_digest_uq" ON "inventory_import_runs" USING btree ("branch_id","kind","file_sha256") WHERE "inventory_import_runs"."status" = 'committed';