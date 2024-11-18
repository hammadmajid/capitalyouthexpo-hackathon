# ADR 0079: Bind report room filters to historical assignments

- **Status:** Accepted; implementation and focused PostgreSQL/Web/Chrome verified; coordinated acceptance pending
- **Date:** 2026-10-28
- **Requirements:** RPT-001/002, RES-004/005, SEC-003; AUD-010

## Context

SRS v2.0 page 39 lists common report filters without specifying room assignment
timing after a transfer. Filtering past transactions by the current room would
move those transactions between room reports when the resident later transfers.
The user authorized choosing the most logical behavior on 2026-10-28.

## Decision

Use the assignment at the report's end date for snapshot reports, with today's
Karachi date when no end date is supplied. For payment and checkout history,
bind room filtering to the event date. A later transfer must not reclassify an
older event. Scope every assignment and parent room to the authorized branch.
Implement and test explicit boundaries for transfers, checkout and date-only
payment facts; document deterministic handling where a date has no time.

Apply each filter only to report families with the corresponding domain fact.
Validate identifiers and allowed status values, reject unsupported combinations,
and apply predicates before output limits and aggregation. Preserve existing
defaults and canonical money/receipt rules. This decision governs assignment
selection, not reconstruction or rewriting of financial history.

Implementation boundary: an end-date snapshot is immediately before the next
Karachi midnight (`startedAt < boundary`, open or `endedAt >= boundary`). A
date-only payment uses that same boundary for its `paidOn` day, consistently for
all payments on that day. Checkout uses the actual statement instant with the
same departing-assignment rule. This cannot invent an intra-day payment time.
Room building/floor metadata is maintained classification, not versioned historic
parent reconstruction; unknown legacy parents never receive fabricated matches.
Existing persisted domain statuses and canonical balances retain their meanings.

## Consequences

Use authoritative assignment history rather than current-room labels. Report
totals and output rows must use the same narrowed scope for all formats. Existing
rooms lack building/floor references despite the baseline schema describing
them; those controls require a real model and migration, not accepted-and-ignored
parameters or invented labels. Record that dependency and retain legacy rows.
No AUD-010 implementation or acceptance completion is claimed by this ADR.
