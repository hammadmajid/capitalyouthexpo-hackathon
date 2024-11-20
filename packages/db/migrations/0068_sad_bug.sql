ALTER TYPE "public"."file_purpose_enum" ADD VALUE 'agreement_template' BEFORE 'verification_document';--> statement-breakpoint
ALTER TYPE "public"."file_purpose_enum" ADD VALUE 'stay_agreement' BEFORE 'verification_document';--> statement-breakpoint
CREATE TABLE "stay_agreement_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"label" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stay_agreement_file_once_uq" UNIQUE("file_id"),
	CONSTRAINT "stay_agreement_files_label_check" CHECK (length(btrim("stay_agreement_files"."label")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "stay_agreement_files" ADD CONSTRAINT "stay_agreement_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_agreement_files" ADD CONSTRAINT "stay_agreement_files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_agreement_files" ADD CONSTRAINT "stay_agreement_files_branch_id_stay_id_agreement_id_stay_agreements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id") REFERENCES "public"."stay_agreements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stay_agreement_files_page_idx" ON "stay_agreement_files" USING btree ("branch_id","stay_id","agreement_id","id");