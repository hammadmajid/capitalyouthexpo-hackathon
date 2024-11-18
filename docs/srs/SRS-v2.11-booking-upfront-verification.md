# SRS v2.11 implementation supplement: booking upfront payment verification

Implements existing SRS v2.0 p.21–22 BKG-005..010 (booking payment rule) under the
approved Phase 3 marketplace directive. It realizes the v2.0 lifecycle
"Approved → Payment Pending → Verification Pending → Confirmed" for branches whose
existing `upfront_requirement` is not `none`. Branches with `none` keep the current
approval-equals-confirmation behaviour (API decision D1). No new booking-state enum
value is added: the authoritative booking state stays `pending_request` until
confirmation, and an immutable upfront record exposes the payment sub-status.

## Rules

- The required amount is derived only from the request's captured quote snapshot:
  `deposit`, `first_rent` (one disclosed monthly rent) or both. No other fee is
  added (BKG-005). Requirement and amount are captured when the request is created
  and never change; later branch setting or price changes do not alter them (BKG-004).
- Request mode: an Owner, or a Manager with `booking_manage`, approves the request
  after the existing document, eligibility and availability checks. Approval does
  not confirm; it opens payment. Instant mode needs no staff approval, so its
  upfront request opens payment immediately.
- The customer pays the hostel directly using the branch's Owner-configured payment
  instructions (BKG-007), shown only to that customer for an approved upfront
  booking. The platform never holds money (BKG-008, BR-01).
- The customer submits one proof: own clean private `payment_proof` upload, exact
  required amount, paid date and optional reference. One proof can be pending at a
  time; a rejected proof may be replaced before expiry.
- An Owner, or a Manager holding `booking_manage`, `payment_record` and
  `finance_view` (CHG-010), approves or rejects (reason required). Approval
  re-validates the request and confirms the booking in the same transaction; a
  screenshot alone never confirms (ACC-004).
- The original request expiry still applies (BKG-006/010). Expiry, withdrawal,
  rejection or cancellation releases inventory; pending proofs become unreviewable.
- No receipt, ledger entry, invoice, deposit balance, ResidentStay or occupancy is
  created. Those remain Phase 4+ (the verified proof is the handoff evidence).

## Migration note

Additive generated migrations add the immutable upfront record, branch payment
instructions and proof history with guards. No existing booking, quote, history,
claim or finance row is rewritten; existing pending upfront requests (previously
blocked) receive no invented record and must be resubmitted. ADR 0071.
