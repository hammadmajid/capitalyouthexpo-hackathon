CREATE TABLE "visit_interest_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"visit_id" uuid NOT NULL,
	"still_interested" boolean NOT NULL,
	"visit_version" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_interest_response_version_uq" UNIQUE("visit_id","visit_version")
);
--> statement-breakpoint
ALTER TABLE "visit_interest_responses" ADD CONSTRAINT "visit_interest_responses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_interest_responses" ADD CONSTRAINT "visit_interest_responses_branch_id_visit_id_visit_requests_branch_id_id_fk" FOREIGN KEY ("branch_id","visit_id") REFERENCES "public"."visit_requests"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visit_interest_response_page_idx" ON "visit_interest_responses" USING btree ("branch_id","visit_id","visit_version");--> statement-breakpoint
CREATE INDEX "visit_requests_follow_up_idx" ON "visit_requests" USING btree ("id") WHERE "visit_requests"."status" = 'completed' and "visit_requests"."follow_up_sent_at" is null;