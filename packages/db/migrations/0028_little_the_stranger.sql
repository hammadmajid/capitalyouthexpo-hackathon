ALTER TABLE "manager_inventory_grants" DROP CONSTRAINT "manager_inventory_grants_permission_check";--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_claims_live_assignment_uq" ON "inventory_claims" USING btree ("assignment_id") WHERE "inventory_claims"."assignment_id" is not null and "inventory_claims"."released_at" is null;--> statement-breakpoint
ALTER TABLE "manager_inventory_grants" ADD CONSTRAINT "manager_inventory_grants_permission_check" CHECK ("manager_inventory_grants"."permission" in (
    'listing_edit', 'inventory_edit', 'pricing_edit', 'policy_edit',
    'media_publish', 'block_manage', 'booking_manage', 'document_review',
    'stay_manage', 'rent_manage', 'payment_record', 'finance_view', 'checkout_manage'));