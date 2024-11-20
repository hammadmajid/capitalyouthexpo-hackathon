CREATE TABLE "menu_meal_times" (
	"branch_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"meal" "meal_enum" NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	CONSTRAINT "menu_meal_times_cell_uq" UNIQUE("branch_id","day_of_week","meal"),
	CONSTRAINT "menu_meal_times_day_check" CHECK ("menu_meal_times"."day_of_week" between 1 and 7),
	CONSTRAINT "menu_meal_times_clock_check" CHECK ("menu_meal_times"."starts_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "menu_meal_times"."ends_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "menu_meal_times_order_check" CHECK ("menu_meal_times"."starts_at" < "menu_meal_times"."ends_at")
);
--> statement-breakpoint
ALTER TABLE "menu_meal_times" ADD CONSTRAINT "menu_meal_times_branch_id_branch_menus_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch_menus"("branch_id") ON DELETE no action ON UPDATE no action;