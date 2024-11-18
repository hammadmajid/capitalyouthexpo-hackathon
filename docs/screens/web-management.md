# Screens: Management Web App (`W-xx`)

Rules: [`../08-screens.md`](../08-screens.md). APIs: `docs/api/05–08`. Scope: **Owner** sees all owned branches + "All branches". **Manager** sees only the assigned branch (no switcher, no Staff, no Audit Log, no owner-wide finance, MGRD-001).

## Access & onboarding

| ID   | Screen                   | Content / actions                                                                                                                                                                           | API                                    | SRS                   |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------- |
| W-01 | Log in                   | Email/mobile + password                                                                                                                                                                     | `/auth/login`                          | AUTH-M-005            |
| W-02 | Manager activation       | Mobile + 24 h temp password → set permanent password                                                                                                                                        | `/auth/manager/activate`               | AUTH-M-004            |
| W-03 | Forgot / reset password  |                                                                                                                                                                                             | `/auth/password/*`                     | —                     |
| W-04 | Identity sign-up         | Email → email code → permanent password; then choose Customer or Owner. No session before password setup.                                                                                   | `/auth/registration/*`, `/me`          | AUTH-C, CHG-006       |
| W-05 | Owner setup              | Private Owner profile/documents/agreement → hostel basics → main branch → self-management or optional Manager → verification submission. Later room/pricing tasks retain their phase scope. | `/me/owner-profile`, `/owner/hostels*` | ONB-001..004, CHG-006 |
| W-06 | Branch switcher (header) | Owned branches with status badges (draft / under review / approved / archived) + "All branches"                                                                                             | `/owner/branches`                      | BRN-002, PROP-003     |

## Daily operations

| ID   | Screen                         | Content / actions                                                                                                                                                                                                                     | API                                          | SRS                                 |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| W-10 | Branch dashboard               | **Today** (check-ins, checkouts, visits) · **Action queue** (oldest/urgent first) · **Live ops** (vacant seats, overdue rent, unread chat) · quick actions: Add walk-in, Review payment, Available seats, New booking, Send reminders | `/dashboard`                                 | MGRD-001, p.37–38                   |
| W-11 | Owner dashboard (All branches) | KPI tiles (seats by state, occupancy %, residents, expected/collected/outstanding), per-branch table with drill-down, **Actions required** list                                                                                       | `/owner/dashboard`, `/owner/action-required` | OWN-001..003                        |
| W-12 | Bookings queue                 | Tabs by status, expiry countdown, filters                                                                                                                                                                                             | `/bookings`                                  | BKG-002                             |
| W-13 | Booking detail                 | Customer (masked CNIC until approved), requested seat + photo, price snapshot, history → Approve (offer expiry) / Reject (reason) / Cancel / **Check in**                                                                             | `/bookings/{id}/*`                           | BKG-002..010, CHG-004               |
| W-14 | **Bed Board**                  | Floors → rooms → seat tiles: Available / Reserved / Occupied (name) / Maintenance (label + icon). Filters: building, floor, room type, state. High density on desktop, list mode on mobile. Live updates                              | `/bed-board`, WebSocket                      | BED-001..004, p.20                  |
| W-15 | Seat panel (drawer)            | Occupied → resident summary + open record. Available → New booking · Walk-in · Maintenance. History                                                                                                                                   | `/seats/{id}`                                | BED-002                             |
| W-16 | Check-in dialog                | Confirm seat, check-in time, agreement version, guardian/emergency contacts                                                                                                                                                           | `/check-in`                                  | STAY-001                            |
| W-17 | Manual resident admission      | Explicit new offline or existing branch relationship → named room/bed → effective policy and agreed terms → explicit initial billing → review/confirm. No contact merge or fabricated login.                                          | `/v1/branches/{branchId}/stays/manual`       | RES-001..003, STAY-001, CHG-009/010 |
| W-18 | Residents list                 | Active / upcoming / checkout requested / past; search                                                                                                                                                                                 | `/residents`                                 | p.25                                |
| W-19 | Resident record                | Identity (full CNIC, access logged), contacts, documents, assignment + transfer history, financial summary, complaints · Transfer · Invite to app · Start checkout                                                                    | `/residents/{stayId}*`                       | p.25, RES-004/005                   |
| W-20 | Transfer dialog                | Pick an available seat in the same branch + reason                                                                                                                                                                                    | `/transfer`                                  | RES-005                             |
| W-21 | Checkout & settlement          | Preview statement, warnings for dues, deductions (reason + evidence), refund (pending/completed) → Complete                                                                                                                           | `/checkout/*`                                | OUT-001..006                        |
| W-22 | Visits                         | Day/week schedule, requests: approve / reschedule / reject / complete / no-show                                                                                                                                                       | `/visits*`                                   | p.23                                |
| W-23 | Messages                       | Split view: threads ↔ conversation                                                                                                                                                                                                    | `/conversations*`                            | COMM-001                            |
| W-24 | Waiting list                   | Entries per room type; link to chat                                                                                                                                                                                                   | `/waitlist`                                  | WAIT-001                            |
| W-25 | Notices                        | List + editor for resident notices                                                                                                                                                                                                    | `/notices*`                                  | p.24                                |
| W-26 | Branch search (global)         | Ctrl/⌘-K: residents, rooms, seats, invoices, receipts in this branch only                                                                                                                                                             | `/search`                                    | p.38                                |

## Rent & finance

| ID   | Screen                                | Content / actions                                                                                                                                                                                                     | API                                              | SRS                   |
| ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------- |
| W-30 | **Rent Board**                        | Month selector; totals (expected / collected / outstanding / rate); seat grid by floor/room: Paid · Proof pending · Partial · Overdue · Due · Vacant (label + icon + colour); filters; bulk "Send reminder to unpaid" | `/rent-board`, `/rent-reminders`                 | RB-001..004, COLL-001 |
| W-31 | Resident rent panel                   | Invoice summary, payment history, proofs, reminder action, record cash payment                                                                                                                                        | `/invoices`, `/statement`                        | RB-003                |
| W-32 | **Payment verification (split view)** | Left: pending proof queue (oldest first). Right: resident, branch, room/seat, invoice, amount (**mismatch warning**), method, ref, dates, proof image zoom → **Approve** / **Reject** (reason codes)                  | `/payment-proofs*`                               | PAY-006..009, p.37    |
| W-33 | Record cash payment                   | Invoice, amount, method, date, ref, note → receipt                                                                                                                                                                    | `POST /payments`                                 | Q14                   |
| W-34 | Invoices                              | List by month/status; detail with items; adjustments, late fee, void item/invoice (owner)                                                                                                                             | `/invoices*`                                     | RENT-003, FIN-002     |
| W-35 | Payments history                      | Filters; receipt links; void (owner)                                                                                                                                                                                  | `/payments`                                      | p.38                  |
| W-36 | Receipt view                          | Receipt + PDF                                                                                                                                                                                                         | `/receipts/{id}*`                                | p.30                  |
| W-37 | Deposits                              | All deposits: received, deductions, refund status                                                                                                                                                                     | `/deposits`                                      | p.30                  |
| W-38 | Discounts                             | Per resident: add / revoke with effective dates                                                                                                                                                                       | `/discounts`                                     | FIN-003               |
| W-39 | Owner collection (All branches)       | Per-branch expected/collected/outstanding + combined Rent Board counts                                                                                                                                                | `/owner/collection-summary`, `/owner/rent-board` | RB-004                |

## Services, feedback, reports

| ID   | Screen           | Content / actions                                                                                                       | API                      | SRS         |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------- |
| W-40 | Complaints board | Columns/tabs: Open · Assigned · In progress · Resolved · Reopened; assign, start, resolve (note), internal notes; stats | `/complaints*`           | CMP-005     |
| W-41 | Mess & Menu      | 7-day × 3-meal grid editor; optional photos                                                                             | `/menu`                  | SERV-001    |
| W-42 | Transport        | Routes + stops + timings + charge; subscription requests (approve/reject/end with dates)                                | `/transport/*`           | SERV-002    |
| W-43 | Reviews          | Reviews + ratings; reply; report                                                                                        | `/reviews*`              | REV-005     |
| W-44 | Reports          | Report picker, filters, table preview, export CSV/PDF, export history                                                   | `/reports/*`, `/exports` | RPT-001/002 |

W-44 AUD-010 implementation checkpoint (2026-10-28): dashboard/branch report
downloads offer an explicit Filter reports panel for the selected branch. Named
building, floor, room and applicable resident choices use bounded searchable pages;
status vocabulary follows the report family. All filters share CSV/PDF paths and
existing authenticated download disclosure. Invalid dates withhold links. Actor,
branch and report changes clear dependent selections; failed lookup refresh hides
cached names and blocks exports. No UUID entry fields. Owner-wide named branch
selection beyond the dashboard choices, property metadata management controls,
table preview/export history and coordinated browser acceptance remain open;
this checkpoint does not claim the complete historical W-44 screen plan.

Later AUD-010 checkpoint: owner report filters now page the actual owned-branch
list, retain at most 50 named selections across pages and support all branches or
explicit subsets. One selected branch enables location/resident controls; changing
scope clears those dependent selections. Inventory offers Manage buildings and
floors and a Room location panel for each visible room, using existing inventory
grants, optimistic versions and explicit lost-response replay. No device storage
is added. Final Web build/regression and browser verification are running; W-44
table preview/export history remain historical planned surfaces outside this
common-filter correction's completion claim.
| W-45 | Owner data export | Full export of owned data | `/owner/exports` | OWN-004 |

## Setup & administration

| ID   | Screen                             | Content / actions                                                                                                                                                           | API                                                                          | SRS                       |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| W-50 | Hostel profile                     | Name, description, category, address + map pin, contacts + visibility, mess info; re-verification warning for major changes                                                 | `PATCH /manage/branches/{id}`                                                | TRUST-006                 |
| W-51 | Photos & media                     | Hostel / room / seat photos, moderation status, reorder, replace                                                                                                            | `/photos*`                                                                   | ROOM-003, TRUST-003       |
| W-52 | Rooms & seats                      | Building → floor → room tree; room editor (type, capacity, amenities, price with effective date); seat list (label, publish toggle with "photos missing" hint, maintenance) | `/rooms*`, `/seats*`                                                         | ROOM-001..005, PROP-*     |
| W-53 | Duplicate room                     | Source room + target numbers/range, collision preview                                                                                                                       | `/rooms/{id}/duplicate`                                                      | p.17                      |
| W-54 | Pricing history                    | Price timeline per room; add a future price                                                                                                                                 | `/rooms/{id}/prices`                                                         | p.18                      |
| W-55 | Bulk import                        | Download template → upload → row-by-row validation → commit                                                                                                                 | `/imports*`                                                                  | p.16–17                   |
| W-56 | Rules, visiting hours, policies    | House rules; weekly visiting hours; cancellation policy versions; agreement versions                                                                                        | `/rules`, `/visiting-hours`, `/cancellation-policies`, `/agreement-versions` | p.14, p.21, p.25          |
| W-57 | Payment accounts                   | Bank / JazzCash / Easypaisa / Raast / card / cash details                                                                                                                   | `/payment-methods*`                                                          | PAY-003                   |
| W-58 | Branch settings                    | Reservation expiry, upfront requirement, partial payments, due day, grace, late fee, notice period                                                                          | `/settings`                                                                  | BKG-006, FIN-002, OUT-001 |
| W-59 | Verification                       | Status, review reasons, readiness checklist, documents upload, submit (owner), history                                                                                      | `/verification*`                                                             | ONB-001..004              |
| W-60 | Staff & permissions (owner)        | Managers per branch; appoint (temp password shown once); suspend / reinstate / fire; reset temp password                                                                    | `/managers*`                                                                 | AUTH-M-_, MGR-_           |
| W-61 | Organisations & brands (owner)     | Organisations, brands, create branch, archive branch                                                                                                                        | `/owner/*`                                                                   | BRN-001                   |
| W-62 | Audit log (owner)                  | Filterable trail                                                                                                                                                            | `/audit-log`                                                                 | AUD-002                   |
| W-63 | Notifications                      | Inbox                                                                                                                                                                       | `/me/notifications`                                                          | NTF                       |
| W-64 | My account                         | Profile, password, sessions                                                                                                                                                 | `/me*`                                                                       | —                         |
| W-65 | Subscription _(deferred, CHG-003)_ | Placeholder: "Free during launch"                                                                                                                                           | —                                                                            | CHG-003                   |

## Revised foundation acceptance (CHG-006)

W-04 is wired to staged email registration. W-66 Customer completion at
`/app/customer-profile` collects full name, verified email context, Pakistani contact
phone, editable adult age, gender and optional institution through
`PUT /me/customer-profile`. It refetches live identity/capabilities before entering
Customer space. No initial CNIC, DOB, emergency contact or phone OTP is required.
Optional photo selection, initial experience choice and W-05 Owner setup UI remain open.
Login and signup preserve only validated protected destinations; authorization is checked
again after authentication. The shell shows only live valid experience switches.

W-05 private Owner profile completion is available at `/app/owner-profile`.
Verified identities select private CNIC front/back files, wait for clean scans,
provide identity/contact/address details and explicitly accept the versioned
Owner foundation agreement. Optional Customer and Owner avatars use the same
private upload workflow. File IDs and signed capabilities are not shown in forms.
Hostel/main-branch setup and optional Manager invitation screens remain unfinished.

### Resumable private profile editing (AUTH-C, CHG-006)

Customer and Owner forms read `GET /v1/me/profile-details` for the signed-in
identity before displaying editable controls. Loading and failure states cannot
submit an empty replacement; failures offer an explicit retry. Saved name, contact,
gender, adult age/institution or Owner address prefill ordinary fields. Edits are
not overwritten by background query results. Private evidence and optional avatar
references are retained unless replaced; file IDs are not displayed. Owner edits
show only the CNIC ending, require CNIC re-entry and fresh versioned agreement
acceptance. Query state is ephemeral, keyed by identity and cleared on unmount or
logout. Client and container acceptance evidence is tracked in STATUS.md.

## Revised Phase 1 Owner setup implementation (CHG-006)

The Owner management space now includes private hostel setup after verified Owner
profile completion. Owners choose named owned organizations and saved hostels
from paginated private API lists, create a draft, resume its saved details, save
hostel basics/main-branch progress, upload a clean private listing-photo logo,
and submit complete details for review. City, area and optional sub-area choices
come from the active geography API; UUID entry is not required. Coordinates can
be entered explicitly; a visual map-pin picker remains unfinished.

Submission displays current review status and closes draft editing while review
is pending. Submission never approves or publishes a listing. Owners self-manage
by default; optionally invite a Manager with automatic or manual temporary
credentials. Generated credentials are shown in memory for the response and can
be hidden; manual credentials clear after success. Closing the flow discards
credential retry state. Existing-account invitations preserve the account's
password and require its authenticated acceptance. Lost automatic credentials
require the existing reset API; the Owner recovery UI below now exposes this protected flow.

Queries and mutation keys live only within the signed-in flow. Safe errors offer
explicit read retries. Saved forms retain active edits after saves/refreshed
metadata. Component tests exercise actual forms; complete browser/API acceptance
and native parity remain required before revised Phase 1 completion.
Final splash and two onboarding screens deferred to pre-launch UI polish.

Phone-only active Managers can verify an email from their account space before
Customer/Owner profile completion (AUTH-M, CHG-006, ADR 0025). The form asks for
email and current password, then a six-digit email proof. It keeps step data only
in memory, removes password input at the proof step, supports fresh self-status
reconciliation after an uncertain response, and clears proof on restart. Errors
remain generic. Verification preserves the same identity and sessions; it grants
no Customer/Owner capability until the existing profile completion succeeds.

Owner invitation recovery (AUTH-M-003, CHG-006): named paginated pending Manager
choices use the existing private branch-scoped listing and temporary-credential
reset API. Automatic/manual replacement preserves backend passwordless-only
eligibility; permanent account passwords cannot be reset. Issuance and reset have
separate in-memory retry intents. Close/mode/selection changes and unmount discard
secrets and late responses. Generated replacement credentials are shown only for
the fresh response and can be hidden; idempotent replay cannot recover them.

### Revised Phase 1 Owner pin selection (ONB-001, CHG-006)

The private Owner setup main-branch form supports an explicitly opened MapLibre /
OpenFreeMap picker (ADR 0026), visible attribution and manual coordinates. A map tap
previews a pin; confirmation updates only latitude/longitude. Cancellation/load
failure preserves the complete draft. Saving and submission use the existing scoped
APIs. Map selection does not publish a branch or request device location.

### Phase 2 minor listing editor (W-50)

Branch management lazily reads GET `/v1/branches/:branchId/listing` and pages
GET `/v1/marketplace/amenities`. Scoped `listing_edit` controls PUT, with quoted
If-Match and a version/body-bound idempotency key. Display actual saved fields;
never copy private account contact into the public listing. Conflicts preserve
the draft until explicit reload. Definitive access denial hides private content;
actor/branch changes reset it. Major identity/location/category edits retain the
TRUST-006 re-verification requirement and are excluded from this minor editor.

### Phase 2 controlled gallery (W-51; authored, verification pending)

The gallery loads only when opened and displays actual branch-scoped active,
archived or all image metadata with bounded cursor paging. A listing grant controls
attachment, editing/publication, cover selection and archival. Use the existing
private upload/validation/scan component; a pending scan is resumable and cannot
be attached as clean. Attachment stays private until a separate publication edit.
Cards use only the controlled public stream for eligible published previews and
show an honest fallback when that stream denies access. No storage credential or
generic private download URL appears in the gallery.

Version conflicts and network failures preserve image drafts/reasons; explicit
reload replaces stale input. Removed or archived targets cannot become a new
attachment. Definitive scope denial hides cached private content; actor/branch
changes remount state. Success follows validated persisted responses only. Cover
selection changes display order without publication; archival retains history.
The gallery module is wired into branch management after regenerated SDK
verification; its full web checks remain pending. See ADR 0033 and STATUS.md for current evidence.

### Phase 2 Owner Manager permissions (ACC-004, CHG-008)

Branch inventory exposes Manager permission configuration only when the server's
canConfigureManagers flag is true. Actual paginated named assignments precede
saved-grant reads and explicit checkbox replacement or total revocation. Refresh
outages retain drafts and disable changes; scope rejection hides stale controls.
Identical failed retries keep their command key. Detected changed saved values
require explicit reload. The backend Owner-only GET and audited idempotent PUT
remain authoritative; no flag enables pre-confirmation private Customer-document
access. Current web verification and real integration acceptance are pending.

Gallery publication capability clarification (ADR 0034): canEdit permits private
draft attachment/edit/archive. canPublish additionally requires the existing
media_publish grant, and controls publication, published-image editing/archive
and cover selection. A revoked capability preserves the open draft but blocks its
submission. Server authorization and replay checks remain authoritative; UI flags
never grant access. CHG-008 Owner-only Customer-document access remains unchanged.

### Independent room-type amenity editor (ROOM-002 / ACC-004; authoring)

The scoped lazy module loads current named room-type selections and actual
listing-edit authority. Editing uses approved catalog pages plus retained retired
choices, separately from pricing. Version conflicts preserve drafts until explicit
reload; outages disable writes, while denied scope hides stale selections. Account,
branch and room changes remount the module. Exact matching persisted scope/selection
is required for success; identical failed retries retain their command key and
explicit cancellation clears it. New UI/tests are authored but module wiring and
full verification are pending. See ADR 0036; no feature PASS is claimed.

### Room amenity inventory entry point (ROOM-002, ACC-004)

Each actual active room type card opens its own lazy amenity module, bound to
actor, branch and room type. Current server canEdit controls mutation access;
pricing permissions do not imply listing-amenity authority. Archived types omit
this active editor entry point. Current selected metadata wins over older catalog
pages, so retired selections remain visible and remove-only. Save uses original
version/If-Match plus stable retry identity; conflicts require explicit reload.

### Phase 2 scoped hostel-rule editor (TRUST-006 / ACC-004 / AUD-001)

The current branch workspace includes View hostel rules. This lazy panel supports
actual active/archive cursor pages, read-only grant state, explicit rule text/order,
current-row editing and archival with reason. Save requires current server authority;
a version conflict preserves the draft and offers Reload current hostel rule.
Ordinary outage preserves input/key for retry; denied scope hides cached controls.
Cancellation performs no write. Account/branch changes discard the editor and late
responses. Rule text stays escaped and never configures executable booking policy.
Implementation authored; refreshed UI acceptance is pending.

### Scoped physical inventory pages (ROOM-002 / ACC-004, 2026-10-17)

The existing branch inventory panel uses independent type, selected-type room and
selected-room bed pages (API05 / ADR0041). Next/first controls retain actual labels,
prices, status and bed ordinals. Root/type/room cursors are account/branch/parent
scoped. Only the selected children load; no inventory business cap. Physical edits
and pending requests disable page navigation. Separate listing/gallery/Manager
panels remain mounted while physical pages load, and an open settings panel locks
navigation until explicitly closed. Definitive scope denial hides cached private
metadata. Network outages retain drafts with submission disabled until refresh.

Web29 focused assertions pass; complete642-test suite and existing configured
coverage pass. The full Web command failed production typechecking on an exported
test-helper inference; an explicit portable annotation is authored and pending
recheck. Initial-error/denied-settings lock recovery is under additional regression
work. Block target selectors and public option views still require paging; this
entry does not mark the full inventory or Phase2 acceptance gates complete.

## Phase 3 private Stay read checkpoint (2026-10-19)

Refs RES-001/002, STAY-002, SEC-003, ACC-004; [API17](../api/17-stay-operational-reads.md).
Selected staff branches expose Residents and stays only with a fresh stay_manage
grant. Customers access My stays through their existing workspace. Lazy bounded
pages, lifecycle filters, staff name search, explicit detail selection, loading,
empty, retry/error and success states are implemented; no financial/document data
is included. Actor/branch changes, parent access loss or failed/pending revalidation
hide private data. Read UI tests/build and real container acceptance remain pending;
this is not a completed check-in, ledger, payment or checkout screen claim.

### Phase3 W-17 admission revision (ADR0064/0065)

W-17 uses an explicit scoped relationship and actual operational inventory. Current stay_manage, rent_manage and finance_view grants are required before manual financial terms can be submitted. Present the effective policy and approved catalogue facts, exact agreed PKR amounts, start/end dates and deliberately selected initial rent/fee periods for review. Use labelled dates and the canonical planners for period previews. Missing configuration, unavailable/changed inventory and denied access disable submission; server time and transaction checks remain authoritative. A deposit amount is an agreement term, never proof of receipt or a Paid state. Retry one unchanged intent with the same command key and retain uncertain submissions for reconciliation.

The original v1 W-17 plan—CNIC/phone/email identity lookup, automatic linked-existing/new-unclaimed selection, seat, contacts, deposit and confirmation via `/residents/walk-in`—is retained here as superseded planning history. CHG-009 replaces automatic matching and unclaimed logins with explicit branch relationships. Booking check-in remains a separate workflow that preserves original quoted terms and required evidence/upfront verification; confirmation alone never implies occupancy.

Guarded admission API/client source and local verification are tracked in STATUS.md. The full W-17 UI and real container acceptance remain pending; this screen revision does not enable a production mutation route or claim completed UI acceptance.

### W-17 admission billing review source (2026-10-21)

STAY-001 / RENT-003 / FIN-004: admission review components require explicit billing starts for rent and every disclosed fee, preserve independent fee calendars and exact paisa, and require confirmation before emitting a command. Unknown outcomes freeze the command for the same-intent retry; changed actor, branch or agreement resets review. The parent resident/target/terms workflow, native UI and actual acceptance remain pending. These components do not activate the production route.

W-17 resident/submission components (2026-10-21): source provides an explicit offline profile or named existing relationship from bounded branch Stay-history pages, without contact merging or raw relationship ID input. Submission checks all three current stay/rent/finance grants and retains reviewed command/key/labels after an uncertain response. Verified success is separate from failed list refresh. Target/terms wiring, native flow, final local checks and actual container acceptance remain pending.

W-17 target/agreement components (2026-10-21): source presents explicit named active room/bed choices constrained by branch and room-type mode. Changing physical room membership/status clears the old room; changing bed-page content clears only the bed. Agreement entry requires explicit original dates, exact PKR rent/deposit and a policy-permitted deliberate open-ended choice. Fees and approved catalogue unit prices are separately selected; unit-price disclosure does not issue a charge or approve payment. Policy/access changes discard unsent form values. Nine target and nineteen agreement cases are authored in the current complete web retry; no full gate PASS is claimed. Parent paging/current-policy/catalogue loading and composition, native UI and real acceptance remain pending.

W-17 composition source (2026-10-21): AdmissionWorkflow connects resident → named physical target → original agreement → explicit billing review/submission using a shared current triple-grant access query. It discards unsent draft stages after access loss and retains the submission component/command through refresh or changed host metadata; scope changes remount the workflow. Ten composition cases are authored. Actual paged inventory/current policy/catalogue host loading, production mounting, native workflows and real acceptance remain pending; the production mutation guard remains in place.

OWN-003 / MGRD-004 / AUD-009 partial: Payment proofs count opens a named authorized branch's existing submitted-proof review queue after live finance_view verification. Other dashboard destinations and deep-link routing remain pending.

AUD-009 partial booking action: Booking requests count opens a named live booking_manage-authorized branch and the existing review queue with server-side pending_requests pagination. Other action destinations, complete Owner paging and direct-link navigation remain pending.

W-10 / W-11 / AUD-009 runtime: Owner/Manager dashboard actions open canonical
`/app/{owner|manager}/queues/{bookings|proofs|overdue|complaints|checkouts}` paths,
optionally followed by the exact branch UUID. Unselected scope pages actual branch
names20 at a time and rechecks destination grants. A selected branch remains in
the path across reload/sign-in; unsupported paths fail closed. Existing proof and
booking controls remain available; overdue uses canonical invoice details,
complaints use exact complaint controls, checkouts use existing Stay records and
lifecycle controls. Unknown commands lock item close/paging. Losing authority
hides cached private rows and controls. Owner dashboard table/branch choices page
at100 with complete scoped totals; queue branch pages remain independently bounded.
