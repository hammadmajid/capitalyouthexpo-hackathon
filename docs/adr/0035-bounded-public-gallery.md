# ADR 0035: Bounded public gallery continuation

- Status: Accepted; real infrastructure verification pending
- Date: 2026-10-17
- Refs: ROOM-003, ACC-002, SEC-003

## Context

Listing supplements loaded an unbounded collection of photos. Preview data and
complete gallery navigation need separate bounds without a total-photo cap.

## Decision

Listing summaries and details contain at most one currently eligible cover preview.
GET /v1/marketplace/:branchId/gallery returns at most 100 photos (default 20) plus
continuation by stable display-order/UUID position. Fetch one additional row to
determine continuation. Read parent eligibility and bounded photos in one SQL
snapshot, distinguishing genuine empty galleries from unavailable branches.

Expose only branch ID, public media IDs, alt text and cursor. Never return private
file identities, storage keys or signed credentials. Existing controlled byte reads
retain current eligibility and integrity checks before and after storage I/O.
Add a partial branch/order/ID index for active published records through generated
Drizzle migration. Preserve earlier migrations and the existing branch/file indexes.

## Consequences

Pagination is a current read, not a frozen snapshot across requests: concurrent
reordering may change later pages. Clients key by branch and deduplicate image IDs.
Empty, unavailable and failed-image states remain explicit. Private gallery pages
continue to use their separate scoped metadata contract. Migration replay and real
storage/database gallery acceptance must pass in a compatible container environment.
