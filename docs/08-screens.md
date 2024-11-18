# 08: Screen Inventory (overview)

## Transport subscribers and combined bill classification (2026-11-22 / CHG-061)

Transport Operations contains subscriber/request cards and transport-only monthly
fees. Requests opens the pending queue; subscriber cards open active subscriptions.
Routes stay in setup. Collect payment opens the Stay's combined collection form.
Private invoice/export views name rent and transport lines and remaining security
with one payable total; paid/pending security is excluded from new collection.

## Branch Operations Complaints content (2026-11-22 / UI-001 / SERV-003)

The Complaints tab opens only the complaint queue and existing complaint actions.
Do not show/fetch menu or review tools in this tab. Show a concise empty state,
loading state or request failure as appropriate. Standalone combined services
screens retain their existing contents.

## Owner Branch Operations billing entry (2026-11-22 / UI-001)

Omit the Billing chip and Billing policy panel from Owner Branch Operations.
Existing owner billing tool links return to the Bookings section. Hostel Setup's
Policies editor, Manager tools and the other branch sections remain available.
Keep the screen Back control.

## Owner Account reference layout (2026-11-21 / UI-001)

Only Owner Account uses the supplied grouped layout: live profile hero and Owner badge; Business & Setup, Access & Security, Support; separate account-deletion request and sign-out rows. Preserve Back, pending Admin invitations, conditional role workspaces, email and version. Profile deliberately appears in both the hero and main rows. Notifications uses the Owner inbox; Terms/Privacy reuse existing account information with local Back. The original Owner navigation remains Dashboard, Properties, Operations and Account. Customer Account is unchanged.

## Resident details reference update (2026-11-20, RES-004)

The mobile Residents list opens the current stay directly (latest stay for former
residents), bypassing the intermediate profile/stays selection. Preserve the
screen Back button and Android Back to the directory. Previous stays remain
available through More; residents without stays retain their contact profile.
Selecting a branch replaces its picker with the workspace, so the picker and
"Selected" banner do not remain above resident details. Back retains branch selection access.
Compact identity, full-width accommodation, stay timeline, verified payment summary
and four separate payment cards in a 2-by-2 grid follow the latest supplied reference.
Shift Bed and Collect Rent remain in the footer. A submitted proof for this stay
changes Collect Rent to Check Invoice, with an inline private picture and permission-gated
approval/rejection. Approved receipts and monthly invoices can be exported as PNG/PDF
or shared through the device chooser. View Payments opens history. Checkout excludes
bed transfers. Nested sections have local Back; the main Back remains visible on scroll.
Next Rent uses the agreed schedule and explicitly labels checkout/ended stays.
Edit moves into the anchored
three-dot popup menu and opens a modal card, preserving the overview's position.
Agreement is also in More, replacing its former overview card. Phone/CNIC/email/account
text is larger and bold. Back to residents is explicitly labelled above the identity.
The menu also retains previous stays and checkout; linked customers remain uneditable
by staff (RES-006 / CHG-009). Saving/cancelling uses the existing audited contact command.
No API, permission, financial policy or stored-record change.

## Payment Methods reference layout (2026-11-18, BKG-007 / BR-01)

Hostel Setup step 8 follows the supplied reference: a raised upfront-payment section
with real selected policy chips, account cards with method icons and archive actions,
separated Add account section, icon-led name/identifier fields and an outlined Add account.
Preserve original Back/progress/Skip navigation and the Continue draft guard. Choices and
account destinations remain live server data; residents still pay the hostel directly.

## Staff setup reference layout (2026-11-18, CHG-039)

Owner Hostel Setup > Staff uses the user-provided glass reference with the original Back,
progress and Skip header restored by user follow-up (the capsule is superseded):
Staff heading with the real loaded count, people icon, rounded staff cards with avatars
and complete role badges, outlined Add staff, and a Continue footer outside the scrolling
list. Names and roles wrap instead of truncating. Existing add/edit, Back, Skip and
Continue destinations are unchanged; salary management stays in Operations.
Skip for now stays visible on the optional Staff step and moves to Review; unrelated
Rooms drill-down params must not hide it, and its header action does not shrink.

## Manual resident account confirmation (2026-11-18, CHG-051)

AUTH-C / RES-001 / RES-004 / ACC-004. First-time mobile registration opens Customer
profile setup after email OTP and password setup. Profile save links one active
manual Stay by verified email, or creates a phone-only confirmation request.
My stays shows a pending hostel confirmation message without resident details.
Mobile and web Residents include Account requests with claimant/resident names,
matching phone and Approve account / Reject actions. The backend rechecks active
residency on decision; checked-out residents cannot request or receive a link.

## Owner profile refinement (2026-11-01)

OWN-001 / CHG-024: compact shared header, centered circular photo/camera, private
image preview, removable draft photo, moderated updates and icon-led contact form.
CNIC-photo uploads are removed from this screen and no longer required to complete
Owner onboarding. Existing identity/photo review workflows remain in Account.
CNIC number and explicit agreement remain required; no verified-owner claim is
inferred from completion. Approved-photo self-removal lacks an existing API.

## Account mode landing (2026-11-01)

AUTH-C/OWN-001: Account opens a two-card chooser (Customer Mode / Owner Mode).
Incomplete profiles use existing onboarding; authorized completed profiles enter
their dashboard and remember that mode. Per user correction, the chooser has no
settings icon. Customer Profile and Owner All spaces open the protected
account-options workspace, including notifications, help, verification, private
stays, staff spaces, security and sign-out. Standard Back returns to the previous
screen. No capability grant or API change.

SRS p.18 / BKG-004 dated pricing: both current Owner/Manager inventory browsers
mount independent bounded price-history pages and explicit dated publishing.
Publication controls require current inventory_edit plus pricing_edit; read-only
branch staff see history only. Rent, deposit and all disclosed fees are confirmed
together. Existing type configuration preserves money and links to dated prices.
Unknown outcomes retain date/body/key, lock replacement/close/navigation, and
provide retry of the original command. Failed or unavailable current reads hide
cached price facts. No booking/invoice amount is rewritten. ADR0069 and STATUS.md
record implementation and verification; final browser/device/phase gates remain.

PROP-001 CSV import continuation: current Owner/Manager inventory-edit screens
mount private scanned-CSV selection, template download/share, row validation,
bounded record preview and explicit commit-all. Failed rows prevent commit;
changed permissions or preview failure hide cached facts. Unknown commands retain
their exact key/body and lock replacement/navigation until resolved. New physical
inventory starts inactive; existing photo and availability review stays separate.
Templates use current room-type identifiers or human room numbers for bed imports.
No resident/opening-balance workflow is activated. STATUS.md records real rollback,
concurrency, audit/history, SDK and client checks; final phase acceptance stays open.

M-18 / p.14 comparison continuation: Web and native Explore mount selection for
two to four current listings, optional common stay dates and an approved university
destination. Results normalize monthly rents, deposits, capacity/room types,
amenities, dated availability and explicitly straight-line distance. Each column
has independent next/first room-type pages and a full-listing entry. New input
clears results; failed refresh hides old facts. Future-domain service/review data
remains truthfully unavailable. Current verification is recorded in STATUS.md.

Public p.14 share continuation: current hostel details expose a family-summary
action on Web and native. Web uses a share sheet when supported and clipboard
otherwise, with an always available public link. Native uses the platform share
sheet and configured Web origin. `/share/{branchId}` renders the anonymous current
overview, bounded prices/deposits and rules into HTML; no login or hydration is
required to read them. It has public pagination, canonical metadata and explicit
unavailable states. Menu/transport/review source, comparisons and final
browser/device acceptance remain pending.

PROP-001 / ROOM-002 duplication continuation: both physical inventory browsers
mount a duplication panel for the current inventory-edit authority. It selects a
room on the current page and accepts up to100 comma/newline-separated unique room
numbers. The server creates the entire batch or rejects it. Copies are inactive;
the success message directs staff to review them through the existing pages.
Uncertain results freeze the original source/body/key and require explicit retry;
page/settings navigation is held until resolution. No availability or payment
claim is inferred from copying inventory. Browser/device acceptance remains open.

VISIT-001 / NTF-002 activation (2026-10-24): the normal visit API and daily worker
follow-up scheduler now default enabled. Web follow-up notices link to the current
Customer's `visits` section; Mobile offers that destination only with the current
Customer capability. Lifecycle notices return to authorized account spaces.
Current visit components retain versioned commands, paginated history and explicit
post-visit interest responses. Real worker restart/retry and answered-after-fanout
suppression pass; final browser/device/phase acceptance remains pending.

COMM-001/002 chat continuation (2026-10-24): Web/Mobile public hostel details now
offer a Customer conversation entry point. Customer spaces mount own conversations;
selected Owner/Manager branches mount exact-scope conversations. Lists/history are
lazy and paginated; pending/failed access refresh hides private facts. Text or up to
five checked JPEG/PNG/PDF attachments can be sent. Pending scans require completion
or explicit discard before sending. Attachment access requests a fresh authorized,
audited temporary download. Uncertain create/send/read commands retain their
original payload/key and block replacement/navigation within the message panel.

Validated Socket.IO invalidations refetch REST history instead of appending event
content. Browser polling uses the same-origin proxy and HttpOnly cookies; Mobile
binds the current account before connecting and disconnects in the background.
Foreground reconnect restores history. Inbox notices offer an account message-space
destination without trusting arbitrary payload URLs. Reporting/safety access and
proactive immediate revocation are implemented in the subsequent checkpoints below;
browser/device and phase acceptance remain pending.

COMM-002 reporting continuation: each loaded private message offers a report
form with the approved reason enum and optional bounded details. Uncertain report
submissions retain the exact message/evidence/key and disable replacement.
Management Web Admins with current support/content_moderator or Root authority
can open the lazy chat-case metadata queue. Message context requires an explicit
investigation justification on each access, shows a bounded reported-message
window and offers explicit close. Queue refresh errors hide cached context;
no full-conversation admin reader or private attachment access is implied.

NTF-002 notification continuation (2026-10-24): authenticated Web shells now expose
the private inbox, matching Mobile's existing list/read capabilities. Notification
reads are lazy and paginated, and loading/error revalidation hides stale private
facts. WAIT-001 notices navigate to the current account's Customer waiting-list
section; no arbitrary external/deep-link payload is trusted.

Phase 3 WAIT-001 continuation (2026-10-24): Web/mobile hostel details mount
`waitlist-join`; Customer spaces mount private `waitlist` history/leave controls;
branch management mounts the authorized staff list. Reads load on demand and hide
cached facts during failed/pending authorization refresh. Actor/branch remounts
clear private state; uncertain mutations retain their original command/key through
list refresh. Dates are labeled as estimates, with no reservation/payment promise.
Both clients now expose actual paginated room-type preference selection and
versioned expected-vacancy editors. Editing requires current listing authority;
uncertain commands disable closing/selection while preserving original intent
through metadata refresh. Notification delivery passes real infrastructure checks;
navigation/browser and broader phase acceptance remain pending.

- **Status:** Draft v1, for review. Not yet designed visually.
- **Last updated:** 2026-10-21
- **Inputs:** SRS v2.0 (esp. p.14, p.20, p.24, p.27–29, p.36–38), `docs/07-api-contract.md`, `docs/api/*`

This lists **every screen** the MVP needs, with an ID, purpose, main content/actions, the APIs it calls and the SRS rules it satisfies. Visual design (wireframes → design system) comes next and refers to these IDs.

| File                                                         | App                                                  | Screens                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`screens/mobile.md`](screens/mobile.md)                     | Customer mobile app (Expo; Android first, iOS later) | `M-xx`: guest, customer, resident (Active Hostel)                                               |
| [`screens/web-management.md`](screens/web-management.md)     | Management web app (Next.js)                         | `W-xx`: owner, branch manager                                                                   |
| [`screens/web-admin-public.md`](screens/web-admin-public.md) | Same Next.js app                                     | `A-xx`: platform admin · `P-xx`: public web pages (parent share, university pages, app landing) |

## Screen ID rules

- `M-` mobile, `W-` management web, `A-` admin web, `P-` public web. Numbers are stable. **Never reuse an ID.** Retired screens are marked _(retired)_.
- Tickets, designs, E2E tests and analytics events reference screen IDs (`W-07 Rent Board`).

## UX rules that apply to every screen

1. **Every screen has four states:** loading (skeleton), empty (with a helpful next action), error (retry + `traceId` for support), success.
2. **Status is never shown by colour alone.** Use label + icon + colour (p.29, p.50 accessibility). Contrast meets WCAG AA. All controls have labels and work with a keyboard (web) or screen reader (mobile).
3. **Money** is displayed as `PKR 12,000` (no paisa shown). **Dates** use `Asia/Karachi`, e.g. `5 Oct 2026`.
4. **Mobile-first** for the customer app; **desktop-first, responsive** for management (SCOPE-002). Management quick actions must work on a phone.
5. **Destructive or financial actions** (reject, approve payment, checkout, void, fire manager) need a confirmation step that shows what will happen. A reason field is shown when the SRS requires one.
6. **Branch context** is always visible in management (branch switcher in the header) and persists across modules (p.38 context retention).
7. **Never show what the user can't access.** Modules without permission are hidden (p.38), and the backend still denies them.
8. **Strings are i18n keys** from day one (English now, Urdu-ready, SCOPE-003).
9. **Offline/slow network (mobile):** show cached data with an "updated X ago" label. Writes need a connection and are retried safely through idempotency keys.
10. **Analytics events** for the funnel (search → view → chat/visit → booking → approval → check-in, RPT-003) are fired from the screens marked 📊.

## Navigation maps

### Mobile (bottom tabs)

```
Explore      Saved       Stays*            Messages     Account
  │                       │
  ├ Search results         ├ Booking requests
  ├ Map view               ├ Upcoming stay
  ├ Hostel detail          ├ ACTIVE HOSTEL ──► My Room · Rent · Receipts · Complaints
  │   ├ Rooms & seats      │                   Menu · Transport · Notices · Deposit
  │   ├ Seat detail        │                   Checkout · Review · Chat
  │   ├ Reviews            └ Past stays
  │   └ Request to book
  └ Compare                         *label becomes "My Hostel" while a stay is active
```

Guests can use **Explore** fully. Saving, chatting, visiting or booking prompts login (p.6 guest boundary).

### Management web (left sidebar, p.38)

```
[Branch switcher: All branches* | F-8 | G-10 | …]      *owner only
Dashboard · Bookings · Bed Board · Residents · Rent Board · Payments · Visits · Messages
Complaints · Mess & Menu · Transport · Notices · Reviews · Reports
Hostel Profile · Rooms & Seats · Verification · Settings · Staff* · Audit Log*
```

**Separation principle (p.38):** Bed Board = occupancy, Rent Board = payment state, Residents = identity/stay record. Three different screens; never merge them.

### Admin web (`/admin`, separate layout)

```
Overview · Verification queue · Branches · Photo moderation · Reports · Reviews · Users
Identity changes · Support · Announcements · Geography · Amenities · Admins* · Metrics* · Audit log*
                                                                           *root only
```

## Totals (draft v1)

| App            | Screens |
| -------------- | ------- |
| Mobile         | 49      |
| Management web | 55      |
| Admin web      | 20      |
| Public web     | 7       |

CHG-006 revises mobile M-01–05 and adds M-58 in [the mobile inventory](screens/mobile.md). Final splash and two onboarding screens deferred to pre-launch UI polish. Live capability checks remain authoritative for every experience switch.

CHG-006 foundation revision: public web entry is guest-first; W-04 uses staged
email registration and W-66 covers Customer completion. These replace the earlier
combined identity/Owner signup assumptions. Owner setup UI and optional photo
selection remain incomplete. Final splash and two onboarding screens deferred to pre-launch UI polish.

Revised Phase 1 Owner setup on web and native includes explicit MapLibre / OpenFreeMap
pin selection with attribution, cancellation and manual-coordinate fallback (ONB-001,
CHG-006; ADR 0026). Confirmation preserves all other form values. It introduces no
location permission, geocoding or public draft disclosure.

## Revised Phase 2 customer marketplace

CHG-007 / ACC-002 / BKG-001..006: Home, Map, Saved, Bookings and Profile are the
five customer navigation destinations. Search and filters are Home controls.
Anonymous discovery, approved hostel details and date-specific availability stay
public; holds, booking submission and Saved mutations require the live Customer
capability. Preserve authentication completion and safe return paths.

The approved reference revises customer marketplace presentation only. Home uses
actual approved listings, university counts and bounded real recently viewed IDs.
Details disclose current room/bed choices and exact price/fee/deposit terms without
occupant identity or rent state. A server quote precedes hold/booking submission;
expiry, policy versions, booking mode and document requirements come from the server.
My Bookings displays persisted snapshot terms and server lifecycle state.

Implementation is in progress: standalone native reference components and typed
client/data hooks exist; route wiring, management screens, booking flow and visual
acceptance remain unfinished. This note does not certify any screen as complete.

### Phase 2 persisted notification inbox (NTF-002, SEC-003)

Mobile Account now includes a Notifications panel for the authenticated identity.
It uses `/me/notifications` with cursor pagination and server unread counts, and
`PUT /me/notifications/:id/read` with actor-bound idempotency. Read state changes
only after the server accepts them. Loading/error/empty states are distinct;
notice bodies are plain text and private payload/deep-link fields are excluded.
The query cache is scoped by current profile ID. Component verification passed within 107 mobile component tests, including a
late-account cache-isolation scenario. Native device/CI verification is pending;
this does not claim completed Phase 2 screen acceptance.

### Phase 2 Owner booking document review (CHG-008 / BKG-001 / SEC-003)

The management Owner space's selected branch now includes the pending document
review queue. It uses actual scoped paginated metadata, loading/error/retry/empty
states and Owner-only accept/reject actions with approved rejection reasons.
Explicit private-download action requests a short-lived audited URL; the temporary
link is held in component memory, cleared on expiry/branch/account unmount and
opens with no referrer/opener. Links are not stored in query cache or local storage.
A failed decision retry retains its idempotency key. Successful review invalidates
the exact account/branch queue. The section is not rendered in Manager context;
backend Owner-only scope is independently enforced. Component verification and
browser acceptance remain pending; this entry records implementation, not release
acceptance.

### Phase 2 Customer My Bookings continuation (BKG-001 / BKG-009 / SEC-003)

The native Customer account space now opens an own-history panel with real cursor
pagination, safe loading/error/retry/empty states, persisted booking/evidence
status and quoted rent in paisa. Cancellation is offered only for eligible server
states and policies, collects a reason and waits for the server response. The
server enforces cutoffs and authorization. Failed retries retain idempotency keys.
Account-keyed query and component lifetime isolation prevent late previous-account
data or local cancellation form state from populating another account. This UI
is authored and awaiting native verification; booking creation/evidence submission
UI and native acceptance remain in progress. No APK build is included.

### Native Customer discovery and checkout continuation (2026-10-16)

The Customer account's Find hostels entry opens authenticated Home, Map, Saved,
Bookings and Profile navigation. Header inbox counts come from the private server
response. Home/Saved load actual returned cursors; partial Saved pages do not imply
that an unobserved listing is unsaved. Guest browsing retains its sign-in boundary.
Actor changes remount private views and reset consent, selections and form state.

Quote details now expose Customer checkout using the exact returned policy/price
snapshot. Consent precedes private Owner sharing; resident_document selection uses
the established upload, clean-scan wait and cache-copy deletion flow. Only required
approved kinds are offered. Human review is separate from clean scanning, and
instant confirmation waits for accepted review when policy requires it. Raw CNIC
is requested only when that policy requires CNIC; it is masked in the field and
cleared after success. Holds show the server deadline, and final expiry is always
validated by the backend. Booking results show the returned lifecycle state,
including pending_request without an invented confirmation or payment.

Queries/mutations retain private data only in memory, scope keys by actor/branch,
and preserve command keys on failed retries. These new native screens and tests
are authored; lint/typecheck/component/export, device/E2E and current CI acceptance
remain pending. No completed-screen or Phase 2 acceptance claim.

### Scoped hostel booking queue (BKG-001 / BKG-004 / ACC-004)

A selected Owner/Manager branch now includes paginated actual booking snapshots
and review statuses. Mutations are offered only after branch inventory reports
booking_manage. Confirm/reject/cancel collect an explicit reason, retain retry
keys and refetch persisted state after the server succeeds. An active request is
not optimistically confirmed. No private document download is exposed here;
pre-confirmation raw evidence remains in the separate Owner-only queue (CHG-008).
Actor/branch changes remount forms and private queries. SDK responses must match
the requested branch/booking. The new queue is authored; its SDK/web tests, browser
acceptance and CI still await execution.

### AUTH-C-005: booking-time permanent address

Customer booking creation accepts optional `permanentAddress` (trimmed, 5–500
characters) only for the authenticated Customer. A valid supplied or saved address
is required before a request/instant booking is created; otherwise 422
VALIDATION_FAILED. Supplied identity updates commit or roll back with the booking.
Confirmation revalidates the saved address. Holds/history remain available without
collecting an address. Checkout collects it privately and clears it after success;
booking summaries/public listings/policy snapshots never include it. Existing
sensitive-access restrictions remain unchanged. No new migration is required.

### Phase 2 scoped management inventory

The selected authenticated branch now connects room-type pricing, physical room/
bed creation, availability changes and soft archival forms (BKG-004, PROP-002,
ACC-001/004). Inventory and pricing grants determine available actions; room-type
creation/edit/archival requires both. Backend checks remain authoritative. Forms
retain failed command values/retry keys, wait for the server and refresh exact
actor/branch inventory after success. Branch/account changes reset forms. Prices
accept rupees with at most two decimals and convert through integer arithmetic;
fee choices remain the approved catalog. The current inventory read excludes archived rows; archival removes them from the
current list after a server refresh while retaining database history and stable
bed numbers. A historical inventory browser is not implemented. Block/policy/publication/grant management UI is still pending.

### Phase 2 native account-bound requests

Protected booking/evidence/history/inbox/Saved operations now bind to the expected
screen actor: capture one bearer token, verify its server identity, then retain
that token for the operation. An account mismatch stops before private inputs or
uploads are sent. Upload scan retries bind again to the same expected identity.
Public discovery stays anonymous. This is a client precondition; live server
account, session, role and branch checks remain mandatory. Phase 2 private query/
mutation caches use immediate cleanup. Verification of this continuation is pending.

### Phase 2 manual inventory blocks

The selected branch now connects private, cursor-paginated block history with
unreleased/released/all filters. Current inventory selects exact room/bed targets;
block dates use an excluded end date and reasons remain private audit inputs.
Only current `block_manage` grants expose create/release controls. Commands retain
retry keys until success, wait for persisted responses and refresh actual history;
release does not promise availability when other restrictions remain. Actor/branch
changes clear forms and access denials hide stale data. This new UI awaits checks.

### Phase 2 booking policy configuration continuation (BKG-006, CHG-007)

A lazy private policy panel/editor is authored for Root, owned hostel, assigned
branch and active room-type scopes. It displays persisted effective and inherited
values, local override presence and server edit permission. Root must enter
complete defaults/safety limits; other scopes use null inheritance and explicit
approved document choices, including optional CNIC. It preserves identical retry
keys, waits for persisted responses, clears on actor/scope change and disables
writes during an access-refresh outage. Lazy entry points now connect Root admin, Owner hostel setup, selected branch
and each active room type. Client regeneration, static/unit/HTTP checks and
real-container acceptance are pending. No completion or release pass is claimed.

### Phase 2 Customer web booking history (BKG-001..009, ACC-004)

Customer space now connects private cursor-paginated My Bookings through existing
Self APIs. Cards use server states and immutable listing/price/policy snapshots,
show document verification status and disclose cancellation terms. Candidate
cancellations require a reason, stable retry key and exact returned booking ID /
cancelled state before updating cached records. Account changes remount private
state; revoked access hides cached views, and refresh outages retain form inputs
with cancellation disabled. The backend decides eligibility/cutoffs. This new
surface is authored, not yet verified; real integration/CI acceptance stays open.

### Phase 2 Customer web Saved continuation (ACC-002)

Customer space now includes private cursor-paginated approved Saved listings,
exact integer prices, property-detail links and persisted removal commands.
Public hostel details offer a server-backed save action after session/Customer
capability checks, or sign-in with the exact allowed hostel return path. Identical
failed commands retain idempotency keys; mismatched response IDs/intents never
show success. Account changes remount private state and denied access hides
cached Saved listings. New unit/component cases are authored; verification and
real container/browser/CI acceptance remain pending.

### Phase 2 public web discovery filters (ACC-002, BKG-004)

Home search now accepts category, decimal PKR bounds converted with integer
arithmetic, ordered stay dates and availability restricted to those dates.
University selection remains in scope while adding filters; clearing resets the
university and cursor. More-results loading retains prior approved listing
pages. Parser/form/Home cases are authored; new complete verification is pending.

### Phase 2 native branch booking management (BKG-001..009, ACC-004)

The existing Account Owner/Manager branch view now binds every lookup/action to
its verified actor. Choosing a returned scoped branch opens paginated booking
snapshots, exact agreed prices and document verification status. booking_manage
controls confirmation, rejection and cancellation with reasons and stable retry
keys; the backend decides eligibility. Pending commands wait for validated
persisted responses. Actor/branch changes clear forms, revoked access hides
stale records and refresh outages retain reasons with actions disabled. Managers
receive no private evidence download affordance. New component cases and static
checks are pending; real native acceptance remains unrun locally.

### Phase 3 own-Stay navigation (RES-001 / SEC-003, CHG-012)

Authenticated Web account and native Account surfaces expose the existing lazy My stays reader independently of Customer profile or selected Owner/Manager space. Opening the reader uses exact server-validated account/Stay ownership; navigation grants no staff or mutation permissions. Native access no longer requires opening My bookings. Absent/rejected sessions do not render private readers. Regression RED evidence and pending retries are recorded in STATUS.md.

### Phase3 approved charges management (FIN-004 / CHG-014)

The selected management branch now has a lazy Approved charges panel using API18.
Owner can create a new immutable code/name/unit/positive PKR unit price, or archive
a selected active entry with a required reason. Price display/input uses exact
integer-paisa conversion. Managers with finance_view receive a read-only panel;
the backend remains the authorization boundary. Bounded paging and an explicit
Include archived charges filter retain historical prices.

Queries are keyed by actor/branch/view/cursor with no retained unused cache.
Actor/branch changes restart the panel closed. Refresh-pending/error/unavailable
access hides cached values and commands. Mutation failures retain entered values
and same-intent retry keys; success requires the validated persisted response and
refresh. Catalogue configuration alone does not post charges or change agreements.
Current tests/build acceptance is recorded in STATUS.md; native catalogue controls pass the complete 247-test native checkpoint;
financial lifecycle screens remain pending.

### Phase3 structured billing-policy controls (RENT-003 / FIN-004)

The selected branch and each active room-type inventory card expose lazy billing
settings using the existing protected policy API. The effective source is shown;
Owners create immutable local versions, and authorized Managers see read-only
settings. Branch/type/account changes isolate query state. New policies start
blank; existing policies preserve explicit values, independent monthly-fee timing,
exact integer-paisa amounts, grace, notice and late-charge choices. Unsupported
or missing selected settings cannot submit. Saving creates configuration only;
it does not change an existing Stay agreement or post financial records.

Refresh/error/access-unavailable states hide cached private policy values and
editing controls. Failed saves retain the draft and same-intent command key;
changed effective versions require explicit reload. Open room-type panels lock
inventory paging until closed. Validation and acceptance evidence are recorded
in STATUS.md; this screen extension is not yet a verified full Web gate.

### Phase3 native approved charges (FIN-004 / CHG-014)

Selected Owner/Manager branches expose the same lazy Approved charges capability
through the existing SDK. Owners create immutable unit prices or archive an active
entry with a required reason; Managers receive read-only names and exact prices.
The panel hides cached private values during access refresh/errors, retains drafts
and retry intent after recoverable failures, and discards old selection/input on
account/branch change or close. History and continuation are explicit and bounded.
Configuration does not post financial charges. Complete catalogue checkpoint LOCAL PASS: mobile unit248/21, native247/44, normal cross-client static40/40 including Android Hermes export. Device/container/CI acceptance is separate. STATUS.md records current evidence.

### Phase3 native billing-policy controls (RENT-003 / FIN-004)

Native branch and active room-type panels now have authored lazy policy summaries and structured Owner-only version forms. Manager views are read-only. Human labels, explicit blank choices, exact PKR conversion and dependent fields use the shared SDK form model being extracted from the Web implementation. A retained draft requires reload if its effective version changes; refresh failures/access loss hide private values, actor/branch changes restart closed, and failed commands retain stable intent keys. Open type panels lock inventory paging without blocking their own read. Fourteen component regressions plus actual inventory wiring/lock verification pass in focused51/6. Normal shared-model static40/40, complete SDK504/35 and mobile248/21 pass their configured gates. Full current native/Web, real container/device and exact-source CI acceptance remain pending; Phase3 is not complete.

2026-10-20 native policy complete regression: LOCAL PASS262 tests/45 suites,
all suites unfiltered and serial,11m57s. Retains prior247 cases plus14 policy
cases and1 actual inventory wiring/lock case. Configured coverage L/S/B100%,
F84.61% (existing failure-boundary/observability collection); no claim of whole-UI
coverage. React act warnings remain visible. Source evidence:
.tools/phase3-native-policy-complete-20261020.log. This closes the native component
regression for this slice; the preceding full Web failure remains open, and no
APK/device, real infrastructure or exact-source CI PASS is claimed.

### Phase3 admission planning correction

W-17 in web-management.md now follows CHG-009/010 and ADR0064/0065: explicit branch-local relationships, scoped named inventory, agreed policy/amounts and initial billing review. Automatic contact merging/unclaimed logins are superseded planning history. Guarded API/SDK source does not establish completed staff/native UI or container acceptance; see STATUS.md.

### Room and bed photos (ROOM-002/003/004, ADR 0070, 2026-10-25)

Web management inventory: every current room and bed row has a lazy scoped
"Room N photos" / "Bed X photos" gallery reusing the listing gallery editor, grants
and retained command keys, with the selectability rule stated inline. Web and
Mobile public inventory options show each room's photos and each bed's own photos
above its quote action. Mobile management photo editing is not yet available.

W-10/W-11 AUD-009 action queue paths and paging are recorded in [Web management](screens/web-management.md). Database/browser evidence and remaining verification are in STATUS.md; implementation does not imply Phase 11 acceptance.

### HMA-015 controlled profile reviews — 2026-10-31

When feature metadata enables profileReviews, ordinary Web/Native accounts show correction/photo submission, private proof upload, confirmation and own case history. Admin management contains Root identity and Root/content-moderator photo queues, private purpose, evidence, confirmed decision/history and current-photo cases. Minimal Native Root landing remains unchanged. See docs/srs/SRS-v2.18-profile-reviews.md (CHG-022).

### 2026-10-31 Platform Admin rendered refinement

HMA-017/ADM-001/GEO-003: existing directory records are whole-row drill-downs;
cohort cards use two columns, optional data notes and compact refresh. Existing
policy fields are grouped in mounted Defaults/Rules/Limits tabs. Institution
create/edit uses a focused view with shared header/history-back and command lock,
returning to the existing filtered directory. No new route or API. See
[rendered inventory and evidence](admin-visual-audit-20261031.md) for inspected
screens and record-dependent visual acceptance still pending.

### User correction: statistics belong in filters (2026-10-31)

Removed standalone registration/cohort statistic cards from all9 operational
directories. Existing period filter now shows actual backend counts on its single
month/quarter/year/lifetime selector. No second period control or duplicate card.
Removed unused CohortStats component/styles after reference check. Approved main
dashboard periods are preserved. Regression:9new cases failed before fix; final
Explorer/settings19/19pass, strict Mobile typecheck pass. Physical final captures
use `final-*` filenames, superseding intermediate `after-*` directory images.

### Automatic Admin synchronization (2026-10-31)

Routine refresh controls are removed. Scoped command invalidation and route/app
focus keep existing query-backed screens current; inactive routes retain state but
pause reads. Cached content stays visible while safe background reads settle;
dashboard aggregates settle together. A single60-second foreground check covers
external changes until an authorized Admin event stream exists. Permission/cache
purge and explicit sensitive-evidence access remain. Editing forms retain original
optimistic revisions. See the consolidated Admin report for verification limits.

### Customer profile correction (2026-10-31)

AUTH-C/CHG-006: compact shared header and glass form preserve current identity;
existing name/gender are read-only, unset values are entered normally. Conflicts
show review guidance. Successful save confirms server Customer capability, remembers
Customer mode and routes directly to marketplace. See the focused profile report.
<!-- User-directed routing correction, 2026-11-01: ADM-002/SEC-001 authenticated
entry gives server-confirmed Admin capability priority over remembered modes.
Explicit Customer/Owner mode switching remains available within the session. -->

BRN-001 (2026-11-01): Building & Rooms reuses expandable building cards and a
shared floor icon/number grid; existing building/floor routes and scoped creation
forms remain active. Android acceptance is pending.

RENT-001 / LIST-001 (2026-11-01): Policies follows Amenities in the Owner wizard.
Reuses versioned billing settings and paginated branch rules with edit/archive.
Agreement document management remains implementation work; old draft route keys
remain valid and total step count is derived from shared keys.

BRN-001 / VISIT-001 (2026-11-16): Mobile Hostel Setup follows Basic Information → Location & Address → Amenities & Services → Hostel Policies & Agreements → Photos & Gallery → Visiting Hours → Building & Rooms → Staff & Salaries → Review & Submit. The overview, wizard navigation and draft resume use this order.

BRN-001 / ROOM-002 (2026-11-01): floor room cards expand to reuse existing room/bed
photo and amenity management. Exact scoped room routes remain available.

Bed detail now includes paginated occupancy history (BED-002 / RES-005). Each row
opens its original authorized stay record; compact back navigation returns to the
loaded history. Transfer and checkout refresh both bed detail and historical rows.
Android visual acceptance is pending the coordinated final gate.

Property rooms share compact bed tiles with explicit occupancy/restriction labels.
Overdue current occupancy is red, occupancy without overdue debt emerald, and empty
beds neutral silver. Financially unauthorized readers receive no debt colors.
A shared paginated editor serves cover, existing kitchen/general, room and bed galleries;
caption/order edits, clean replacement, cover selection and publication use existing APIs.
The obsolete single-photo card was removed after reference checks. Android pending.

CHG-023: Owner hostel/room amenity selectors include the organization custom catalog.
Existing listing/room Save actions assign selected custom codes through existing APIs.
Owners can create, categorize, rename and archive definitions; managers can select
within their existing listing_edit authority without owner CRUD controls. Real catalog
pagination, command recovery and cache invalidation are retained. Android pending.

STAY-002 / CHG-024: original agreement records expose a review disclosure using the
existing policy summary. Own-stay readers can explicitly acknowledge the reviewed
original version. Staff readers see acknowledgement dates without a resident action.
Commands retain retry keys and update the existing stay-record cache. Android pending.

RES-005 / STAY-002 (2026-11-02): current-bed and former-occupant history selection reuse the stay-directory detail workspace, including original stay contacts, agreement versions, authorized invoices and lifecycle actions. Back returns to the existing bed/history selection. Closed financial statements respect finance/checkout grants.

STAY-002 / CHG-025: Policies and branch billing workspace reuse OwnerAgreementTemplate for versioned text and a checked private document. Original-stay details lazily expand AgreementDocuments for paged scanned evidence and original-template downloads. Resident and authorized staff share the workflow; uploader ownership, live branch/self scope and scan checks remain server-enforced. Original text appears during agreement review. No device verification is claimed yet.

BED-002 / RES-005 / CHG-026: bed details show actual property location and server overdue status, and available beds open the existing exact-bed manual admission under all admission grants. Shared stay workspace shows a fixed circular approved resident photo/default avatar, original agreements and finance-authorized last approved payment/next issued invoice due information. Shared mutation invalidation covers bed/history/residents/dashboard/financial views. One Pakistan-midnight timer plus foreground recovery refreshes dated facts; no added polling.

STAY-002: original Stay agreement versions load in bounded descending pages, including original versions beyond50. Accommodation/lifecycle sections render once while older agreements append. Every page keeps the original branch/stay scope and acknowledgement/document references.

## Booking and payment update (CHG-055, SRS v2.36)

Booking offers optional separate monthly transport and re-quotes on selection.
My Stay payment defaults to remaining security plus up to 12 open bills; security
alone and partial totals are supported. Show security, bills and total separately;
block excess. Staff review shows security and remaining agreed security. One
approval creates one receipt. Included transport has no extra charge.

## Hostel Setup follow-up (2026-11-20, CHG-056 / ROOM-002 / BED-001)

Building & Rooms creates per-bed inventory only. Add Room asks the monthly rent
for each named physical bed; Add Bed asks its own rent. Room details remove the
shared Room Rent editor; Bed details contains the scoped dated Bed Rent editor.
Existing whole-room records/history remain supported by the API.
Building, floor, room and bed rows expose accessible pencil menus with Edit name and Delete to inventory
editors. Confirmation precedes existing audited archive commands; room confirmation
mentions its beds, parent removal requires children cleared, live claims are guarded,
and history is retained. Failed commands remain visible with existing retry recovery.

Follow-up: the pencil opens Edit name and Delete for all four hierarchy levels.
Names update the existing record with branch permission, expected-name conflict
checking and audit; room/bed IDs, ordinals and financial snapshots are retained.

## Add Room simplification (CHG-057 / ROOM-002)

Supersedes the CHG-056 Add Room count/deposit/batch-bed entry. Native Add Room asks only room number and photo; its photo picker omits repeated labels/file hints. Add Bed retains its own name, rent and photo. Room size derives automatically from installed non-archived beds, including occupied/maintenance beds. Security is entered for the selected resident/bed during admission using the existing agreement field.

## Per-bed security field (CHG-058 / BED-001 / RES-001)

Native Add Bed shows Bed name, Monthly rent, Security deposit (explicit 0 for none), and Bed photo. The existing per-bed editor changes both dated presets. New native admission defaults follow the selected bed and remain editable for agreement confirmation. Public bed options show their exact security, with from wording on per-bed type summaries. Historical agreement capture on web still requires original agreed amounts; no paid state is inferred.

## Shared native entry controls (CHG-059 / UI-001 / SEC-003)

Money/quantity fields group thousands during typing and preserve canonical form
values. Private editable photo previews expose a top-right pencil for Replace and
Delete; choose controls include icons. Customer/Owner profile deletion is staged
until Save and sends explicit null. Gallery changes retain existing permissions,
archive operations and required-image guards. Cancel/rejected replacement keeps
the previous clean image; submitted financial proof remains immutable.

## Staff form ownership (2026-11-21 / CHG-039 / UI-001)

Hostel Setup > Staff is the single native entry point for employment and salary
terms. Add Staff optionally captures the initial monthly salary/pay day together
with the new staff record. Edit Staff shows the server-authorized current/latest
salary with a pencil opening amount, pay day and effective-month controls.
Suspend/reactivate and Remove are contextual confirmed actions requiring a reason;
Remove ends employment and retains salary/payment/agreement history. Suspended and
removed records stay reachable in Setup, with status icons. Ended records have no
reactivate or new-salary action. Operations retains salary history, payment
collection/reversal and agreements; remove its salary/status edit controls.

Use existing scoped/versioned/audited/idempotent commands. Never reprice issued
months or create salary payments from a salary-terms change. No API, authorization,
financial policy or database migration changes are introduced.

## Add Resident CNIC camera (CHG-060 / UI-001)

Put a camera touch target at the CNIC field's right edge. Open the private image
picker on tap; show selected-photo preview and its contextual pencil controls in
the existing glass dialog. Keep the CNIC number readable and separate, with its
normal completion feedback. No extra card/helper paragraph in the resident form.
Block Confirm during upload/scan. Cancel discards a pending unsaved selection;
only a clean selected image is linked by the actual admission command.

### Owner Dashboard reference layout (OWN-001..004, 2026-11-22)

Reuse existing Owner scope, notifications, draft resume, quick actions and four tabs.
Show branch/month selectors, selected-month collections with category details, six
real calendar buckets, occupied/available beds, salary/outstanding/overdue cards and
Bookings/Payment Proofs/Transport Requests/Upcoming Checkouts/Messages/Complaints.
Queue cards open the corresponding existing scoped Branch Operations tool; multiple
branches use the branch picker. Missing additive metrics display unavailable, never
a sample value or a fabricated zero. All money remains integer paisa from the API.

### Dashboard dues links reuse Operations (OWN-004 / RES-004)

Due Amount opens the existing Residents tab with its Due filter and selected invoice
month. Overdue Amount opens that same list with all-month overdue filtering. Staff
Salary Due opens existing Staff & salaries with Salary due selected. Users can clear
or change filters; opening a matching resident/staff profile uses existing detail
views and preserves filters on return. Multiple branches retain the branch picker.

### Usable Owner income chart (OWN-004, 2026-11-22)

Tap a month column to inspect its exact receipt-backed amount, including zero months.
The selected callout applies that month to the existing dashboard filter on request;
previewing points does not fetch or change other totals. Default to the newest
available point; a changed range cannot display a stale selected month. Keep native
accessible targets, selected state, readable labels and vertical page scrolling.
