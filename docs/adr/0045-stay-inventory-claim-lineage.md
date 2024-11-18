# ADR 0045: Stay assignments share the canonical inventory claim domain

- Status: accepted for implementation; real PostgreSQL acceptance pending
- Date: 2026-10-18
- Refs: CHG-009, STAY-001/004, RES-004/005, BKG-004/006, ACC-001/002/004

## Context

Actual timestamp occupancy and future date reservations have distinct purposes.
A second unrelated availability table would allow a booking to bypass a resident.
Expected departure is a plan, not an authoritative checkout event.

## Decision

Extend existing inventory claims with a fourth, scoped assignment source. Keep the
existing room/slot/date GiST exclusion. Assignment actual timestamps remain immutable
history; claim dates reserve the agreed future period. A genuinely open-ended Stay
uses a null upper date and the same unbounded PostgreSQL range, with an explicit
agreed open-ended policy. Holds/bookings/blocks still require finite exact periods.
No guessed departure date or artificial far-future sentinel is introduced.

Assignment creation/closure and its exact claim creation/release commit together.
An extension replaces the immutable reservation interval while preserving actual
assignment history. Transfer closes the prior physical assignment and creates the
next one; both claim changes belong in the same application transaction.

A confirmed booking hands its claim to the actual checked-in Stay atomically. Keep
the original booking state and quoted terms as reservation history; its linked Stay
records fulfillment and subsequent lifecycle. Existing booking cancellation rejects
checked-in records. Stay checkout never resurrects the original reservation claim.

Availability queries include open-ended claims. For current-date searches and
mutations, an unclosed actual assignment still blocks inventory after its expected
departure. Future date searches retain valid agreed future reservation periods. Once an
expected departure is stale/past, an unclosed occupant also blocks new future
reservations until an explicit plan update or actual checkout. Extension must
check existing future bookings/blocks. An overstay cannot silently cancel a future booking,
check out the resident, or authorize a conflicting physical check-in. Staff must
resolve the operational conflict through the explicit lifecycle workflows.

Public projections disclose only bookable inventory and availability, never the
assignment/resident identity, financial status, or claim lineage. Room locks and
PostgreSQL source/target/exclusion guards protect mutation races.

## Consequences

Generated0025/0026 extend and strictly validate the range/source model; custom0027
adds scoped/deferred handoff and assignment guards. Existing historical migrations
remain unchanged. API services still require live scope/grants, participant locks,
transaction-bound idempotency, complete agreement/billing creation, audit and outbox.
These guards alone do not implement or enable admission. Real tests are authored;
SQL execution/replay/seed/concurrency remain NOT RUN LOCALLY until combined acceptance.
