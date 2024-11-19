CREATE TABLE "place_aliases" (
	"place_id" uuid NOT NULL,
	"alias" "citext" NOT NULL,
	CONSTRAINT "place_aliases_place_id_alias_pk" PRIMARY KEY("place_id","alias"),
	CONSTRAINT "place_aliases_name_check" CHECK (length(btrim("place_aliases"."alias")) between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "public_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "public_approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "place_aliases" ADD CONSTRAINT "place_aliases_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_public_approved_by_user_id_users_id_fk" FOREIGN KEY ("public_approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_public_approval_pair_check" CHECK (("places"."public_approved_at" is null) = ("places"."public_approved_by_user_id" is null));