# ADR 0030: Booking lifecycle handoff through the existing outbox

- Status: Accepted; implementation verification pending
- Date: 2026-10-16
- Refs: NTF-002, ACC-001, ACC-004, SEC-003, BKG-001..009

## Context

Booking lifecycle notices must reuse the existing outbox/inbox. Inventory and
expiry transactions must not take foreign recipient identity FK locks after
inventory. Authentication lock modes and database constraints remain unchanged.

## Decision

Persist a recipient-free booking.lifecycle event atomically with booking state,
history and audit. Its strict payload contains only the closed event kind and
booking UUID. Reuse the existing nullable-recipient outbox and unique dedupe key;
no schema change or migration is required.

The notification worker validates its locked lease and persisted booking history,
resolves recipients from server records, and atomically queues existing in-app jobs
with acknowledging the lifecycle row. This handoff takes no inventory locks.
Existing delivery publishes deduplicated inbox rows. Templates contain no private
identity, documents, reasons, payment claims or client-supplied text. Hold-expiring
notices remain excluded because their usefulness has not been selected.

## Consequences

A sent lifecycle row means recipient jobs were enqueued, not yet delivered.
Unread counts still use actual inbox rows. Require boundary, lease, history,
rollback, replay and real PostgreSQL/worker tests. This ADR certifies no CI pass
or Phase 2 completion.
