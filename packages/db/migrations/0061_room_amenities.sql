CREATE TABLE "room_amenities" (
	"branch_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"amenity_code" text NOT NULL,
	CONSTRAINT "room_amenities_room_id_amenity_code_pk" PRIMARY KEY("room_id","amenity_code")
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "amenities_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_code_amenities_code_fk" FOREIGN KEY ("amenity_code") REFERENCES "public"."amenities"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_branch_id_room_id_rooms_branch_id_id_fk" FOREIGN KEY ("branch_id","room_id") REFERENCES "public"."rooms"("branch_id","id") ON DELETE no action ON UPDATE no action;