# ADR 0071: Booking upfront payment verification without new booking states

- **Status:** Accepted; implementation in verification
- **Date:** 2026-10-25
- **Requirements:** BKG-002, BKG-004..010, BR-01, ACC-001, ACC-004, ACC-006, SEC-003, NTF-002, CHG-010

## Context

`branch_settings.upfront_requirement` existed, but no API configured it and any
non-`none` value blocked confirmation ("outside Phase 2"). SRS p.21–22 defines
Approved → Payment Pending → Verification Pending → Confirmed for such branches.

## Decision

- Keep `booking_state_enum` unchanged. A booking stays `pending_request` (still
  counted by BKG-001, still expiring and reserving per policy) until confirmed.
- Additive tables: `booking_upfront_terms` (requirement and amount captured from the
  request quote; one-time approval stamp), `booking_payment_proofs` (one open proof,
  single review, unique file) and `branch_payment_instructions` (Owner-only,
  archive-only). Custom guards make them append-only, and a `bookings` trigger
  refuses confirmation with captured terms but no approved proof.
- Request mode: `POST …/bookings/{id}/approve` (booking_manage) runs the shared
  confirmation checks and opens payment. Instant mode opens payment at creation.
- Customer proof: own clean private `payment_proof`, exact amount, paid date on or
  after the request date and not in the future (Pakistan calendar), optional
  reference. `proof_retry_allowed=false` blocks replacement after rejection.
- Review: Owner, or Manager with booking_manage + payment_record + finance_view.
  Approval locks in the confirmation order (participants, branch, room, booking),
  marks the proof approved and confirms through the existing confirm path in one
  transaction. Rejection requires a reason. Proof download is short-lived and
  logged in `sensitive_access_log`.
- Owner configures `PUT /branches/{id}/upfront-settings`; changes affect only
  requests created afterwards.
- Notifications: `booking.approved`, `booking.payment_submitted` (customer
  acknowledgement + `booking.payment_review` to authorized staff),
  `booking.payment_rejected`. Staff notices recheck authority (and that the proof is
  still pending) at delivery. `booking.received` now also reaches active Managers
  with booking_manage, not only the Owner.

## Consequences

No receipt, ledger entry, invoice, deposit balance or Stay is created; the approved
proof and captured terms are the Phase 4 handoff evidence. Pending upfront requests
created before this change have no captured terms and cannot be confirmed; the
customer submits a new request.
Web and Mobile both provide Owner upfront policy/instruction editing, staff approval
and review, and the customer proof flow.
