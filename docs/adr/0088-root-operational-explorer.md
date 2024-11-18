# ADR 0088: Root operational metadata explorer

- Status: Implemented; final device acceptance pending
- Date: 2026-10-31
- Requirements: HMA-017, PAY-008, RES-004, CHG-023

## Context

The main dashboard needs navigable real operational totals. Existing organization,
brand and branch relationships already support multiple branches per business.
Resident evidence and branch financial decisions must retain existing boundaries.

## Decision

Use one typed Root-only explorer API and shared Native directory/profile components.
Recheck active Root authority for every read; audit individual profile access and
fail closed on audit failure. Scope cursors to query filters and stable ID ordering.
Reuse original queues and decision services. Aggregate current stay placements and
approved payments with receipts, excluding reversals; expose no resident evidence.
Use Karachi calendar cohorts and explicitly distinguish current occupancy from
historical analytics. No migration; existing hierarchy remains authoritative.

## Consequences

Business-to-branch drill-down reuses existing ownership relationships. Income tracking
is deferred; resident payments never represent platform revenue. Complaint category
metadata has no invented priority or new branch decision authority. Device acceptance
requires reconnection; disposable integration verifies nonempty relationships.
