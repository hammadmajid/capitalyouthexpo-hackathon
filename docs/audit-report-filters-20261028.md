# AUD-010: Report filter applicability and implementation plan

Requirements: SRS v2.0 p.39, RPT-001/002, RES-004/005, SEC-003. This is an
implementation plan, not a completed feature or acceptance claim. Q20/ADR0079
records the user's delegated assignment-timing decision.

2026-10-28 checkpoint: property hierarchy/management API and SDK prerequisite is
committed and pushed as `0c1b13c`. Report predicates and typed client serialization
are now implemented and undergoing full regression verification; Web hierarchy
management and named report selectors remain pending. The initial RED evidence
below describes the state before implementation, not current API behavior.

Latest checkpoint: `e0c2d37` adds selected-branch named selectors and removes the
owner report's dashboard enumeration ceiling. Full API 2350 tests passes. Owner
named branch subset paging and inventory property-management controls are now
implemented with focused tests; final Web regression/build and an extended actual
browser Journey 8 are in progress. The earlier pending statements remain history.

| Report                | Location source                                                 | Resident scope                                                  | Status vocabulary                                                       |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Occupancy             | Physical room at snapshot date                                  | Not applicable to aggregate physical capacity                   | Existing bed occupancy states                                           |
| Residents             | Stay assignment at report end date                              | Branch resident relationship                                    | Existing Stay states                                                    |
| Bookings              | Booked room                                                     | Not applicable before admission creates a resident relationship | Existing booking states                                                 |
| Rent collection       | Invoice Stay assignment at report end date                      | Invoice Stay's resident                                         | Canonical invoice financial states                                      |
| Outstanding dues      | Invoice Stay assignment at report end date                      | Invoice Stay's resident                                         | Canonical invoice financial states, then outstanding eligibility        |
| Payment history       | Assignment at payment event date                                | Payment Stay's resident                                         | No invented payment status; approved receipt facts remain authoritative |
| Security deposits     | Stay assignment at report end date                              | Stay's resident                                                 | Stay state already present in this report                               |
| Checkout history      | Assignment immediately before checkout closure                  | Final statement Stay's resident                                 | Existing final Stay states                                              |
| Complaints            | Recorded complaint room, preserving its immutable location fact | Complaint Stay's resident                                       | Existing complaint states                                               |
| Transport subscribers | Stay assignment at report end date                              | Subscription Stay's resident                                    | Existing subscription states                                            |

Location filters are building/floor/room predicates. Bind identifiers to live
authorized branches before report work; validate parent-child compatibility.
Use existence predicates or bounded canonical projections to avoid duplicate
rows across historical assignments. Apply all applicable filters with AND
semantics before row ceilings or totals; reject unsupported combinations rather
than accepting and ignoring them. Keep defaults unchanged.

For a date-only payment fact, document deterministic selection within its
Karachi calendar day and test transfers on that date. Checkout must retain the
departing assignment when its `endedAt` equals the statement event time.
This narrows assignment selection; do not rewrite canonical financial history.

The deployed schema has rooms and assignment history but no buildings, floors
or room-to-floor reference. The baseline schema (06 §3.4) describes this missing
hierarchy. Implement it as a separate prerequisite with generated migrations,
branch-composite foreign keys, authorized/audited management and bounded named
lookups. Preserve legacy rooms without fabricating building/floor identities.
Do not claim those filters complete while their domain records cannot be managed.

Then update validated contracts, service/controller/OpenAPI, scoped predicates,
canonical aggregate readers, SDK and Web selectors. Use actual authorized names;
do not make users enter internal UUIDs. Preserve Mobile scope. Verify defaults,
each filter, combined filters, empty/invalid/foreign IDs, revoked grants,
owner multi-branch selection, transfer timing and JSON/CSV/PDF parity.

Remaining selector dependency: resident-directory reads require `stay_manage`,
while financial reports require `finance_view`. Do not broaden directory access
to implement a finance report filter. Provide bounded minimal name/ID lookup
under the selected report's existing authority and permitted fact scope, with
no directory profile/current-room/linked-account payload. Retain archived
identities needed by historical reports. Revalidate live grants and branch scope;
all named selectors must fail closed on access loss and reset dependent selection
when their branch/parent changes. Property management writes use existing
`inventory_edit`, version checks and retained-command recovery.

Initial RED: `.tools/audit-010-contract-red.log`, six valid-filter queries fail
as unrecognized keys; six invalid/default assertions pass, exit 1. No production
filter code or hierarchy migration has been changed yet.

AUD-010 final Web verification (2026-10-28): 138 files / 1029 tests PASS,
configured coverage PASS (L/S 99.76%, F 98.85%, B 97.72%), exit 0,
12m51.453s (`.tools/audit-010-web-final-regression.log`). Final lint/typecheck/build
3/3 PASS, exit 0, 2m22.758s (`.tools/audit-010-web-final-verification.log`).
This includes the additional stale-archive and owner paging/access-loss cases.
The first browser attempt failed while Docker was stopped; its failure remains
recorded (`.tools/audit-010-browser-final.log`). Docker was started and the
unchanged Journey 8 retry is running; browser acceptance remains unconfirmed.

AUD-010 real Chrome Journey 8 retry PASS, one selected scenario, zero failures or
skips, exit 0, 2m52.687s (`.tools/audit-010-browser-docker-ready.log`). Disposable
Docker/API/Web flow exercises actual building/floor creation, room classification,
named combined report filters, authoritative CSV response and browser download.
Default private reporter retained; no timeouts or coverage thresholds changed.
This is selected journey evidence, not the complete 19-journey acceptance suite.
