# SRS v2.15 supplement — Per-room amenities and simplified room setup

User-directed 2026-10-29 ("Add per-room amenities"; rooms in one hostel differ, for
example attached versus common washroom). Refs ROOM-001..005, LIST/BR-05, ACC-004,
ACC-006, AUD-001, CHG-018/019.

## Behaviour

- Each room either inherits its room type's amenities (default for every existing room)
  or keeps its own approved-catalog set, which may be empty ("none").
- Owners, and Managers with `listing_edit`, change a room's set with a versioned
  (If-Match), idempotent, audited command (`room.amenities.changed`). Readers without
  `listing_edit` see but cannot edit.
- Public room pages disclose each selectable room's **effective** amenities (own set or
  inherited). No occupant identity, rent status or private data is disclosed (BR-05).
- Native setup no longer shows room types. Adding a room asks for room number, number of
  beds, rent basis/amount, optional deposit and a required photo; the app reuses an
  identical existing room type or creates one, because price and capacity remain on the
  canonical room type. Booking, pricing and availability rules are unchanged.

## Migration note

Additive migration 0061: `rooms.amenities_customized boolean not null default false`
and table `room_amenities(branch_id, room_id, amenity_code)` with composite room and
catalog foreign keys. Existing rooms keep inheriting; no backfill. Rollback = ignore the
flag/table (no data loss to existing room-type selections).
