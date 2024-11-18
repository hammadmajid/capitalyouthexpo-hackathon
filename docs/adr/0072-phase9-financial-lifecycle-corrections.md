# ADR 0072: Phase 9 financial and lifecycle corrections

- **Status:** Accepted; implemented and verified on real PostgreSQL
- **Date:** 2026-10-26
- **Requirements:** RES-005, RENT-003/004, OUT-003..006, FIN-002/004, AUD-004, ACC-001, ACC-004, ACC-006, CHG-010, CHG-015

## Context

Phase 8 left four limitations: transfers kept the old rent, extensions did not resume an
exhausted billing schedule, checkout refused deposit application, and refunds after checkout
were invisible beside the frozen statement. Billing guards made `exhausted` terminal, an
agreement version is append-only, and a schedule is unique per agreement, item and cadence.

## Decision

- **Repricing = agreement amendment.** A new `stay_agreements` version is written after the
  new assignment exists (the agreement guard resolves scope from the open assignment). Live
  schedules are superseded and re-authorized on the new version at their cursor. The new rent
  starts at the first un-invoiced period, so no issued invoice changes and no split rule is
  invented.
- **Billing continuation.** Migration 0056 lets an `exhausted` schedule resume through the same
  audited human change used for stop/supersede. A short final period is topped up by the
  difference between its agreed amount under the new dates and what was invoiced.
- **Deposit at checkout** reuses the recorded `deposit_apply` movement command inside the
  checkout transaction.
- **Post-checkout reconciliation** is a read beside the immutable statement, not a new table.
- **Defect fixed:** a stale billing job completed as `obsolete` recorded the schedule's live
  version, which the execution guard rejects, so stopped or superseded work could never
  complete. The execution now records the version and period the job was issued for.

## Consequences

- Money-changing lifecycle acts need finance grants (`rent_manage`, `payment_record`).
- A repricing with a pending one-time charge is refused until that charge is posted or stopped.
- Real-PostgreSQL suite `phase-nine-financial.spec.ts` drives the real billing delivery path.
