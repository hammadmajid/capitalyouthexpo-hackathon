CREATE TABLE "agreement_acceptances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"stay_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"agreement_version" integer NOT NULL,
	"accepted_by_user_id" uuid NOT NULL,
	"actor_session_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"terms_digest" text NOT NULL,
	CONSTRAINT "agreement_acceptances_actor_uq" UNIQUE("agreement_id","accepted_by_user_id"),
	CONSTRAINT "agreement_acceptances_version_check" CHECK ("agreement_acceptances"."agreement_version" > 0),
	CONSTRAINT "agreement_acceptances_digest_check" CHECK ("agreement_acceptances"."terms_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_branch_id_stay_id_agreement_id_stay_agreements_branch_id_stay_id_id_fk" FOREIGN KEY ("branch_id","stay_id","agreement_id") REFERENCES "public"."stay_agreements"("branch_id","stay_id","id") ON DELETE no action ON UPDATE no action;