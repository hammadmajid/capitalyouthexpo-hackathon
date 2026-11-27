# Screens: Platform Admin (`A-xx`) & Public Web Pages (`P-xx`)

P-02 continuation (2026-10-25): `/share/{branchId}` is the normal public family
summary route, superseding the planned `/h/{slug}/share` path in the baseline
table. Current public location, prices/deposits, room types, amenities and rules
render on the server without a session. Independent bounded next/first links page
room types and rules. Web/native listing details share only this canonical URL.
Menu/transport/review data, maps, app deep links and final browser/device acceptance
remain open; the existing API sources enforce public-listing eligibility.

Rules: [`../08-screens.md`](../08-screens.md). APIs: `docs/api/09` (admin), `docs/api/02` (public). Admin screens show only modules the admin's roles allow. Root-only items are marked ★.

## Platform admin (`/admin`)

| ID   | Screen                   | Content / actions                                                                                                                                                                          | API                                              | SRS                |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------ |
| A-01 | Admin log in             | Email + password (MFA-ready, ADM-006)                                                                                                                                                      | `/auth/login`                                    | ADM-002            |
| A-02 | Overview                 | Queue counts: verifications, photos, reports, tickets; platform KPIs (★ full metrics)                                                                                                      | multiple                                         | —                  |
| A-03 | Verification queue       | Submitted / under review / changes requested; filters by city/age                                                                                                                          | `/admin/verifications`                           | TRUST-001          |
| A-04 | Verification review      | Snapshot vs last approved (diff), owner identity (access logged), documents, photos, pricing, deposit, map location, completeness → Approve / Request changes (per-field reasons) / Reject | `/admin/verifications/{id}*`                     | TRUST-002, ONB-002 |
| A-05 | Branch directory         | Search branches; status; suspend listing / hide / restore (reason)                                                                                                                         | `/admin/branches*`                               | ADM-007            |
| A-06 | Photo moderation         | Grid of pending photos → approve / reject with reason                                                                                                                                      | `/admin/photos*`                                 | TRUST-003          |
| A-07 | Reports queue            | User reports by target type; assign                                                                                                                                                        | `/admin/reports`                                 | p.42               |
| A-08 | Report detail            | Target summary, evidence, **chat context with justification** (logged), resolve + actions                                                                                                  | `/admin/reports/{id}*`                           | COMM-002           |
| A-09 | Review moderation        | Reported reviews → hide / remove / restore (policy reason)                                                                                                                                 | `/admin/reviews*`                                | REV-006            |
| A-10 | Users                    | Search (masked CNIC); user detail; warn / suspend / ban / reinstate                                                                                                                        | `/admin/users*`                                  | p.42               |
| A-11 | Identity change requests | Evidence + approve / reject                                                                                                                                                                | `/admin/identity-change-requests*`               | p.8                |
| A-12 | Support tickets          | Queue (priority, status), thread, internal notes, assign                                                                                                                                   | `/admin/support-tickets*`                        | ADM-009            |
| A-13 | Announcements            | List, compose (audience, schedule), cancel                                                                                                                                                 | `/admin/announcements*`                          | ADM-010            |
| A-14 | Geography                | Cities, area tree editor, places (universities/offices/hubs) with map pin, aliases                                                                                                         | `/admin/cities`, `/areas`, `/places`, `/aliases` | GEO-001..003       |
| A-15 | Amenities ★              | Master list                                                                                                                                                                                | `/admin/amenities`                               | p.13               |
| A-16 | Admins ★                 | Admin list, invite, roles, suspend/deactivate (root cap 3, min 1)                                                                                                                          | `/admin/admins*`                                 | ADM-001..004       |
| A-17 | Marketplace metrics ★    | Funnel and conversion                                                                                                                                                                      | `/admin/metrics/marketplace`                     | RPT-003            |
| A-18 | Operations metrics ★     | Response times, expired requests, setup completion, rent tracking use                                                                                                                      | `/admin/metrics/operations`                      | RPT-003            |
| A-19 | Owner performance        | Slow-response / expired-request flags                                                                                                                                                      | `/admin/owner-performance`                       | RPT-004            |
| A-20 | Platform audit log ★     | Append-only trail, filters                                                                                                                                                                 | `/admin/audit-log`                               | AUD-001            |

## Public web pages (server-rendered, SEO-friendly)

CHG-006 supersedes the mobile-only marketplace restriction. The web entry is guest-first and exposes currently supported public content. Listing/search/availability screens remain in their roadmap phases; do not fabricate data or APIs.

| ID   | Page                                               | Content                                                                                                                                                                     | API                        | SRS                       |
| ---- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------- |
| P-01 | Guest marketplace entry                            | Service areas, honest listing availability state, Login/Create account and protected-action entry links with validated return context. No occupant identity or rent status. | —                          | CHG-006, SCOPE-002        |
| P-02 | Parent / guardian share `/h/{slug}/share`          | Verification, location map, pricing, deposit, rooms, amenities, menu, rules, reviews. Public data only. "Open in app" deep link                                             | `/public/share/{slug}`     | p.14 parent share         |
| P-03 | Hostel public page `/h/{slug}`                     | Read-only summary + "Book in the app" (deep link / store link)                                                                                                              | `/public/hostels/{slug}`   | p.14                      |
| P-04 | University page `/near/{placeSlug}`                | Hostels near NUST / FAST / COMSATS…, distance, starting prices, app links                                                                                                   | `/public/hostels?placeId=` | p.12 university discovery |
| P-05 | Area page `/area/{city}/{areaSlug}`                | Hostels in F-8, G-10, Saddar…                                                                                                                                               | `/public/hostels?areaId=`  | GEO-002                   |
| P-06 | Legal                                              | Terms, privacy policy, cancellation/refund disclaimer (platform holds no money)                                                                                             | —                          | BR-01, p.45               |
| P-07 | Receipt share `/r/{token}` _(optional, needs API)_ | A resident explicitly shares a single receipt via a time-limited link. Needs `POST /me/stays/{id}/receipts/{receiptId}/share-links` (not yet in API 04)                     | signed token               | p.14 share privacy        |

Mobile deep links (Android App Links; iOS Universal Links later) map `/h/{slug}` → M-14 and `/near/{slug}` → M-11.

### Revised Phase 2 public discovery map

The guest marketplace offers an opt-in MapLibre/OpenFreeMap view using the same
actual approved listing pages as the cards. No device location is requested.
Only public branch coordinates, display names and available starting prices
appear on markers; markers open the same hostel detail page. Search this map
area applies validated west/east/south/north bounds to the existing API query,
preserving other filters and clearing the pagination cursor. Camera state survives
result changes. Pagination adds actual results; the map never implies exhaustive
coverage of an unloaded area. Errors preserve the card/search alternative.

### Phase 2 web Customer booking checkout (BKG-001..006, SEC-001, CHG-007/008)

Public details requests real availability/terms before mounting the Customer
checkout gate. Guest login and Customer-profile completion preserve an exact
allow-listed hostel return. Customer capability and verified email are required.
Transient identity refresh failure retains the draft with writes disabled; a
scope rejection hides private controls. Changing account, branch or quote remounts
checkout. Active writes disable quote/date/target changes.

Checkout supports explicit agreed-term/Owner-sharing consent, private permanent
address, policy-required CNIC, scanned private documents with explicit Owner
sharing, accepted-history reuse hints, verification-state paging, instant-review
blocking and optional temporary holds. Matching persisted booking responses alone
show confirmation/request references. Rent/deposits remain direct to the hostel;
no Paid or receipt state is fabricated. Existing contracts/APIs validate actual
availability, scope, evidence, snapshots and transactions. Full web checks,
real browser/API-database acceptance and CI are pending.

### Phase 2 public hostel gallery (ROOM-003 / ACC-002 / SEC-003)

Details use GET /v1/marketplace/:branchId/gallery with 20-photo continuation pages.
Render actual alt text and controlled public-media streams only. Deduplicate photo
IDs when concurrent reordering changes later pages. Show genuine empty, loading,
query error, retry and failed-image states separately. A branch change keys the
gallery separately; failed refreshed queries do not render cached images as current.
Public pages load no mobile access token and expose no private file credentials.
The summary/detail preview contains at most one eligible cover; continuation is
not a total-photo cap. Component and real-container acceptance are distinct gates;
current full UI/container verification remains pending (ADR 0035).

### Temporary genuine Recently Viewed (ADR 0038, ACC-002)

Successful completed public Details reads record at most 20 canonical viewed branch
IDs in application memory. Home requests current approved summaries for those IDs,
retains actual view order and omits withdrawn records. Empty history makes no listing
request; currently-unlisted, loading, query error/retry and failed-photo fallback are
separate states. See-all expands only actual rows. The normal logout/account-change
cache clear immediately removes history. No browser storage or backend history.
Failed refreshed details hide cached verified content, gallery and quote controls.

The Home hero consumes the clearly drawn local neutral illustration, labeled
Illustrative image. Headline/guidance remain live accessible text and image errors
preserve a branded fallback. Real listing cards/gallery never use this artwork.
Current UI component/static/visual acceptance remains pending.

### Public hostel rules (TRUST-006 / ACC-002)

Hostel details include actual plain-text rules with bounded Load more and Refresh
controls. Genuine empty state differs from failed/withdrawn content; failed refresh
hides cached text. Rules are live accessible UI, with no screenshot or fake policy.
New implementation and tests are authored; full renewed acceptance remains pending.
