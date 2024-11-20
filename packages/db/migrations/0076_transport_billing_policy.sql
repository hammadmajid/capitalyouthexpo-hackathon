ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_pricing_check";--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD COLUMN "included_transport_route_ids" uuid[];--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD COLUMN "transport_billing_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD CONSTRAINT "stay_agreements_transport_snapshot_check" CHECK ("stay_agreements"."included_transport_route_ids" is null or ("stay_agreements"."version" = 1 and "stay_agreements"."booking_snapshot" is null and cardinality("stay_agreements"."included_transport_route_ids") <= 50));--> statement-breakpoint
ALTER TABLE "stay_agreements" ADD CONSTRAINT "stay_agreements_transport_billing_check" CHECK ("stay_agreements"."transport_billing_snapshot" is null or jsonb_typeof("stay_agreements"."transport_billing_snapshot") = 'object');--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_pricing_check" CHECK (("transport_routes"."pricing_mode" = 'separate' and "transport_routes"."monthly_charge_paisa" between 0 and 9007199254740991 and "transport_routes"."included_from" is null) or ("transport_routes"."pricing_mode" = 'included' and "transport_routes"."monthly_charge_paisa" = 0 and "transport_routes"."included_from" is not null));--> statement-breakpoint
ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_branch_fee_excl";--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_branch_fee_excl"
  EXCLUDE USING gist ("branch_id" WITH =, "monthly_charge_paisa" WITH <>)
  WHERE ("status" = 'active' AND "pricing_mode" = 'separate' AND "monthly_charge_paisa" > 0)
  DEFERRABLE INITIALLY DEFERRED;
