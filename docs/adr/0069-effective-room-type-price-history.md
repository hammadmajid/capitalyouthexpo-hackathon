# ADR 0069: Effective room-type prices and retained financial snapshots

- **Status:** Accepted design; implementation and acceptance in progress
- **Date:** 2026-10-25
- **Requirements:** SRS p.18 price effective date, BKG-004, ROOM-001, AUD-001, ACC-004/006

## Context

The current runtime shares prices through configurable room types. Its initial
money and disclosed-fee fields exist, but editing them previously replaced the
current configuration without an effective date. The v1 schema's planned
room_prices history was never activated. Existing booking quotes already capture
immutable amounts. Actual resident admission remains Phase4.

## Decision

Add Drizzle0048/0049 room_type_prices with exact branch/type foreign keys,
integer-paisa rent/deposit, one complete disclosed-fee snapshot, an explicit
effective date and attributed creation time. Preserve the v1 unique-date rule at
the runtime's shared room-type scope. A second version for the same date conflicts;
retained versions cannot be edited, deleted or truncated. No automatic backfill
invents a historical effective date for legacy prices.

The latest version whose effective date is on or before the Pakistan calendar
date supplies all prices/fees together. Until a version is due, legacy configured
prices remain the fallback. Public discovery, filters, details and type pages and
private management reads use one current-price view. Booking quotes retain the
existing base inventory locks and resolve the version with their injected clock.
No worker or deployment timing is needed for scheduled prices to take effect.

Scoped history reads reuse existing inventory-read authority. Publishing requires
both inventory_edit and pricing_edit, current actor/branch/type checks, retained
actor-bound idempotency and audit in the same transaction. Replay reauthorizes.
The undated configuration route cannot overwrite money or fees. Existing type
configuration edits preserve the legacy fallback; inventory mode changes cannot
invalidate a retained price version. Public DTOs disclose current amounts only,
never private creator, history or audit metadata.

Both inventory clients expose bounded independent history pages and an explicit
effective-date publication form. Unknown outcomes retain the original date,
amounts, fees and key; replacement/navigation stays locked until resolved.
Unavailable or failed current reads hide cached financial facts.

## Consequences and verification

The old room_prices draft remains historical, superseded for the implemented
room-type sharing model. Existing confirmed bookings, issued invoices and other
financial snapshots are never rewritten or linked dynamically to the new prices.
The SRS v2.10 implementation supplement records the migration note. Targeted real
PostgreSQL, shared package, client and static results are recorded in STATUS.md;
full Phase3 acceptance remains open.
