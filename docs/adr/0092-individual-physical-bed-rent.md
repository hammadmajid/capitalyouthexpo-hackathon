# ADR 0092: Individual physical-bed rent

- Status: Accepted
- Date: 2026-11-20
- Decision owner: User Hostel Setup direction

## Decision

Add immutable dated bed_prices versions rather than splitting a shared room type
for every price edit. Resolve the allocated bed in booking quotes and expose its
price in private/public bed projections and marketplace filters. Inventory editing
and pricing editing grants are both required. Reuse existing idempotency, audit,
branch scope locks and financial snapshot boundaries.

## Consequences

No rewrite of legacy room types, historical bookings, agreements or invoices.
Legacy beds retain effective type rent until explicitly repriced. Same-date
corrections append and select the latest UUIDv7; future versions remain inactive.
Native setup creates per-bed inventory; whole-room history/APIs remain compatible.
Existing archive commands implement setup delete controls without hard deletion.

See CHG-056 and SRS v2.37 for the migration note.

Follow-up: the pencil opens Edit name and Delete for all four hierarchy levels.
Names update the existing record with branch permission, expected-name conflict
checking and audit; room/bed IDs, ordinals and financial snapshots are retained.
