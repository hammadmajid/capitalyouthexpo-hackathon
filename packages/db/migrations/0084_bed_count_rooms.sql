ALTER TABLE "room_types" DROP CONSTRAINT "room_types_capacity_check";--> statement-breakpoint
ALTER TABLE "room_types" DROP CONSTRAINT "room_types_prices_check";--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "setup_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_capacity_check" CHECK ("room_types"."capacity" between 0 and 2147483646 and ("room_types"."setup_managed" or "room_types"."capacity" >= 1));--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_prices_check" CHECK (
    "room_types"."deposit_paisa" >= 0
    and ("room_types"."bed_monthly_rent_paisa" is null or "room_types"."bed_monthly_rent_paisa" >= 0)
    and ("room_types"."room_monthly_rent_paisa" is null or "room_types"."room_monthly_rent_paisa" >= 0)
    and ("room_types"."inventory_mode" = 'whole_room' or "room_types"."bed_monthly_rent_paisa" is not null or "room_types"."setup_managed")
    and (not "room_types"."setup_managed" or "room_types"."inventory_mode" = 'per_bed')
    and ("room_types"."inventory_mode" = 'per_bed' or "room_types"."room_monthly_rent_paisa" is not null));