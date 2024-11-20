-- CHG-056 / ACC-004: bed prices share the existing append-only price-history guard.
CREATE TRIGGER bed_price_history_guard BEFORE UPDATE OR DELETE ON bed_prices
FOR EACH ROW EXECUTE FUNCTION hsm_room_price_history_guard();
--> statement-breakpoint
CREATE TRIGGER bed_price_truncate_guard BEFORE TRUNCATE ON bed_prices
FOR EACH STATEMENT EXECUTE FUNCTION hsm_room_price_history_guard();
