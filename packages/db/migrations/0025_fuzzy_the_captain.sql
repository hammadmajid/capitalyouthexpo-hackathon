ALTER TABLE "inventory_claims" DROP CONSTRAINT "inventory_claims_source_check";--> statement-breakpoint
ALTER TABLE "inventory_claims" DROP CONSTRAINT "inventory_claims_range_check";--> statement-breakpoint
ALTER TABLE "inventory_claims" ALTER COLUMN "move_out_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_branch_id_room_id_assignment_id_stay_assignments_branch_id_room_id_id_fk" FOREIGN KEY ("branch_id","room_id","assignment_id") REFERENCES "public"."stay_assignments"("branch_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_claims_assignment_idx" ON "inventory_claims" USING btree ("assignment_id");--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_source_check" CHECK (num_nonnulls("inventory_claims"."hold_id", "inventory_claims"."booking_id", "inventory_claims"."block_id", "inventory_claims"."assignment_id") = 1);--> statement-breakpoint
ALTER TABLE "inventory_claims" ADD CONSTRAINT "inventory_claims_range_check" CHECK (("inventory_claims"."move_out_date" is null and "inventory_claims"."assignment_id" is not null) or "inventory_claims"."move_in_date" < "inventory_claims"."move_out_date");