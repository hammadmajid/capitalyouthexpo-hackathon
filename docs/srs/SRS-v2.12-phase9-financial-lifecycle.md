# SRS v2.12 implementation supplement: Phase 9 financial and lifecycle corrections

Implements the four Phase 8 limitations the user moved into Phase 9 (2026-10-26) under
RES-005, RENT-003/004, OUT-003..006, FIN-002/004, AUD-004 and ACC-001/004/006. Money stays
integer paisa; the platform never holds or moves money (BR-01).

## P9-FIX-01 — Transfer to a differently priced bed

- A transfer keeps the agreed rent unless the request carries an explicit `repricing`
  (`rentAmountPaisa` + `residentAgreed: true`). Rent is never inferred from the destination's
  listed price (same rule as admission: manual prices are explicitly agreed).
- Repricing needs `stay_manage` + `rent_manage` + `finance_view` (Owner always).
- The same transaction moves the assignment and claim, then inserts a new
  `stay_agreements` version (same policy, deposit, fees and catalogue; new rent; reason;
  actor). Earlier versions, charges and invoices are never changed.
- **Effective date:** the start of the first period not yet invoiced by any live periodic
  schedule (the earliest cursor period), floored at the previous version's start; today when
  no schedule is live. No new mid-period split rule is introduced: a period already invoiced
  keeps its amount, and an un-invoiced current period is billed whole at the new rent.
- Live periodic schedules are superseded through the audited human change and re-authorized
  on the new version at the same cursor. A pending one-time charge blocks repricing.
- A stale job of a superseded schedule completes as `obsolete` (no money).

## P9-FIX-02 — Extension after billing exhaustion

- After the expected departure moves, the same transaction:
  - tops up a final period that was cut short by the old date, by the period's agreed amount
    under the new dates minus what was already invoiced for it (the agreed proration rule; a
    `full_period` policy already billed the whole period, so the difference is zero);
  - resumes an `exhausted` periodic schedule at its own cursor (`active`, or
    `manual_required` when the agreed amount needs a manual figure).
- Nothing before the cursor is backfilled; one-time charges are not re-billed; repeated
  extensions add nothing already covered. Extension needs `stay_manage` + `rent_manage`.

## P9-FIX-03 — Deposit application at checkout

- `applyAvailableDeposit: true` applies held deposit to the Stay's own open invoices, oldest
  due first, up to each outstanding amount, as ordinary recorded `deposit_apply` movements
  inside the checkout transaction (capacity and balance re-checked per movement). Any failure
  rolls back the whole checkout. The rest stays held for a recorded refund.
- Needs `finance_view` + `checkout_manage` + `payment_record`. No resident consent step is
  added: deposit application against the Stay's own rent was already an authorized staff act
  (OUT-003/004) before Phase 9.

## P9-FIX-04 — Refunds after checkout

- The frozen final statement is never changed. Its read now also returns `afterCheckout`:
  every fund movement and payment recorded after the statement (kind, amount, time, external
  reference) and the live settlement recomputed from committed records.
- "Refund still owed" is the live `netRefundablePaisa`; only a recorded `deposit_refund` /
  `advance_refund` movement is shown as refunded. HSM never marks a refund complete itself.

## Migration note

Migration 0056 replaces two billing guard functions so an `exhausted` schedule may move to
`active`/`manual_required`/`superseded` only through the existing human
`billing.schedule.changed` audit with an unchanged cursor. No table, column or data changes;
no historical row is rewritten.
