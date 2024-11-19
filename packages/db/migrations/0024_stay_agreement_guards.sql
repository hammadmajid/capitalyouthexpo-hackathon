-- RENT-003 / ACC-004: agreements cannot import another scope's policy or invent catalog prices.
CREATE FUNCTION hsm_stay_agreement_catalog_guard(document jsonb, scope uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item jsonb; size integer;
BEGIN
  IF jsonb_typeof(document->'catalog') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Agreement catalog missing' USING ERRCODE = '23514'; END IF;
  size := jsonb_array_length(document->'catalog');
  IF size > 32 OR (size > 0 AND document->'policy'->>'customCharges' IS DISTINCT FROM 'catalog_only')
    OR (SELECT count(DISTINCT value->>'catalogId') FROM jsonb_array_elements(document->'catalog')) <> size THEN
    RAISE EXCEPTION 'Invalid agreement catalog' USING ERRCODE = '23514'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(document->'catalog') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT (item ?& ARRAY['catalogId','code','name','unitLabel','unitAmountPaisa'])
      OR item - ARRAY['catalogId','code','name','unitLabel','unitAmountPaisa'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid catalog snapshot' USING ERRCODE = '23514'; END IF;
    IF NOT EXISTS (SELECT 1 FROM resident_charge_catalog c
      WHERE c.branch_id = scope AND c.id::text = item->>'catalogId' AND c.archived_at IS NULL
        AND to_jsonb(c.code) = item->'code' AND to_jsonb(c.name) = item->'name'
        AND to_jsonb(c.unit_label) = item->'unitLabel'
        AND c.unit_amount_paisa = hsm_finance_json_money(item->'unitAmountPaisa')) THEN
      RAISE EXCEPTION 'Agreement catalog scope or price mismatch' USING ERRCODE = '23514'; END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hsm_stay_agreement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE hostel uuid; target_type uuid; selected jsonb; document jsonb;
  fields text[] := ARRAY['policyVersionId','currency','fees','catalog','rentAmountPaisa','depositPaisa','policy'];
BEGIN
  SELECT b.brand_id, coalesce(
    (SELECT a.room_type_id FROM stay_assignments a WHERE a.stay_id = s.id
      AND a.branch_id = s.branch_id AND a.ended_at IS NULL LIMIT 1),
    (SELECT r.room_type_id FROM bookings reservation JOIN rooms r
      ON r.id = reservation.room_id AND r.branch_id = reservation.branch_id
      WHERE reservation.id = s.booking_id AND reservation.branch_id = s.branch_id)
    ) INTO hostel,target_type FROM stays s JOIN branches b ON b.id = s.branch_id
    WHERE s.id = NEW.stay_id AND s.branch_id = NEW.branch_id FOR KEY SHARE OF s,b;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agreement stay unavailable' USING ERRCODE = '23514'; END IF;
  SELECT p.policy INTO selected FROM billing_policies p WHERE p.id = NEW.policy_version_id AND (
    (p.brand_id IS NULL AND p.branch_id IS NULL)
    OR (p.brand_id = hostel AND p.branch_id IS NULL)
    OR (p.branch_id = NEW.branch_id AND (p.room_type_id IS NULL OR p.room_type_id = target_type))
  ) FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agreement policy outside stay scope' USING ERRCODE = '23514'; END IF;
  document := NEW.terms_snapshot;
  IF NOT (document ?& fields) OR document - fields <> '{}'::jsonb
    OR document->>'policyVersionId' IS DISTINCT FROM NEW.policy_version_id::text
    OR document->>'currency' IS DISTINCT FROM 'PKR' OR document->'policy' IS DISTINCT FROM selected
    OR hsm_finance_json_money(document->'rentAmountPaisa') <> NEW.rent_amount_paisa
    OR hsm_finance_json_money(document->'depositPaisa') <> NEW.deposit_paisa
    OR jsonb_typeof(document->'fees') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Agreement snapshot and selected facts mismatch' USING ERRCODE = '23514'; END IF;
  IF jsonb_array_length(document->'fees') > 32 THEN
    RAISE EXCEPTION 'Agreement fee limit exceeded' USING ERRCODE = '23514'; END IF;
  PERFORM hsm_stay_agreement_catalog_guard(document,NEW.branch_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stay_agreements_scope_guard BEFORE INSERT ON stay_agreements
FOR EACH ROW EXECUTE FUNCTION hsm_stay_agreement_guard();
