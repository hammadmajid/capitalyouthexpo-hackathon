ALTER TABLE "amenities" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "amenities" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amenities_organization_name_uq" ON "amenities" USING btree ("organization_id",lower(btrim("name"))) WHERE "amenities"."organization_id" is not null;--> statement-breakpoint
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_category_check" CHECK ("amenities"."category" in ('connectivity', 'facilities', 'security', 'services', 'other'));