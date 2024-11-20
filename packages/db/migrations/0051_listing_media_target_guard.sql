-- ROOM-002/003 / AUD-001: a listing photo's hostel, room or bed target is fixed at attachment.
CREATE FUNCTION hsm_listing_media_target_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.seat_id IS DISTINCT FROM OLD.seat_id THEN
    RAISE EXCEPTION 'Listing photo targets cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER listing_media_target_guard BEFORE UPDATE OF room_id, seat_id ON listing_media
FOR EACH ROW EXECUTE FUNCTION hsm_listing_media_target_guard();
