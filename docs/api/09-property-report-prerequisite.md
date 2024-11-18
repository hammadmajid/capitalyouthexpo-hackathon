# Property hierarchy prerequisite for report filters

Requirements: PROP, RPT-001/002, SEC-003; AUD-010. Implementation and acceptance
are in progress. These management resources do not by themselves implement report
predicates. Until those predicates are connected, requests with the new report
filter fields fail explicitly with `VALIDATION_FAILED`; they are never ignored.

All routes are authenticated under `/v1/branches/{branchId}/property`. Branch
authority is rechecked in the backend transaction. Reads expose actual bounded
metadata with `Cache-Control: no-store`. Writes require the existing
`inventory_edit` grant, a valid `Idempotency-Key`, cookie CSRF where applicable,
and a mandatory hostel audit. Replays recheck live grants and exact object scope.

| Method | Suffix                            | Contract                                              |
| ------ | --------------------------------- | ----------------------------------------------------- |
| GET    | `/buildings`                      | `propertyBuildingPageSchema`                          |
| GET    | `/floors?buildingId=`             | `propertyFloorPageSchema`; exact building is required |
| GET    | `/rooms/{roomId}/location`        | `propertyRoomLocationSchema`                          |
| POST   | `/buildings`                      | `propertyBuildingInputSchema` → building, HTTP 201    |
| POST   | `/floors`                         | `propertyFloorInputSchema` → floor, HTTP 201          |
| POST   | `/buildings/{buildingId}/archive` | `propertyArchiveInputSchema` → archived building      |
| POST   | `/floors/{floorId}/archive`       | `propertyArchiveInputSchema` → archived floor         |
| PUT    | `/rooms/{roomId}/location`        | `propertyRoomLocationInputSchema` → current location  |

Pages use a UUID cursor, `limit` 1..100 (default 20), optional literal name
`search`, and `view=active|all`. Floors remain scoped to one selected building;
search is literal, so `%` and `_` do not become SQL wildcards. Responses carry
branch and parent IDs and named rows; clients must validate exact response scope.

Archival and room-location corrections require `expectedVersion` and an explicit
reason. Stale versions return 412; archived targets/parents reject new writes.
Archival retains all referenced records. A completed command may replay after
its target/parent becomes archived, provided current actor/grants/object scope
remain valid; it must not create a duplicate or require the old write version.
No hard-delete route is exposed. Room-location changes are metadata corrections,
not physical admission/transfers or changes to money and booked quotes.
Archiving this metadata does not close rooms or remove their existing availability;
use the existing room/inventory lifecycle controls for that operational action.

Migration 0059 is additive and leaves legacy rooms' floor unknown. New managed
building/floor versions and room-location versions begin at 1. See its migration
note. Typed SDK helpers and backend predicates/OpenAPI are implemented and verified
at their recorded checkpoints. Web inventory now offers Manage buildings and
floors, named bounded parent pages, create/archive forms and per-room location
correction/clear controls. These require live `canEdit` and current versions;
unknown results retain the original command/body/key for explicit replay across
remounts. Stale edits retain the entered reason and require explicit version reload.
Metadata access loss hides cached parent choices and write controls; a refresh
outage retains entered drafts while disabling saves. None persist to disk.
Room corrections confirm the matching authoritative refresh before displaying
success. Final Web regression/build and coordinated browser acceptance are in
progress; this is not a declaration that AUD-010 acceptance is complete.
