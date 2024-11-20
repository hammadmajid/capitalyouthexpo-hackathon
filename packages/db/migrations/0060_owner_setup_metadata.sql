CREATE TYPE "public"."property_tier_enum" AS ENUM('standard', 'premium', 'luxury');--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "property_tier" "property_tier_enum";--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "establishment_year" smallint;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_establishment_year_check" CHECK ("branches"."establishment_year" between 1800 and 9999);