CREATE TABLE "hostel_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostel_rules_body_check" CHECK (length("hostel_rules"."body") between 1 and 4000 and "hostel_rules"."body" !~ '^[[:space:]]*$'),
	CONSTRAINT "hostel_rules_order_check" CHECK ("hostel_rules"."sort_order" >= 0),
	CONSTRAINT "hostel_rules_revision_check" CHECK ("hostel_rules"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "hostel_rules" ADD CONSTRAINT "hostel_rules_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hostel_rules_branch_order_idx" ON "hostel_rules" USING btree ("branch_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "hostel_rules_active_order_idx" ON "hostel_rules" USING btree ("branch_id","sort_order","id") WHERE "hostel_rules"."archived_at" is null;