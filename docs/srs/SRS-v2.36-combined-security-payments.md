# SRS v2.36 — Combined security, rent and transport payments

User-directed 2026-11-18. PAY-001..009 / BKG-007/008 / RENT-005 / SERV-002 /
ACC-001/004/006. CHG-055 supersedes CHG-050's automatic advance handling for new collections.

- A linked resident may submit one total/proof for selected outstanding rent/transport
  bills and an explicit security-deposit component, or for security alone.
- Security is based on the current effective agreement, less previously received
  receipt-backed security (including reversals). Used/refunded security does not
  automatically become a fresh collection. Closed stays cannot collect new security.
- Security is selected by default when still due. Show security, bill allocations and
  total independently. Submission is evidence only; approval issues one payment and
  immutable receipt with separate security and invoice allocations.
- At submission and approval, reject security above the remaining agreed amount.
  At most one pending security proof per Stay; serialize on the Stay and recheck
  after concurrent staff payments, reversals, invoice changes or checkout.
- User decision: block a new payment above selected outstanding bills plus its
  explicitly selected security. No automatic excess-to-advance in resident proof
  approval or new staff-recorded external collections. Partial bill payments remain
  allowed; security must fit within the submitted total.
- User decision (latest correction): transport is optional at booking and may also be
  requested after admission. A selected separate monthly subscription is captured in
  the quote and its first month joins the hostel upfront total. A transport-only
  upfront is possible when no rent/security is required. Included-in-rent routes
  never create an extra charge. Check-in activates the captured subscription, posts
  its initial bill and schedules subsequent periods without duplicate charges.
- At booking check-in, credit the already approved booking transfer once to the new
  Stay: captured security to security, captured rent/transport against their invoices, with one
  receipt and exact proof lineage. Do not collect those funds again. Any previously
  captured rent beyond a prorated first invoice remains existing prepaid rent credit,
  not a new overpayment collection.
- Existing immutable receipts, ledger history and advance balances remain unchanged.
  Live-authorized idempotent retries of already committed collections may return
  their original receipt; they never create another collection.
  Existing pending proofs do not acquire an inferred security component. If their
  amount now exceeds selected obligations, staff must reject/reconcile before a
  corrected submission; never silently relabel money or rewrite history.
- Staff must see the security component and remaining security before approving.
  Branch permissions, private-file ownership, audit, idempotency and receipt rules remain.

## Migration note

Generated migration 0081 allows transport-only upfront terms with requirement `none`;
its positive total comes only from a server-validated selected transport quote.
Generated migration 0080 adds `resident_payment_proofs.deposit_paisa` defaulting to zero,
makes the main invoice nullable for security-only evidence, adds an obligation check
and a unique pending-security index. Existing rows retain their meaning; no historical
money reclassification or production deployment is performed. Apply before this API.
Booking carryover applies atomically to new check-ins; historical check-ins are not
silently reposted or backfilled.
