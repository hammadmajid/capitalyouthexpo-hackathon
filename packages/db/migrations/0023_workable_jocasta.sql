ALTER TABLE "resident_charge_catalog" ADD COLUMN "unit_label" text NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_charge_catalog" ADD COLUMN "unit_amount_paisa" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_charges" ADD COLUMN "quantity" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_charge_catalog" ADD CONSTRAINT "resident_charge_catalog_unit_check" CHECK (length(btrim("resident_charge_catalog"."unit_label")) between 1 and 40 and "resident_charge_catalog"."unit_amount_paisa" > 0);--> statement-breakpoint
ALTER TABLE "resident_charges" ADD CONSTRAINT "resident_charges_quantity_check" CHECK ("resident_charges"."quantity" > 0 and ("resident_charges"."kind" = 'custom' or "resident_charges"."quantity" = 1));