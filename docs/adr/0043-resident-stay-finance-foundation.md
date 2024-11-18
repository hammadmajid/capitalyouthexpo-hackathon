# ADR 0043: Resident, stay and finance foundations

- **Status:** Accepted for implementation; real infrastructure verification pending
- **Date:** 2026-10-18
- **Source:** User Phase 3 master prompt; SRS v2.4 supplement / CHG-009

## Context

P2 local stabilization passes. Actual schema has bookings, quote/policy snapshots,
physical inventory and interval/slot claims, but no implemented Stay/finance tables.
`StayGuard` currently denies every request. Existing transaction-bound idempotency
rechecks live scope before replay; audit, actor/inventory locks and outbox exist.

## Decision

Reuse one account/capability model, Drizzle transactions, existing inventory targets,
branch/actor lock order, shared Zod contracts, bigint money/JSON helpers, explicit
calendar dates and Asia/Karachi operational dates. No auth/session primitive rewrite.

Represent actual assignments/history separately from future reservations, extending
existing claim lineage rather than inventing another independent availability flag.
Whole-room and bed scope must remain compatible. Check-in/transfer/checkout and
mandatory audit/outbox writes are atomic; no half-created active residents.

Branch-local manual relationships do not mint synthetic login identities or merge
by matching phone/email. New Manager operations extend the current grant catalog;
default deny, live branch checks and Owner-only private booking documents remain.

Effective operational billing settings become agreement snapshots. Preserve booked
terms and posted financial records; corrections, allocations, credit and deposit
movements remain traceable. Approved external-payment records issue immutable
receipts; file rendering/delivery uses the outbox, without claiming bank settlement.

Use additive generated migrations, scoped composite foreign keys, immutable history
and appropriate uniqueness/exclusion constraints. Every growing collection is paged;
global financial/occupancy summaries come from server aggregates, not page totals.

## Consequences

P3-1 contracts/schema precede check-in/manual admission, occupancy/history, billing,
ledger/payments/deposits and lifecycle completion; shared clients consume one API.
Initial slices implement strict stay/billing/finance contracts, additive schema and
actual Owner-controlled branch/room-type billing-policy repositories/services/HTTP.
Reads resolve the nearest complete explicit version from at most four unique
scopes; initial writes append full branch/type policy versions, never incomplete
financial objects or silent defaults. Other scope writers and operational UI remain
in progress. Manager booking-policy grants do not confer finance-policy writes.

Agreement insertion independently verifies policy scope against the stay's hostel,
branch and actual assignment/original booking room type. Terms retain the exact
selected policy and integer prices; catalog snapshots match approved immutable
scoped rates. Superseding a policy cannot rewrite an earlier agreement. Application
commands must still validate the full shared schemas and preserve booked terms.

Nullable branch-local identity cannot bypass one-active-stay uniqueness: stay and
resident linkage must agree, with deferred checking when an explicit active
resident link is committed. Real occupancy/admission claim wiring, complete
financial persistence and transaction completeness are still in progress; these
foundation tables alone must not activate actual admission routes.

Unit/HTTP/component checks do not prove PostgreSQL locking, replay, rollback or
planner behavior. Author real tests during implementation and execute them with
storage/worker/browser/security/coverage gates at combined acceptance. No physical
phone dependency; no new vulnerability or secret-scanning exception.
