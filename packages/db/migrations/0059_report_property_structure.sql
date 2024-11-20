CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "buildings_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "buildings_name_check" CHECK (length(btrim("buildings"."name")) between 1 and 120),
	CONSTRAINT "buildings_version_check" CHECK ("buildings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"label" text NOT NULL,
	"level_number" smallint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "floors_branch_id_uq" UNIQUE("branch_id","id"),
	CONSTRAINT "floors_label_check" CHECK (length(btrim("floors"."label")) between 1 and 120),
	CONSTRAINT "floors_version_check" CHECK ("floors"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "floor_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "location_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_branch_id_building_id_buildings_branch_id_id_fk" FOREIGN KEY ("branch_id","building_id") REFERENCES "public"."buildings"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buildings_branch_page_idx" ON "buildings" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "floors_building_page_idx" ON "floors" USING btree ("branch_id","building_id","id");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_floor_id_floors_branch_id_id_fk" FOREIGN KEY ("branch_id","floor_id") REFERENCES "public"."floors"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_location_version_check" CHECK ("rooms"."location_version" > 0);