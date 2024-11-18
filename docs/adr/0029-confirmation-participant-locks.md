# ADR 0029: Ordered identity participants for booking confirmation

- Status: Accepted; implementation verification pending
- Date: 2026-10-16
- Refs: ACC-001, ACC-004, SEC-003, AUTH-C-005, BKG-001

## Context

Confirmation rechecks the persisted Customer profile and permanent address.
Its acting staff identity and inventory locks previously preceded the Customer
identity lock. Customer work acquires its own identity before inventory. A new
unit regression reproduced the missing ordered-participant path; a PostgreSQL
deadlock has not been reproduced locally because no container runtime is present.

## Decision

Reuse the existing globally ordered participant lock from Manager invitations.
Resolve the booking Customer in a short, live actor/branch/booking_manage scoped
preflight transaction. Release those locks before starting the idempotent mutation.
That transaction locks staff and Customer identities in the existing order before
inventory, then rechecks live branch authority. Confirmation rejects a changed
persisted Customer binding before reading private profile/evidence or mutating it.

Clone the idempotency service with the scoped store while preserving its clock,
fingerprint, replay validation and expiry. Do not change authentication primitives,
User lock modes, database constraints, booking state rules or public disclosure.

## Consequences

Confirmation adds one scoped preflight read transaction. Cancellation/rejection
retain their existing path. Unit regression, scope/revocation, clock/replay and
real PostgreSQL concurrency checks are required. Container checks remain pending;
this ADR does not certify Phase 2 acceptance or a CI pass. Lifecycle notifications
must also respect this lock order and remain atomic with their business state.
