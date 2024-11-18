# ADR 0077: Apply financial export ceilings after eligibility

- **Status:** Accepted correction; regression verification in progress
- **Date:** 2026-10-28
- **Requirements:** RPT-001/002, RENT-005, SEC-003; AUD-006/012

## Context

Outstanding-dues and deposit reports restrict candidate queries to 5001 rows
before evaluating canonical balances. Both can return an empty, apparently
complete report while an eligible row exists later in the authorized scope.
Unit reproductions fail for 5001 nonmatches followed by one match.

## Decision

Traverse authorized candidates in pages of 100, ordered by due date/invoice ID
or resident display name/Stay ID. Preserve due-date bounds, branch joins and
historical Stay inclusion. Calculate canonical balances in branch-scoped batches
and retain only eligible output rows. Stop at the 5001st match or true candidate
exhaustion. The existing shared report service retains 5000 rows and derives its
truncation flag from the extra matching row for every output format.

Fund batches reuse the existing receipt/reversal query and exact balance
projection, as invoice batches already do. Validate exact scope, reject ambiguous
aggregates and lock referenced Stays in stable ID order. Empty grouped results
mean zero funds; query failures never do. No financial policy, storage schema,
grant, export column or historical record changes.

## Consequences

Memory holds one candidate/balance page plus at most 5001 output rows. Complete
scans can still retain many shared Stay locks until transaction completion;
broader latency, writer contention and proxy acceptance remain AUD-012. Verify
real receipt-backed eligibility, ties, scope/date bounds, batch/single parity and
5000/5001 boundaries without increasing timeouts or lowering coverage floors.
Rollback is a normal revert of this isolated correction.
