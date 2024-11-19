ALTER TABLE "branches" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "city_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "area_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "address_line" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "location" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "nearby_landmark" text;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_one_live_primary_brand_uq" ON "branches" USING btree ("brand_id") WHERE "branches"."is_primary" and "branches"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_name_check" CHECK (length(btrim("branches"."name")) > 0);--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_area_parent_check" CHECK (
      ("branches"."area_id" is null or "branches"."city_id" is not null)
      and ("branches"."sub_area_id" is null or "branches"."area_id" is not null));--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_submission_fields_check" CHECK (
      "branches"."verification_status" in ('draft', 'changes_requested', 'rejected') or (
        "branches"."category" is not null and "branches"."city_id" is not null
        and "branches"."area_id" is not null and "branches"."address_line" is not null
        and length(btrim("branches"."address_line")) > 0 and "branches"."location" is not null));