# Phase 2 remaining query audit (2026-10-17)

Source inspection and next-work record; not performance acceptance.
Refs: ACC-002, PERF, ROOM/SEAT, revised Phase 2 P2-D/E/I/J.

## Repair checkpoint (2026-10-17)

The initial discovery audit below is retained as the before-state. A one-statement
parent/LATERAL inventory aggregate plus current amenity/cover projection is now
authored and wired (ADR 0040). Real Drizzle-driver unit regressions reproduced
101/121 calls before the repair and now assert one. Focused 44 assertions across
six suites passed; the diagnostic command still fails unchanged whole-API coverage
thresholds, so it is not package PASS. Five real PostgreSQL comparison/visibility/
claim/expiry/cancellation/EXPLAIN cases are authored and NOT RUN LOCALLY. New static,
full core, actual SQL plans and current CI verification remain pending.

The physical-option paging audit below remains outstanding and is not repaired by
this summary query. No hidden room/type/bed cap or new business default is added.

## Management page transport checkpoint (2026-10-17)

ADR0041 additive private type/room/bed pages and scoped SDK helpers are authored;
static and new tests are pending. Baseline11 HTTP cases failed404 before routing.
Four large-inventory/current-authority Testcontainers cases are NOT RUN LOCALLY.
Existing private read/UI and public physical detail consumers are still unbounded
and must migrate before this audit can be closed. No whole paging repair claimed.

## Discovery

MarketplaceRepository.list calls supplements for each selected branch. Each reads
amenities, one cover, all active room types, physical rooms and beds; dated reads
also load unreleased claims. Discovery discards returned roomTypes. B branches
therefore require 1+5B SQL statements without dates or 1+6B with dates (101/121 for
the default20 page), apart from surrounding actor/transaction work. Parent paging
does not bound child inventory materialization. Favorites reuse this list path.

Replace discovery materialization with bounded aggregate summaries and batched
amenity/eligible-cover projection. Retain integer paisa, price filters, range/expiry,
whole-room/bed conflicts, null availability without dates and exact public-parent
visibility. Prefer a coherent SQL snapshot over selected IDs and bounded results.
Reuse existing publicListingCondition and tested conflict semantics. Cover eligibility
must match gallery publication plus clean/private/configured-bucket/purpose/digest/
MIME/size checks. No per-branch application query loop or invented counts.

## Physical option paging

Private inventory has four branch-scoped but unbounded collection reads. Public
details also materialize complete room/bed/claim collections. Correction to the earlier audit: the public-room amenity helper bounds100
amenities per type, not the number of type IDs. No101-type rejection was
reproduced. Larger branches still need genuine paging of the currently unbounded
physical collections, without a hidden business cap or silently omitted rows. Add explicit option
continuation and client controls with exact branch/object scope. Permissions-only
consumers should not load complete physical inventories to decide access.

## Required proof

Retain existing tests. Add multi-branch query-budget/empty/malformed/cursor cases,
100+ option cases and real PostgreSQL comparisons for both modes, inactive/archive,
whole-room/bed overlap, released/expired holds, half-open boundaries and price filters.
Real withdrawal, public privacy and transaction/concurrency acceptance remain
mandatory. SQL construction units cannot replace them. This document implements
no runtime optimization or pagination repair.
