# ADR 0073: Phase 9 resident services and Phase 10 platform administration

- **Status:** Accepted; locally verified on real PostgreSQL
- **Date:** 2026-10-27
- **Requirements:** SERV-001/002, CMP-001..006, REV-001..006, OWN-001..004, MGRD-001..005, RPT-001..004, ADM-001..010, CHG-016

## Decision

- **Transport billing** reuses the resident billing engine: one `transport` schedule per agreement whose planner charges
  each Stay fee period for the overlap with approved subscription windows. Repricing, extension continuation and checkout
  stop treat it like any periodic item. No second scheduler.
- **Complaints and reviews** keep append-only history (events, revisions, moderation actions) and forbid deletes.
  Management replies but cannot edit reviews; moderation needs a content-moderator reason and is reversible.
- **Admin hierarchy:** Root-only management with an advisory lock and a pre-check of the 1..3 active Root cap (the
  deferred database trigger remains the backstop). Invited admins accept their own access. No impersonation.
- **Verification** is a server-side state machine with reasons for adverse decisions and an append-only event log.
- **Dashboards/reports** reuse the Bed Board occupancy projection and the invoice balance function; reports are scoped in
  SQL, bounded, audited and streamed (JSON/CSV/PDF) rather than stored.
- **Announcements** are delivered by an internal outbox job under the worker's lease, deduplicated per user.

## Consequences

- Owners/Managers configure a monthly fee billing policy before paid transport can be approved.
- Large reports truncate at 5000 rows and say so; the export-job/signed-URL design in the v1 API draft is superseded.
