CREATE TABLE "manager_inventory_grants" (
	"assignment_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manager_inventory_grants_assignment_id_permission_pk" PRIMARY KEY("assignment_id","permission"),
	CONSTRAINT "manager_inventory_grants_permission_check" CHECK ("manager_inventory_grants"."permission" in (
    'listing_edit', 'inventory_edit', 'pricing_edit', 'policy_edit',
    'media_publish', 'block_manage', 'booking_manage', 'document_review'))
);
--> statement-breakpoint
CREATE TABLE "room_type_fees" (
	"branch_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"code" text NOT NULL,
	"cadence" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	CONSTRAINT "room_type_fees_room_type_id_code_cadence_pk" PRIMARY KEY("room_type_id","code","cadence"),
	CONSTRAINT "room_type_fees_code_check" CHECK ("room_type_fees"."code" in ('mess', 'utilities', 'admission')),
	CONSTRAINT "room_type_fees_cadence_check" CHECK ("room_type_fees"."cadence" in ('monthly', 'one_time')),
	CONSTRAINT "room_type_fees_amount_check" CHECK ("room_type_fees"."amount_paisa" >= 0)
);
--> statement-breakpoint
ALTER TABLE "room_types" DROP CONSTRAINT "room_types_capacity_check";--> statement-breakpoint
ALTER TABLE "seats" DROP CONSTRAINT "seats_ordinal_check";--> statement-breakpoint
ALTER TABLE "manager_inventory_grants" ADD CONSTRAINT "manager_inventory_grants_assignment_id_manager_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."manager_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_fees" ADD CONSTRAINT "room_type_fees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type_fees" ADD CONSTRAINT "room_type_fees_branch_id_room_type_id_room_types_branch_id_id_fk" FOREIGN KEY ("branch_id","room_type_id") REFERENCES "public"."room_types"("branch_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_capacity_check" CHECK ("room_types"."capacity" between 1 and 2147483646);--> statement-breakpoint
ALTER TABLE "seats" ADD CONSTRAINT "seats_ordinal_check" CHECK ("seats"."ordinal" between 1 and 2147483646);