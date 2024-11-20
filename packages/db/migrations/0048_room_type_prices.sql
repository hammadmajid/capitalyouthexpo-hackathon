CREATE TABLE "room_type_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"bed_monthly_rent_paisa" bigint,
	"room_monthly_rent_paisa" bigint,
	"deposit_paisa" bigint NOT NULL,
	"fees" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_type_prices_date_uq" UNIQUE("room_type_id","effective_from"),
	CONSTRAINT "room_type_prices_money_check" CHECK ("room_type_prices"."deposit_paisa" between 0 and 9007199254740991 and ("room_type_prices"."bed_monthly_rent_paisa" is null or "room_type_prices"."bed_monthly_rent_paisa" between 0 and 9007199254740991) and ("room_type_prices"."room_monthly_rent_paisa" is null or "room_type_prices"."room_monthly_rent_paisa" between 0 and 9007199254740991)),
	CONSTRAINT "room_type_prices_fees_check" CHECK (jsonb_typeof("room_type_prices"."fees") = 'array' and jsonb_array_length("room_type_prices"."fees") <= 32)
);
--> statement-breakpoint
ALTER TABLE "room_type_prices" ADD CONSTRAINT "room_type_prices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_prices" ADD CONSTRAINT "room_type_prices_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_type_prices_branch_idx" ON "room_type_prices" USING btree ("branch_id","room_type_id","effective_from");