# ADR 0042: Bounded public inventory options

- Status: Implementation in progress; verification pending
- Date: 2026-10-18
- Refs: ROOM-002, SEAT-001, ACC-001/002, SEC-003, PERF, P2-S1

## Decision

The unreleased public v1 detail transport retains approved listing metadata,
contact disclosure and database-derived global price/availability aggregates.
It no longer embeds growing physical arrays. Physical options move to independent
UUID-keyset type, selected-type room and selected-room bed pages beneath
`/marketplace/:branchId/inventory/pages`. Default20, maximum100 and a full extra
continuation probe bound reads without imposing a business inventory cap.

Contracts, generated OpenAPI/SDK and both clients migrate in the same change.
The nested contract and full inventory helper remain regression references;
public HTTP detail uses the bounded overview reader. Existing real integration
assertions migrate to the paged responses; tests are retained. No fake empty
physical arrays or page-derived global counts. No fetch-all client loop.

Every page identifies the actual branch and exact child parent. Current approved,
non-hidden/non-archived organization/brand/branch and active city scope precedes
child reads; rooms/types/ancestors must remain public and active where required.
Responses are no-store. Stable OpenAPI operation IDs `publicTypes`, `publicRooms`
and `publicBeds` avoid class-name coupling and generated identifier entropy false positives;
secret scanning remains enabled. Read-only repeatable-read transactions give parent, child,
amenity and aggregate reads a coherent snapshot. Dated availability reuses the
existing live-claim, half-open interval and whole-room operational predicates.
No occupancy identities, rent state, private files or unavailability reasons.

Strict response/SDK checks cover safe integer paisa, exact parent scope, full probe,
ordering, duplicates, requested bounds/cursors and dated versus undated availability.
Invalid requests are400; hidden/withdrawn parents404; invalid response metadata500.

## Acceptance

Contract/repository/HTTP/SDK regressions and four real Testcontainers cases are
authored. Real database execution, rollback/planner evidence and combined P2/P3
infrastructure acceptance remain deferred, NOT RUN LOCALLY. Web/native initial,
next/final/empty, range preservation, stale-response and withdrawal tests and full
local baselines must pass before Phase 3 begins. No completed P2-S1 claim yet.
