# API 02: Public Marketplace (`/public`)

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Rules: GEO-_, §6–7 search/filters, TRUST-_, SEAT-001, BR-05.

**Hard rule:** public DTOs are separate types that **cannot** carry resident identity, rent status, internal completeness scores or the reasons a seat is unavailable. Only `approved`, non-hidden, non-archived branches are returned.

## Geography & reference places

| Method | Path                                | Scope  | Purpose                                                        | SRS          |
| ------ | ----------------------------------- | ------ | -------------------------------------------------------------- | ------------ |
| GET    | `/public/cities`                    | PUBLIC | Active cities (Islamabad, Rawalpindi)                          | GEO-001      |
| GET    | `/public/cities/{cityId}/areas`     | PUBLIC | Area tree (zone → area/sector → sub-area)                      | GEO-002      |
| GET    | `/public/places?type=university&q=` | PUBLIC | Universities / offices / business hubs                         | GEO-003      |
| GET    | `/public/places/{slug}`             | PUBLIC | One place, for university landing pages                        | p.12         |
| GET    | `/public/search/suggest?q=`         | PUBLIC | Autocomplete across areas, places, hostels (aliases + trigram) | p.12 aliases |

## Hostel search

`GET /public/hostels`: PUBLIC. Filters combine with AND (p.13).

| Param                           | Type                                                                          | Notes                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `cityId`, `areaId`, `subAreaId` | uuid                                                                          | Location filters                                                                                                       |
| `placeId`                       | uuid                                                                          | University/office; distance measured from its coordinates                                                              |
| `lat`, `lng`                    | number                                                                        | Current or map location (GEO-004). Never stored                                                                        |
| `radiusKm`                      | 1 \| 3 \| 5 \| 10                                                             | Needs `placeId` or `lat/lng`                                                                                           |
| `minRentPaisa`, `maxRentPaisa`  | int                                                                           | Matches **actual room/seat prices** (p.13)                                                                             |
| `maxDepositPaisa`               | int                                                                           |                                                                                                                        |
| `category`                      | boys \| girls \| working_male \| working_female                               |                                                                                                                        |
| `capacity`                      | int                                                                           | Seater size                                                                                                            |
| `roomTypeId`                    | uuid                                                                          |                                                                                                                        |
| `availableNow` / `availableOn`  | bool / date                                                                   | ≥ 1 publicly selectable seat                                                                                           |
| `amenities`                     | csv of codes                                                                  | AC, attached bath, wifi, laundry, parking, cctv, backup_power, geyser, cupboard, study_table, cleaning, drinking_water |
| `mess`, `transport`             | bool                                                                          |                                                                                                                        |
| `sort`                          | recommended \| nearest \| price_asc \| price_desc \| rating \| most_available | p.13                                                                                                                   |
| `cursor`, `limit`               |                                                                               |                                                                                                                        |

Card response item (p.14 compact card):

```json
{
  "id": "…",
  "slug": "abc-boys-hostel-f8",
  "name": "ABC Boys Hostel",
  "verified": true,
  "category": "boys",
  "area": "F-8",
  "city": "Islamabad",
  "rating": 4.7,
  "ratingCount": 52,
  "startingFromPaisa": 1200000,
  "availableSeats": 3,
  "nearby": [
    { "placeName": "NUML", "distanceKm": 1.8 },
    { "placeName": "FAST", "distanceKm": 3.2 }
  ],
  "distanceKm": 1.8,
  "coverPhotoUrl": "https://cdn…"
}
```

- `availableSeats` is `null` when availability is stale/unknown (p.14 card freshness).
- **Recommended** ranking (organic only): relevance, real availability, verified, filter match, rating, completeness, freshness, owner response performance (p.13). No paid ranking.
- Zero results → `200` with `data: []` + `relaxSuggestions: ["maxRentPaisa", "radiusKm"]` (p.13).

## Phase 3 public comparison (p.14 / ACC-002)

Both Explore screens select two to four distinct current listing identities.
The shared SDK reads the existing anonymous `/marketplace?ids=...` source with
limit4 and independent room-type pages with limit20. It preserves selection order,
checks exact source identities and rejects partial/duplicate/foreign responses.
An optional complete stay range is applied to every transport. Undated counts
remain unknown; no cached inventory count becomes an assertion of availability.
Each column pages its own room types instead of loading physical room/bed arrays.
Current rent, deposit, capacity, room amenities and branch amenities use source
integer-paisa values. A listing or type refresh failure suppresses stale result
facts until a successful retry. Selection/date/destination changes clear results.

An optional approved university destination is re-read from the public institution
source (bounded first100, offered choices from the existing first20 home list).
Distances use the source coordinates and the mean-Earth-radius haversine formula;
the UI explicitly labels these straight-line distances, not road/travel routes.
An unavailable destination fails the comparison instead of guessing coordinates.
Future-domain menu/transport/review data has truthful unavailable states, as the
Phase3 directive permits; no rating, proximity or service claim is fabricated.
There is no comparison mutation, new privileged endpoint or database migration.

## Phase 3 public family summary (p.14 / SEC-003)

Web `/share/{branchId}` renders a guardian summary in HTML before client
JavaScript. This supersedes the planned slug-based share transport below: reuse
the existing scoped-public overview, room-type pages and rule pages through the
generated SDK, with no new private or aggregate inventory endpoint. Each request
is uncached, anonymous and bounded to20 types/rules; explicit next/first links
page larger collections. Only the UUID and validated public continuations occur
in URLs. Unknown query fields fail closed. Server fetches use the configured API
origin, omit credentials and reject redirects. Hidden/unapproved/missing listing
results become404; failures show an unavailable state without old listing facts.

Web share-sheet/clipboard actions and native sharing construct only the canonical
public link. Native `EXPO_PUBLIC_WEB_URL` is a public HTTP origin locally and must
be explicitly HTTPS for deployed builds, alongside the existing API origin.
No customer profile, booking, receipt, payment or chat data enters this workflow.
It presents current published prices/deposits, verified location, amenities and
rules. Menu/transport/review source is still absent from this summary; this is an
explicit remaining Phase3 gap, not fabricated content or complete share acceptance.

## Hostel detail

| Method | Path                                     | Scope  | Purpose                                                              | SRS                |
| ------ | ---------------------------------------- | ------ | -------------------------------------------------------------------- | ------------------ |
| GET    | `/public/hostels/{slug}`                 | PUBLIC | Full listing                                                         | p.14               |
| GET    | `/public/hostels/{slug}/rooms`           | PUBLIC | Rooms + seats with public status and photos                          | ROOM-004, SEAT-001 |
| GET    | `/public/hostels/{slug}/reviews?cursor=` | PUBLIC | Published reviews with the Verified Stay marker + management replies | REV                |
| GET    | `/public/hostels/compare?ids=a,b,c`      | PUBLIC | Normalised comparison of 2–4 hostels                                 | p.14 comparison    |
| GET    | `/public/share/{slug}`                   | PUBLIC | Parent/guardian summary (also rendered as a web SSR page)            | p.14 parent share  |

Detail includes: name, verified badge, exact address + coordinates (p.12), public contact (only if `showPublicContact`), category, description, gallery, amenities, rules, visiting hours, current cancellation policy, mess/menu (week), transport routes, directional departures and the branch billing-policy offer when configured (SERV-001/002, CHG-046), rating breakdown by category, nearby places with distances, deposit range, and "starting from" price.

Rooms response:

```json
{
  "data": [
    {
      "roomId": "…",
      "roomNumber": "203",
      "roomType": "3 Seater",
      "capacity": 3,
      "pricingModel": "per_seat",
      "monthlyRentPaisa": 1200000,
      "securityDepositPaisa": 1200000,
      "amenities": ["ac", "attached_bath"],
      "photos": [{ "url": "…" }],
      "seats": [
        {
          "seatId": "…",
          "label": "B1",
          "status": "occupied",
          "selectable": false,
          "photoUrl": null
        },
        {
          "seatId": "…",
          "label": "B2",
          "status": "available",
          "selectable": true,
          "photoUrl": "…"
        },
        {
          "seatId": "…",
          "label": "B3",
          "status": "unavailable",
          "selectable": false,
          "photoUrl": null
        }
      ]
    }
  ]
}
```

`status` ∈ `available | occupied | unavailable` (D3). `selectable` = publicly bookable (photos present, branch approved). No resident identity or previous occupant data, ever (SEAT-001, p.7).

### Revised Phase 2 approved amenity catalog

`GET /v1/marketplace/amenities?cursor=<code>&limit=20` is public and returns only
active platform-approved `{ code, name }` entries with an actual nextCursor.
Limit is 1–100; cursor is a controlled lower-case code, not a branch/customer ID.
Unknown query scope fields fail validation. An empty catalog stays empty; clients
must not invent options. Retired codes retained in private configuration must not
satisfy public search filters. This route and real database cases are authored,
not yet verified; no real-container PASS is claimed.

### Bounded photo gallery (ROOM-003 / ACC-002 / SEC-003)

Listing summaries/details carry at most one eligible cover preview. The anonymous
GET /v1/marketplace/:branchId/gallery endpoint supplies all eligible published
photos through cursor pages: limit 1..100 (default 20), cursor canonical order:UUID.
Response: branchId, data [{id, altText}], nextCursor (null when exhausted).
A valid empty gallery returns an empty page; unavailable parent branches return
opaque 404. Only current approved, visible, active branch/city/brand/organization
and clean configured-bucket listing-photo snapshots are eligible. No private
file IDs, keys or signed URLs are exposed. Image bytes use the existing controlled
marketplace media endpoint with fresh eligibility and integrity verification.
See ADR 0035. Real infrastructure verification remains pending.

### Public room-type amenities (ROOM-002 / ACC-002 / SEC-003)

Each detail room option includes required `amenities: [{code, name}]` (max 100,
unique controlled codes). Missing collections are invalid responses; a successfully
queried empty association is represented by an actual empty array. Only currently
active approved catalog names are public. Private selection metadata such as
isActive, association scope and versions is not included. A single bounded query
loads associations for all actual detail type IDs; discovery does not load these
associations and no per-room request/query is introduced. Malformed, duplicate,
foreign-type or oversized metadata fails closed. See ADR 0036. Current new source
and real-container verification remain pending.

### Paged informational hostel rules (TRUST-006 / ACC-002 / SEC-003)

`GET /v1/marketplace/{branchId}/rules` is anonymous and no-store. Query is strict:
`limit` 1–100, default 20; optional canonical `sortOrder:UUID` cursor. Response is
`{branchId, data: [{id, body, sortOrder}], nextCursor}`. Each rule is plain text,
1–4000 characters; clients escape it and preserve meaningful line breaks. No
private revision, actor, archive metadata or audit reason is public. Current
approved/unhidden/active branch, brand, organization and city eligibility is checked
in the same bounded SQL statement as the rules read. A genuinely empty visible
parent returns `[]`; unavailable/withdrawn parent returns opaque 404. Continuation
never imposes a total rule cap. Every fetched row, including the continuation
probe, must be ordered and unique. Web/native views hide cached text after an
unsuccessful refresh. See ADR 0039. Local/real acceptance remains in progress.

### Coherent discovery aggregates (ACC-001/002 / BKG-004/006 / PERF)

Discovery and Saved reuse one bounded public parent statement with LATERAL
inventory/amenity/cover projections. The response contract is unchanged. Integer
price minima and matching availability counts are computed by PostgreSQL; no
physical room/bed/claim arrays are transferred and discarded per selected hostel.
Preserve configured per-mode price bounds, half-open dates, released/expired claim
handling, whole-room/bed conflicts, active/archive state and null undated counts.
Parent eligibility, current approved amenities and one eligible cover share the
statement snapshot. Cover eligibility reuses the gallery's bucket/purpose/private/
scan/digest/MIME/size requirements. Exact decimal aggregate text is validated before
safe integer conversion. Malformed, unsafe, duplicated, disordered or foreign
requested-ID metadata fails closed, including the continuation probe.

The original 20-hostel regression reproduced 101/121 executed statements; unit
Drizzle-driver checks now enforce one. Five real PostgreSQL comparison/visibility/
hold/expiry/cancellation/plan cases are authored and NOT RUN LOCALLY. Construction
and projection units cannot establish SQL-plan/runtime or real transaction PASS.
See ADR 0040; complete renewed core and real CI acceptance remain pending.

## P2-S1 public detail transport revision (2026-10-18)

The implemented unreleased v1 route `GET /v1/marketplace/{branchId}` now returns
public overview metadata and global SQL aggregate prices/counts, without nested
`roomTypes/rooms/beds` arrays. This explicitly supersedes the earlier nested draft
shape. Both applications and the generated SDK must migrate in this same change.
Private/occupant/rent/document disclosure remains prohibited. See ADR0042.

Physical option routes (PUBLIC, no-store, limit20 default/100 maximum, UUID cursor):

- `GET /v1/marketplace/{branchId}/inventory/pages/room-types`
- `GET /v1/marketplace/{branchId}/inventory/pages/room-types/{roomTypeId}/rooms`
- `GET /v1/marketplace/{branchId}/inventory/pages/rooms/{roomId}/beds`

Each page identifies branch and child parent, `data` and nullable `nextCursor`.
Supply complete `moveInDate`/`moveOutDate` together for date-specific room/bed
availability; undated availability is unknown (whole-room disabled remains false).
A canonical cursor is a stable UUID position; if its old row is withdrawn, continue
strictly after that position. Malformed cursors400, unavailable parents404. All
continuation rows, including the extra probe, are validated before slicing.
Room type pages include exact integer-paisa prices/deposit and active public
amenities. They have no physical arrays. Rooms expose ID/label/wholeRoomAvailable;
beds expose ID/label/available. Page lengths are not hostel totals. Parent/public
withdrawal must hide stale client data; no background fetch-all or hidden cap.

### Mandatory room and bed photos (ROOM-003/004 / SEAT-002, ADR 0070)

Public room pages list only rooms with at least one published clean room photo;
bed pages list only beds that also have their own published clean bed photo. Each
row carries `photoIds` (1–12) for `GET /marketplace/media/{mediaId}`. The same rule
governs direct room scope, discovery aggregates, `availableOnly`, quotes, automatic
allocation, holds and booking requests (unphotographed targets return 404). The
hostel gallery excludes room and bed photos.

### Organic sorting, deposit/seater/option filters and fee disclosure (p.13 / BKG-003/005, 2026-10-25)

`GET /marketplace` adds `sort` (`recommended | nearest | price_asc | price_desc |
most_available`), `maximumDepositPaisa`, `capacity` (seater 1–64) and `optionKind`
(`bed | room`). Rent, deposit, seater and option-kind filters must all match the same
selectable option. `nearest` requires `universityPlaceId` or a `nearLatitude`/`nearLongitude` point (CHG-034, with `radiusMeters`); `most_available` requires
stay dates. Recommended orders by selectable inventory, then real dated
availability, then straight-line proximity — no paid ranking. Rating sort is not
offered until verified reviews exist; mess/transport filters wait for the services
domain. Sorted pages return an opaque canonical keyset cursor
`<sort>:<integer keys>:<branch UUID>` that is rejected for another sort; unsorted
search keeps its UUID cursor. Public room-type pages now include `fees` (current
dated version or configured fees), matching what quotes charge.
