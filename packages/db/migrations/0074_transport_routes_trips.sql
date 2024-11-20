CREATE TYPE "public"."transport_pricing_mode_enum" AS ENUM('separate', 'included');--> statement-breakpoint
CREATE TYPE "public"."transport_destination_kind_enum" AS ENUM('university', 'office', 'area', 'other');--> statement-breakpoint
CREATE TABLE "transport_destinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" "transport_destination_kind_enum" NOT NULL,
	"name" text NOT NULL,
	"place_id" uuid,
	"area_id" uuid,
	CONSTRAINT "transport_destinations_position_uq" UNIQUE("route_id","position"),
	CONSTRAINT "transport_destinations_name_check" CHECK (length(btrim("transport_destinations"."name")) between 1 and 120),
	CONSTRAINT "transport_destinations_position_check" CHECK ("transport_destinations"."position" between 0 and 19),
	CONSTRAINT "transport_destinations_reference_check" CHECK ("transport_destinations"."place_id" is null or "transport_destinations"."area_id" is null)
);
--> statement-breakpoint
CREATE TABLE "transport_trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"days" smallint[] NOT NULL,
	"outbound_departs" text NOT NULL,
	"outbound_arrives" text,
	"outbound_arrives_next_day" boolean DEFAULT false NOT NULL,
	"return_departs" text,
	"return_departs_next_day" boolean DEFAULT false NOT NULL,
	"return_arrives" text,
	"return_arrives_next_day" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "transport_trips_position_uq" UNIQUE("route_id","position"),
	CONSTRAINT "transport_trips_position_check" CHECK ("transport_trips"."position" between 0 and 23),
	CONSTRAINT "transport_trips_days_check" CHECK (cardinality("transport_trips"."days") between 1 and 7 and "transport_trips"."days" <@ array[1,2,3,4,5,6,7]::smallint[]),
	CONSTRAINT "transport_trips_clock_check" CHECK ("transport_trips"."outbound_departs" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ("transport_trips"."outbound_arrives" is null or "transport_trips"."outbound_arrives" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("transport_trips"."return_departs" is null or "transport_trips"."return_departs" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("transport_trips"."return_arrives" is null or "transport_trips"."return_arrives" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "transport_trips_return_check" CHECK ("transport_trips"."return_departs" is not null or "transport_trips"."return_arrives" is null)
);
--> statement-breakpoint
ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_charge_check";--> statement-breakpoint
ALTER TABLE "transport_routes" DROP CONSTRAINT "transport_routes_lists_check";--> statement-breakpoint
DROP INDEX "transport_subscriptions_live_uq";--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN "stop_roles" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN "pricing_mode" "transport_pricing_mode_enum" DEFAULT 'separate' NOT NULL;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD COLUMN "included_from" date;--> statement-breakpoint
ALTER TABLE "transport_destinations" ADD CONSTRAINT "transport_destinations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_destinations" ADD CONSTRAINT "transport_destinations_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_destinations" ADD CONSTRAINT "transport_destinations_branch_id_route_id_transport_routes_branch_id_id_fk" FOREIGN KEY ("branch_id","route_id") REFERENCES "public"."transport_routes"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_trips" ADD CONSTRAINT "transport_trips_branch_id_route_id_transport_routes_branch_id_id_fk" FOREIGN KEY ("branch_id","route_id") REFERENCES "public"."transport_routes"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transport_destinations_branch_idx" ON "transport_destinations" USING btree ("branch_id","route_id");--> statement-breakpoint
CREATE INDEX "transport_destinations_place_idx" ON "transport_destinations" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "transport_destinations_area_idx" ON "transport_destinations" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "transport_trips_branch_idx" ON "transport_trips" USING btree ("branch_id","route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_subscriptions_live_route_uq" ON "transport_subscriptions" USING btree ("stay_id","route_id") WHERE "transport_subscriptions"."status" in ('requested', 'active');--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_pricing_check" CHECK (("transport_routes"."pricing_mode" = 'separate' and "transport_routes"."monthly_charge_paisa" between 1 and 9007199254740991 and "transport_routes"."included_from" is null) or ("transport_routes"."pricing_mode" = 'included' and "transport_routes"."monthly_charge_paisa" = 0 and "transport_routes"."included_from" is not null));--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_lists_check" CHECK (cardinality("transport_routes"."departure_times") <= 12 and cardinality("transport_routes"."stops") <= 30 and (cardinality("transport_routes"."stop_roles") = 0 or cardinality("transport_routes"."stop_roles") = cardinality("transport_routes"."stops")) and "transport_routes"."stop_roles" <@ array['both','pickup','dropoff']::text[]);