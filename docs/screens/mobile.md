# Screens: Customer Mobile App (`M-xx`)

### Customer presentation refresh (2026-11-11)

MKT-001 / BKG-001 / AUTH-C: Customer discovery opens with search and results, followed
by campus shortcuts, comparison and recent listings. The filter sheet has a compact
header and a clear action. Hostel details place room availability before secondary
contact and service actions. Booking summaries group the stay dates, and payment
proof retains the hostel verification requirement. Notifications use a compact read
action. The native Customer Account tab groups links to bookings, stay history,
saved hostels, visits, waiting list, messages and support. Profile editing,
security and eligible workspace actions are available directly below the customer
actions. Profile opens in read-only mode after completion, with an Edit icon.
Saving from Account reloads the stored details and returns to that view. The Admin
switch requires an active assignment, the Owner switch requires Owner capability
and verified email, and Manager branches require an assignment.
After check-in, an open stay exposes the existing Resident services in this tab
(STAY-001).
The web Customer account, profile, security and public discovery use the same emerald
surface tokens with responsive grids and compact search filters.

M-05 approved revision (2026-10-28): Nature Glass branding/card replaces Welcome
Back and its subtitle. Stacked HSM/house-bed/HOSTEL MARKETPLACE sits directly above
the card. Email/Phone icons and labels, solid emerald Sign In text and outlined
guest content are centered within their controls. Identifier/password inputs stay
vertically centered and left-aligned for entry; recovery stays right-aligned.
Signup, guest, recovery and invited-Manager routes use existing handlers. See
[device validation](../hsm-login-nature-glass-implementation.md). This revision
supersedes the older M-05 visual instructions below, without changing auth contracts.

Rules: [`../08-screens.md`](../08-screens.md). APIs: `docs/api/01–04`. 📊 = funnel analytics event.

## Onboarding & account

| ID   | Screen                             | Content / actions                                                                                                                                                                                                     | API                                          | SRS                      |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------ |
| M-01 | App start / session restore        | Restore SecureStore and read live profile; valid sessions enter an authorized space, otherwise Login. Final splash polish deferred.                                                                                   | `/auth/refresh`, `GET /me`                   | SEC-001, CHG-006         |
| M-02 | Welcome (superseded in Phase 1)    | Promotional entry is replaced by M-05 Login; guest access remains an explicit action.                                                                                                                                 | —                                            | CHG-006                  |
| M-03 | Email-first sign up / set password | Email only initially; after M-04 enter permanent password and confirmation. No initial profile, CNIC, birth date or phone OTP. Session saved only after password succeeds.                                            | `POST /auth/registration/start`, `/password` | AUTH-C-001..004, CHG-006 |
| M-04 | Verify email (OTP)                 | Six-digit code; resend invalidates the previous code; restart discards in-memory setup capability. Verification authorizes M-03 password setup, not an ordinary session. Existing permanent accounts return to Login. | `POST /auth/registration/verify`, `/start`   | CHG-002, CHG-006         |
| M-05 | Login                              | Email or Pakistani mobile + password; sign up, recovery, guest access and Manager activation. Preserve a safe session-ended notice. No welcome/onboarding prerequisite.                                               | `/auth/login`                                | AUTH-C, CHG-006, SEC-001 |
| M-06 | Forgot / reset password            | Email → OTP → new password                                                                                                                                                                                            | `/auth/password/*`                           | ADR 0002                 |
| M-07 | Claim my stay                      | For walk-in residents: email + claim code + set password                                                                                                                                                              | `/auth/claim`                                | RES-003, D2              |
| M-08 | Location permission prompt         | Explains why; "Allow" or "Choose area manually". Never blocks the app                                                                                                                                                 | —                                            | AUTH-C-006, SEC-004      |

## Explore (marketplace)

| ID   | Screen                   | Content / actions                                                                                                                                                                                                                            | API                                        | SRS                                 |
| ---- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| M-10 | Explore home 📊          | Search bar (area / university / hostel), city switch (ISB/RWP), quick chips: "Near me", "Near my university", Boys/Girls/Working; featured universities; recently viewed                                                                     | `/public/search/suggest`, `/public/places` | GEO-004, p.12                       |
| M-11 | Search results (list) 📊 | Compact cards (p.14): name, Verified, area, rating, "from PKR x/seat", available seats, ≤ 2 nearby universities with distance. Sort selector. Result count. Zero-result "try relaxing" chips                                                 | `GET /public/hostels`                      | p.13–14                             |
| M-12 | Filters sheet            | Location, university + distance 1/3/5/10 km, rent min–max, deposit max, category, room type/capacity, available now/date, amenities, mess, transport                                                                                         | —                                          | p.13                                |
| M-13 | Map view                 | Pins with price; tap → card. Works without map (falls back to list)                                                                                                                                                                          | `GET /public/hostels`                      | GEO-004, p.5 availability objective |
| M-14 | Hostel detail 📊         | Gallery, name + Verified, exact address + map, rating breakdown, price range + deposit, nearby places, amenities, rules, visiting hours, menu, transport, cancellation policy. Sticky actions: ♡ Save · Share · Chat · Visit · **See rooms** | `/public/hostels/{slug}`                   | p.14                                |
| M-15 | Rooms & seats 📊         | Room cards (number, type, capacity, rent/seat, deposit, amenities, photos) + seat chips: Available / Occupied / Unavailable (label + icon). No occupant info                                                                                 | `/public/hostels/{slug}/rooms`             | ROOM-004, SEAT-001, D3              |
| M-16 | Seat detail              | Room photos + **specific seat photo**, price, deposit, upfront amount, policy → "Request this seat"                                                                                                                                          | (from M-15)                                | ROOM-003/004                        |
| M-17 | Reviews                  | Rating per category, Verified Stay markers, hostel replies, report review                                                                                                                                                                    | `/public/hostels/{slug}/reviews`           | REV                                 |
| M-18 | Compare                  | 2–4 hostels side by side: rent, deposit, distance, room type, amenities, mess, transport, rating, availability                                                                                                                               | `/public/hostels/compare`                  | p.14 comparison                     |
| M-19 | Share sheet              | Parent/guardian share link (public data only) + native share                                                                                                                                                                                 | `/public/share/{slug}`                     | p.14 share privacy                  |

## Booking, visits, waiting list

| ID   | Screen             | Content / actions                                                                                                                                                                                       | API                                                     | SRS                |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------ |
| M-20 | Request to book 📊 | Summary: hostel, room, seat, **monthly rent, deposit, upfront amount, no booking fee**; move-in date; cancellation policy checkbox; permanent-address prompt if missing; "3 active requests max" notice | `POST /me/bookings`                                     | BKG-001..005, p.22 |
| M-21 | Request sent       | Status timeline + what happens next                                                                                                                                                                     | —                                                       | —                  |
| M-22 | My bookings        | Requests by status, offer-expiry countdown                                                                                                                                                              | `GET /me/bookings`                                      | BKG-006            |
| M-23 | Booking detail     | Timeline (status history), price snapshot, rejection reason, withdraw; when `payment_pending` → **branch payment accounts** + upload proof (uses M-34)                                                  | `/me/bookings/{id}`, `/invoice`                         | BKG-007..010       |
| M-24 | Request a visit    | Calendar of slots inside visiting hours                                                                                                                                                                 | `/public/hostels/{slug}/visit-slots`, `POST /me/visits` | p.23               |
| M-25 | My visits          | Status, accept reschedule, cancel; one post-visit "still interested?" prompt                                                                                                                            | `/me/visits*`                                           | VISIT-001          |
| M-26 | Join waiting list  | Room type picker, expected vacancy date if published                                                                                                                                                    | `POST /me/waitlist`                                     | WAIT-001           |

## Stays & Active Hostel (resident portal)

| ID   | Screen             | Content / actions                                                                                                                                                                                         | API                                                 | SRS                |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------ |
| M-30 | Stays home         | Upcoming stay card · **Active Hostel** card · Past stays list                                                                                                                                             | `/me/stays`                                         | STAY-001..004      |
| M-31 | Upcoming stay      | Arrival info, booking summary, hostel contact/chat. No rent or complaints yet                                                                                                                             | `/me/stays/{id}`                                    | p.24 upcoming      |
| M-32 | Active Hostel home | Hostel + branch, **Room & Seat**, rent status this month, quick actions: Pay Rent · Complaint · Menu · Notices                                                                                            | `/me/stays/{id}`                                    | STAY-002           |
| M-33 | Rent & payments    | Invoices by month with status (Due / Pending verification / Partial / Overdue / Paid), outstanding + advance, statement                                                                                   | `/me/stays/{id}/invoices`, `/statement`             | RENT-004           |
| M-34 | Pay Rent           | Invoice (month, amount, due date) → **this branch's** payment accounts (copy buttons) → proof form: method, transaction ID, date, amount, screenshot → submit. Then "Pending verification" with timestamp | `/payment-methods`, `POST /me/invoices/{id}/proofs` | PAY-001..005, p.27 |
| M-35 | Proof status       | Submitted proofs, rejection reason + resubmit                                                                                                                                                             | `/me/stays/{id}/proofs`                             | PAY-009            |
| M-36 | Receipts           | List + receipt view + download/share PDF (for parents)                                                                                                                                                    | `/receipts*`                                        | p.28, p.30         |
| M-37 | Security deposit   | Required, received, deductions + reasons, refund status                                                                                                                                                   | `/deposit`                                          | p.30               |
| M-38 | Complaints         | List with status; new complaint (category, description, photos); detail with timeline; **Accept resolution** / **Reopen**                                                                                 | `/complaints*`                                      | CMP-001..004       |
| M-39 | Mess / menu        | Weekly menu, today highlighted                                                                                                                                                                            | `/menu`                                             | SERV-001           |
| M-40 | Transport          | Routes, stops, timings, monthly charge; opt-in/out request                                                                                                                                                | `/transport/*`                                      | SERV-002, p.32     |
| M-41 | Notices            | Branch notices                                                                                                                                                                                            | `/notices`                                          | p.24               |
| M-42 | Agreement          | Current agreement text + accept                                                                                                                                                                           | `/agreement*`                                       | p.25               |
| M-43 | Checkout request   | Requested date vs notice period, emergency toggle, reason; status + final statement when done                                                                                                             | `/checkout-request`, `/checkout`                    | OUT-001..005       |
| M-44 | Write review       | Category stars + text; eligibility message if < 30 days                                                                                                                                                   | `/review*`                                          | REV-001..004       |
| M-45 | Past stay          | Read-only invoices, receipts, deposit, statement; review if eligible                                                                                                                                      | `/me/stays/{id}/*`                                  | STAY-004           |

## Messages, saved, account

| ID   | Screen                      | Content / actions                                                                                                                                                                                  | API                            | SRS          |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------ |
| M-50 | Saved hostels               | Favourites list                                                                                                                                                                                    | `/me/favorites`                | p.14         |
| M-51 | Conversations 📊            | Threads per hostel, unread badges                                                                                                                                                                  | `/me/conversations`            | COMM-001     |
| M-52 | Chat thread                 | Messages, image/PDF attachments (validated), real-time                                                                                                                                             | `/messages`, WebSocket         | p.23         |
| M-53 | Notifications               | Inbox, deep links (authorised only)                                                                                                                                                                | `/me/notifications`            | NTF          |
| M-54 | Account                     | Profile (identity fields read-only, masked CNIC), permanent address, university/employer, notification preferences, sessions/devices, change password, help & support, deactivate account, log out | `/me*`                         | p.8, NTF-002 |
| M-55 | Request identity correction | Field, new value, evidence upload                                                                                                                                                                  | `/me/identity-change-requests` | p.8          |
| M-56 | Help & support              | Tickets list + thread + new ticket                                                                                                                                                                 | `/me/support-tickets*`         | ADM-009      |
| M-57 | Report                      | Report a listing / review / message / user                                                                                                                                                         | `POST /me/reports`             | p.42         |

## Revised Phase 1 registration and profile completion (CHG-006)

Final splash and two onboarding screens deferred to pre-launch UI polish.
M-01 performs session restoration before routing. M-03/M-04 keep email verification
and permanent password setup separate; the temporary setup capability remains only
in memory. A fresh protected profile controls available experience switches.

| ID   | Screen                    | Content / actions                                                                                                                                                                            | API                                         | SRS             |
| ---- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------- |
| M-58 | Complete Customer profile | Existing verified email; required full name, Pakistani mobile contact, editable integer age 18–120 and gender; optional institution/photo. No initial CNIC, birth date or emergency contact. | `PUT /me/customer-profile`, fresh `GET /me` | AUTH-C, CHG-006 |

The implementation checkpoint exposes required M-58 fields and optional institution;
optional photo selection and resumable profile editing remain unfinished. Only live
Customer, Owner, Manager and Admin capabilities appear as switches. Owner onboarding,
private document selection and initial Customer/Owner choice acceptance remain open;
this checkpoint is not revised Phase 1 completion. Other marketplace/resident screens
above remain their later-phase baseline and are not implied to be implemented.

M-59 private Owner profile completion is implemented at `/owner-profile` inside
protected session navigation. Verified identities provide name/contact/CNIC,
private front/back evidence, address, optional organization/photo and explicit
versioned agreement acceptance. Clean scan references precede completion and a
fresh protected profile controls Owner access. M-58 now includes optional private
photo selection. Account offers Customer and Owner completion/edit actions while
experience switches continue to show only live grants. Profile prefilling and
hostel/main-branch/optional Manager setup remain unfinished. Native acceptance of
these new screens is pending; the earlier checkpoint text remains planning history.

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

### Revised Phase 1 native Owner setup (ONB-001, AUTH-M-001, CHG-006)

The authenticated Owner account now links to `/owner-setup`. Admission requires
verified email and live Owner capability; the workspace is keyed by identity.
Named, paginated organization/hostel/geography choices, private draft creation,
saved hostel/main-branch fields, retained partial saves, private clean listing-photo
logos and completeness-gated review submission use the shared typed client.
Coordinates can be entered explicitly; a visual map-pin picker remains pending.
Submitted/review/approved/suspended setups do not offer draft editing.

Owner self-management is the default. Optional invitations support automatic or
manual temporary credentials without replacing existing account credentials.
Generated credentials remain in component memory with an explicit hide action;
closing/unmounting the form discards credential retry state. Manual inputs clear
after success. Lost automatic credential recovery still requires the existing
reset API; the recovery UI below now exposes the protected reset flow. Private logo selection accepts images only,
checks clean status and deletes only the app-cache copy, as the existing upload
adapter requires. Native component checks and Android export are tracked in
STATUS; complete native/API acceptance remains required in compatible CI.
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

### M-05 login layout refinement (2026-10-13)

AUTH-C / SEC-001 / CHG-006: a dedicated safe-area, keyboard-aware scroll layout
replaces the generic stack of equally prominent buttons. One primary Sign in
action follows labelled credentials; Verify email and Forgot password use compact
48-point text targets. Create account is secondary, guest access is a text action,
and Manager activation is grouped beneath an invitation caption. All destinations,
validation and safe session-ended notices remain intact. Shared palette, spacing,
input radii and typography are used; content width is constrained on larger screens.

### M-05 user reference revision (2026-10-14)

AUTH-C / AUTH-M-005 / CHG-006: this supersedes the previous login presentation.
Login-only @hsm/ui tokens use #006B46/#00543A, #FFFEFC, #080A0B, #667080,
#E1E7E5, #DCEEDD/#CFE5D3 and #FFF1DE; existing semantic error and font retained.
Other screens keep the global palette. Original react-native-svg house/bed logo,
sage/cream curves and campus landscape are local decorative vectors, not screenshot
crops. Welcome Back, subtitle, separate Email/Phone Number/Password fields,
visibility toggle, recovery, Sign In and Sign up follow the supplied reference.
Exactly one identifier required; shared Pakistani normalization retained.

Remember me is omitted because all established mobile sessions already persist in
SecureStore and no optional persistence behavior exists. Do not add a fake checkbox.
Required guest, email verification and Manager activation remain quieter links.
No role selector, social login, CNIC login or phone OTP. Safe-area scrolling,
keyboard avoidance, wrapping text and 48-point secondary touch targets retained.
Final APK and physical visual acceptance are manual follow-up, not claimed here.

User follow-up (2026-10-14) supersedes the separate visible Email/Phone requirement:
M-05 uses the supplied Email/Phone tab selector, one active identifier and Password.
Mode changes clear inactive identifiers and validation while retaining the password;
loading disables mode changes. The Verify email action is removed from Login at the
user's explicit request. Staged email OTP registration and email recovery remain
unchanged. Guest/Manager entry remains available. No fake Remember me behavior.

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

### Branch inventory operational controls (ROOM-004, ACC-004)

Within the existing Owner/Manager branch selection, View rooms and beds opens
actual room type prices, room/bed labels and server status. An explicit inventory
grant exposes room/bed availability edits with an explicit status and reason.
Cancellation writes nothing; save waits for persistence. Current access failures
hide stale private data, while refresh outages preserve drafts with writes disabled.
Branch/account switches discard the old selection. These controls reuse existing
server SDK operations; no separate management application or local business rules.

### Public hostel rules (TRUST-006 / ACC-002)

Hostel details include actual plain-text rules with bounded Load more and Refresh
controls. Genuine empty state differs from failed/withdrawn content; failed refresh
hides cached text. Rules are live accessible UI, with no screenshot or fake policy.
New implementation and tests are authored; full renewed acceptance remains pending.

### Essential management physical pages (ROOM-002 / ACC-004, 2026-10-17)

Native branch rooms/beds now have authored next/first type, room and bed controls
through the same API05 page endpoints used by web. Reads use the verified frozen
actor client; query/cursor state binds account, branch and actual parent. Only the
selected type's rooms and selected room's beds load, with actual labels, integer
prices and unchanged ordinals. Current child permissions can restrict stale root
grants. An active availability selection or pending command blocks navigation;
entered reason/state survive refresh outages with writes disabled. Missing/denied
parents hide cached private inventory. Failed next pages permit explicit first-page
recovery. No optimistic status/booking claim is displayed.

Existing native inventory/booking assertions migrate to page/access DTOs; seven
new navigation/actor/permission/draft/failure cases are authored. Their selected
Jest verification is running; native compilation, full suites/export, native E2E
and device acceptance remain pending. The prior selected43-test result predates
this reader change. No new APK/install or phone control is performed.

## Phase 3 private Stay read checkpoint (2026-10-19)

Refs RES-001/002, STAY-002, SEC-003, ACC-004; [API17](../api/17-stay-operational-reads.md).
Selected staff branches expose Residents and stays only with a fresh stay_manage
grant. Customers access My stays through their existing workspace. Lazy bounded
pages, lifecycle filters, staff name search, explicit detail selection, loading,
empty, retry/error and success states are implemented; no financial/document data
is included. Actor/branch changes, parent access loss or failed/pending revalidation
hide private data. Read UI tests/build and real container acceptance remain pending;
this is not a completed check-in, ledger, payment or checkout screen claim.

### Owner native acceptance continuation (2026-10-29)

2026-11-02 continuation (ONB-001 / PROP-001 / SEC-003): Owner sub-screens reuse the
setup shell's compact top-left navigation/title row. Branch operation sections and
report types use horizontal selectors, preserving existing section/branch scope.
Photo tiles show preview/status and one contextual editor; full-width editing retains
caption, ordering, replacement, archive, cover and authorized publication actions.
The canonical setup list has seven steps including Policies & Agreements. Identity
photos remain unnecessary for profile/draft save and mandatory at verification submit.
Private uploads recover expired actor binding through the serialized session manager.
The actor transport reuses one identity-verified client only for its exact actor/token;
server authentication, revocation and object/branch checks still run on every API call.
See `../owner-screen-audit-20261102.md` for rendered-device evidence and open gates.

CHG-005 / ROOM-001/002: the nested branch inventory panel now offers Create
inventory. Pricing-granted actors can create room types with explicit capacity,
inventory mode, rents, deposit and disclosed fees; inventory-granted actors can
create individual rooms/beds under a named current-page parent. Existing typed SDK
and schemas retain server scope, validation, audit and idempotency. Initial physical
state is explicitly inactive unless changed. No listing approval/publication is
implied. Unknown outcomes retain their exact actor/branch/body/key across remounts;
close and paging remain locked until reconciliation. No device/API acceptance claim;
focused evidence and pending gates are in .tools/owner-acceptance and STATUS.md.

### User-approved Owner location revision (2026-10-29)

ONB-001/GEO/CHG-017: native /owner-setup initiates foreground location detection
subject to OS permission. Empty draft locations receive a starting pin; saved pins
are preserved. Latitude/longitude text fields are removed. Use my current location
and Choose on map support deliberate changes; denial or unavailable detection keeps
the map and partial draft save usable. New pin selection is confirmed, never inferred
from the map's default viewport. See SRS-v2.13 and ADR0083. Native build/device tests
are pending; this supersedes the earlier native manual-coordinate/no-location notes.

## Native Platform Admin Phase 1/2 (2026-10-29; ADM-001..004, CHG-005, SEC-003)

| Screen   | Route                  | Current Phase 1/2 behavior                                                                                                       |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M-ADM-01 | /admin                 | Fresh-capability dashboard, real Admin membership summary for Root; assigned roles for Normal; no fabricated operational metrics |
| M-ADM-02 | /admin/profile         | Own status/roles, shared account security and eligible same-identity Customer onboarding                                         |
| M-ADM-03 | /admin-invitation      | Authenticated own pending invitation; explicit acceptance then live profile refresh; not active Admin access                     |
| M-ADM-04 | /admin/admins          | Root-only bounded list/continuation and Root membership view                                                                     |
| M-ADM-05 | /admin/admins/invite   | Root-only existing-email invitation and multi-role selection/confirmation                                                        |
| M-ADM-06 | /admin/admins/[userId] | Root-only role/status/Root changes with reason, confirmation, conflicts and exact-intent recovery                                |

Admin selection navigates to real native routes. Per-user SecureStore mode preference includes
Admin without storing authority. Valid preferences are respected; otherwise Root/Normal Admin
enter /admin; non-Admin Owner default remains /owner. Staff routes recheck live permissions on
focus, clear staff query/mutation cache on exit/role loss, and retain Customer access after Admin loss.
Operational verification/support/moderation/announcements/settings remain later phases, with no broken controls.
No Android/device acceptance is implied by source/component checks.

### Native Admin landing refinement — 2026-10-30

User-directed ADM-001 presentation: Root /admin has the HSM brand and one compact
top-right Admin management button, replacing the ADMIN WORKSPACE text. The body
contains no management cards/counts/actions. The button opens Root-guarded
/admin/management with real membership summary and existing management/profile/mode
actions. Normal Admin capabilities and all backend authorization remain unchanged.

2026-10-31 user-directed correction (ADM-001/HMA-017): the earlier intentionally
empty Root main is superseded. Root main displays live platform overview and authorized
daily operations, with the compact Admin management entry retained. Team/membership
controls remain on management, which includes Back to dashboard. Existing tokens,
permissions and APIs are reused; no new business rule.

2026-10-31 premium main refinement (HMA-017): compact Root overview with period
filters, current snapshot, selected-period activity, actionable queues and a clearly
unavailable platform-income card. User deferred income tracking and excluded expenses;
no subscription/accounting change. Screenshots verified on Pixel6Pro.

HMA-017 / CHG-023 (2026-10-31): all Popular snapshot cards open Root-guarded
/admin/explorer/[kind] searchable/paged directories, with status, creation-period and
sort filters plus month/quarter/year/lifetime statistics. /[id] profiles provide
relationships and allowed existing verification/customer actions. Hostel businesses
and branches are separate; Owner and Manager have separate cards. Needs Attention
cards continue to the existing verification/support/moderation operational screens.

Root main groups platform tools under one Platform Operations card.
/admin/operations is Root-protected and reuses existing permission-gated tools;
Normal Admin workspace retains its assigned operations. ADM-001 / HMA-017.

Admin UX consolidation: Popular Snapshots starts with Awaiting verification and
includes prior attention categories. Hostel Branches is the canonical all-status
Root directory; /admin/verifications forwards Root there with pending status while
Normal Admin retains its module queue. Verification/support/moderation details use
workflow tabs and preserve mounted command state. HMA-017 / ADM-009 / TRUST-001.

App-wide navigation (2026-10-31): shared AppHeader extends the existing Admin
implementation across applicable role screens; Owner/auth primary designs retained.
Contextual search uses existing readers and preserves filters. Root management
entry is icon-only; analytics adds quarter/year/lifetime using actual account history.
See app-navigation-search-20261031.md for audited routes and acceptance evidence.
