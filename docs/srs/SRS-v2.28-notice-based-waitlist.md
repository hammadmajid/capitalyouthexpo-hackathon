# SRS v2.28 — Notice-based waiting list (CHG-040)

Approved by the user on 2026-11-15. Changes WAIT-001.

## Rule

- A customer may join a waiting list only when at least one current resident of that
  room type (or of the hostel, for an "any room type" preference) has given departure
  notice (stay state `notice_given` or `checkout_pending`). A full room with no notice has
  no bed to wait for, and the join is refused with `409 CONFLICT` and a plain message.
- The expected vacancy date is no longer typed by management. It is the earliest
  requested checkout date among those residents' latest notices, worked out by the server
  on every read (owner tab, customer waitlist entries, expected-vacancy endpoint).
- `PUT .../expected-vacancy` with a date is refused (`409`); clearing (`null`) stays
  allowed so older typed values can be removed. Stored typed dates are no longer shown.
- Unchanged: joining never reserves a bed or takes money; no occupant identity is shown
  publicly (BR-05); one active entry per customer and room; notifications still fire when
  a bed becomes available.

## Migration note

No schema change. Existing `expected_vacancies` rows are ignored on read. Existing waiting
list entries stay; they show a date only while a resident's notice exists.
