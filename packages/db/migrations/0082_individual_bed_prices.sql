CREATE TABLE "bed_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_rent_paisa" bigint NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bed_prices_money_check" CHECK ("bed_prices"."monthly_rent_paisa" between 0 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "bed_prices" ADD CONSTRAINT "bed_prices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_prices" ADD CONSTRAINT "bed_prices_branch_id_room_id_bed_id_seats_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","bed_id") REFERENCES "public"."seats"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bed_prices_effective_idx" ON "bed_prices" USING btree ("branch_id","bed_id","effective_from","id");