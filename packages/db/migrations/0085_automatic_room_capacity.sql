-- CHG-057 / BED-001: retain immutable identity and parent serialization; count actual beds.
CREATE OR REPLACE FUNCTION hsm_seat_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_capacity integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.id, OLD.branch_id, OLD.room_id, OLD.ordinal)
    IS DISTINCT FROM (NEW.id, NEW.branch_id, NEW.room_id, NEW.ordinal) THEN
    RAISE EXCEPTION 'Physical bed identity cannot change' USING ERRCODE = '23514';
  END IF;
  SELECT rt.capacity INTO parent_capacity FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = NEW.room_id AND r.branch_id = NEW.branch_id FOR UPDATE OF rt, r;
  IF NEW.archived_at IS NULL AND parent_capacity IS NULL THEN
    RAISE EXCEPTION 'Physical bed requires its scoped room' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Preserve column order/types and dated financial resolution; append the setup marker.
CREATE OR REPLACE VIEW current_room_types AS
SELECT t.id, t.branch_id,
  CASE WHEN t.setup_managed THEN CASE WHEN physical.capacity = 0 THEN 'Room'
    ELSE physical.capacity::text || '-bed room' END ELSE t.name END AS name,
  t.inventory_mode, physical.capacity,
  CASE WHEN p.id IS NULL THEN t.bed_monthly_rent_paisa ELSE p.bed_monthly_rent_paisa END AS bed_monthly_rent_paisa,
  CASE WHEN p.id IS NULL THEN t.room_monthly_rent_paisa ELSE p.room_monthly_rent_paisa END AS room_monthly_rent_paisa,
  CASE WHEN p.id IS NULL THEN t.deposit_paisa ELSE p.deposit_paisa END AS deposit_paisa,
  t.created_at, t.updated_at, t.archived_at, p.id AS price_version_id, p.fees AS price_fees,
  t.setup_managed
FROM room_types t
LEFT JOIN LATERAL (
  SELECT COALESCE(MAX(counted.beds), 0)::integer AS capacity FROM (
    SELECT count(s.id)::integer AS beds FROM rooms r LEFT JOIN seats s
      ON s.room_id = r.id AND s.branch_id = r.branch_id AND s.archived_at IS NULL
    WHERE r.room_type_id = t.id AND r.branch_id = t.branch_id AND r.archived_at IS NULL
    GROUP BY r.id
  ) counted
) physical ON true
LEFT JOIN LATERAL (
  SELECT v.* FROM room_type_prices v WHERE v.branch_id = t.branch_id AND v.room_type_id = t.id
    AND v.effective_from <= (statement_timestamp() AT TIME ZONE 'Asia/Karachi')::date
  ORDER BY v.effective_from DESC LIMIT 1
) p ON true;
