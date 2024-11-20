-- SRS p.18 / BKG-004: retain price versions; use Pakistan calendar dates.
CREATE VIEW current_room_types AS
SELECT t.id, t.branch_id, t.name, t.inventory_mode, t.capacity,
  CASE WHEN p.id IS NULL THEN t.bed_monthly_rent_paisa ELSE p.bed_monthly_rent_paisa END AS bed_monthly_rent_paisa,
  CASE WHEN p.id IS NULL THEN t.room_monthly_rent_paisa ELSE p.room_monthly_rent_paisa END AS room_monthly_rent_paisa,
  CASE WHEN p.id IS NULL THEN t.deposit_paisa ELSE p.deposit_paisa END AS deposit_paisa,
  t.created_at, t.updated_at, t.archived_at, p.id AS price_version_id, p.fees AS price_fees
FROM room_types t LEFT JOIN LATERAL (
  SELECT v.* FROM room_type_prices v WHERE v.branch_id = t.branch_id AND v.room_type_id = t.id
    AND v.effective_from <= (statement_timestamp() AT TIME ZONE 'Asia/Karachi')::date
  ORDER BY v.effective_from DESC LIMIT 1
) p ON true;
--> statement-breakpoint
CREATE FUNCTION hsm_room_price_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Price versions cannot be rewritten or deleted' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER room_price_history_guard BEFORE UPDATE OR DELETE ON room_type_prices
FOR EACH ROW EXECUTE FUNCTION hsm_room_price_history_guard();
--> statement-breakpoint
CREATE TRIGGER room_price_truncate_guard BEFORE TRUNCATE ON room_type_prices
FOR EACH STATEMENT EXECUTE FUNCTION hsm_room_price_history_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_room_price_mode_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode text;
BEGIN
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.fees) f WHERE
    jsonb_typeof(f) <> 'object' OR NOT (f ?& ARRAY['code','cadence','amountPaisa'])
    OR f - 'code' - 'cadence' - 'amountPaisa' <> '{}'::jsonb
    OR jsonb_typeof(f->'code') <> 'string' OR jsonb_typeof(f->'cadence') <> 'string'
    OR f->>'code' NOT IN ('mess','utilities','admission')
    OR f->>'cadence' NOT IN ('monthly','one_time')
    OR jsonb_typeof(f->'amountPaisa') <> 'number'
    OR (f->>'amountPaisa') !~ '^(0|[1-9][0-9]*)$'
    OR (f->>'amountPaisa')::numeric NOT BETWEEN 0 AND 9007199254740991)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.fees) f GROUP BY f->>'code', f->>'cadence' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Price fees require unique categories and integer paisa' USING ERRCODE = '23514';
  END IF;
  SELECT inventory_mode INTO mode FROM room_types WHERE id = NEW.room_type_id AND branch_id = NEW.branch_id FOR UPDATE;
  IF mode IS NULL OR (mode <> 'whole_room' AND NEW.bed_monthly_rent_paisa IS NULL)
    OR (mode <> 'per_bed' AND NEW.room_monthly_rent_paisa IS NULL) THEN
    RAISE EXCEPTION 'Price requires amounts for the inventory mode' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER room_price_mode_guard BEFORE INSERT ON room_type_prices
FOR EACH ROW EXECUTE FUNCTION hsm_room_price_mode_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_room_type_price_mode_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM room_type_prices p WHERE p.room_type_id = NEW.id
    AND ((NEW.inventory_mode <> 'whole_room' AND p.bed_monthly_rent_paisa IS NULL)
      OR (NEW.inventory_mode <> 'per_bed' AND p.room_monthly_rent_paisa IS NULL))) THEN
    RAISE EXCEPTION 'Inventory mode conflicts with retained prices' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER room_type_price_mode_guard BEFORE UPDATE OF inventory_mode ON room_types
FOR EACH ROW EXECUTE FUNCTION hsm_room_type_price_mode_guard();
