-- Abort transactionally on conflicting existing records. A rollout must reconcile them explicitly.
DROP INDEX "transport_subscriptions_live_route_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "transport_subscriptions_live_uq" ON "transport_subscriptions" USING btree ("stay_id") WHERE "transport_subscriptions"."status" in ('requested', 'active');--> statement-breakpoint
ALTER TABLE "transport_subscriptions" ADD CONSTRAINT "transport_subscriptions_stay_window_excl"
  EXCLUDE USING gist ("stay_id" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&)
  WHERE ("status" IN ('active', 'ended'));--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_branch_fee_excl"
  EXCLUDE USING gist ("branch_id" WITH =, "monthly_charge_paisa" WITH <>)
  WHERE ("status" = 'active' AND "pricing_mode" = 'separate')
  DEFERRABLE INITIALLY DEFERRED;
