# SRS Change Log (deviations from SRS v2.0)

## CHG-024 � Owner onboarding photo evidence (2026-11-01)

User explicitly requested CNIC photos be optional for now and delegated the scoped
migration decision after its exact effect was explained. [SRS v2.20](SRS-v2.20-owner-profile-evidence.md)
makes Owner CNIC-photo references optional, retaining existing records and mandatory
CNIC number, verified identity, agreement and supplied-file security checks.
Profile completion never certifies verification or approves/publishes a hostel.

## CHG-023 — Root operational directories (2026-10-31)

User explicitly requested working dashboard drill-downs. [SRS v2.19](SRS-v2.19-admin-explorer.md)
adds Root-only metadata directories, audited profiles, calendar cohorts and relationship
navigation using existing tables. Existing financial/branch/privacy protections remain;
no resident identity/evidence exposure, impersonation, new roles or financial mutation.
Payments are receipted non-reversed hostel aggregates; occupancy is current placements.
No migration. Platform-income tracking deferred; expenses excluded.

## CHG-021 — Audited institution reapproval and customer enforcement (2026-10-30)

User-authorized HMA-015 completion. [SRS v2.17](SRS-v2.17-admin-governance.md)
records material institution reapproval/reasons/history and the customer-only enforcement
boundary, version conflicts, session revocation and preserved retry intent. Existing tables
provide the durable audit; no new migration. Existing 0062 rollout and new identity/photo
review schema remain blocked pending explicit authorization. Supersedes no Owner,
financial, Root-membership or privacy protections.

## CHG-020 — Complete authorized Platform Admin operations (2026-10-30)

User-directed Phase 3–6 implementation. [SRS v2.16](SRS-v2.16-platform-admin-completion.md)
records current-record verification evidence scope, explicit audited private access,
atomic Owner decision notices, exact report-linked moderation, complete bounded staff
readers, metadata-only audit/aggregate boundaries and protection against effective Root
lockout through customer governance. Existing authoritative roles/state machines remain;
no invented telemetry, subscriptions, impersonation, resident evidence widening or money
movement. Migration note inside; no live migration/backfill/credential change authorized.
Minimal Root landing preserved. Implementation in progress; final acceptance pending.

Implementation supplement (2026-10-26): [SRS v2.11 booking upfront verification](SRS-v2.11-booking-upfront-verification.md)
realizes the existing v2.0 p.21–22 payment-before-confirmation lifecycle without a new
booking-state enum value (sub-status on captured terms). No pricing, authorization or
retention rule changes; migration note inside. ADR 0071.

Implementation supplement (2026-10-25): [SRS v2.10 effective marketplace prices](SRS-v2.10-effective-marketplace-prices.md)
records realization of the existing p.18/BKG-004 rule and its additive migration
note. It is not a new approved deviation or a financial-history adjustment.

SRS v2.0 (p.2) requires that any change to pricing, authorisation, booking state, rent state, data retention or public disclosure is versioned rather than silently implemented. This file is that record until a formal SRS v2.1 is issued.

**Rule:** where an entry here conflicts with SRS v2.0, **this file wins**. Everything else in SRS v2.0 still applies.

| ID      | Date       | SRS refs affected                                                                                                     | Change                                                                                                                                                                                                                                                                                                                                          | Decided by              |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| CHG-001 | 2026-10-06 | p.5 (Native apps deferred)                                                                                            | The customer marketplace is a **mobile app** (Expo React Native), Android first, iOS later. Management stays web.                                                                                                                                                                                                                               | User                    |
| CHG-002 | 2026-10-06 | AUTH-C-002, NTF-001, SEC (OTP)                                                                                        | Customer login is **email/mobile + password**. **Email OTP** is used for verification (signup, password reset). **Mobile SMS OTP is deferred**: the mobile number is collected but not OTP-verified in the MVP. Email is sent via **Hostinger SMTP** with custom branded templates.                                                             | User                    |
| CHG-003 | 2026-10-06 | BRN-003..006, SUB-001..006, BR-02, ACC-005, ADM (Billing Admin), OWN-001 (subscription status), p.38 Subscription nav | **Subscriptions and billing are deferred.** At launch the whole system is **free**, including management. No trials, no read-only expiry, no Billing Admin workflow. The data model keeps a per-branch plan/status field (default `free`) so subscriptions can be added later without restructuring.                                            | User                    |
| CHG-004 | 2026-10-06 | Q6 (privacy, SEC-003)                                                                                                 | **CNIC is collected at profile creation** (as per AUTH-C-001). Branch management sees a **masked CNIC** (last 4 digits) plus name, gender, university/employer on a booking request. **Full CNIC and permanent address** become visible to that branch only once the booking is **Approved**, or when management adds/links a walk-in resident. | User delegated → Claude |

## CHG-005 — Client capability parity (2026-10-07)

**Approved by:** User, Phase 1 continuation prompt. **Refs:** CHG-001, p.5–6,
AUTH-C, AUTH-M, SEC-001. Both mobile and web will support future Customer, Resident,
Owner, Manager and Admin workflows through one identity, API, database and domain
rules. This supersedes the initial exclusive customer-mobile/management-web split.
Platform-specific UI differs; backend authorization does not. Phase 1 implements
only authentication and capability-aware shells, not later product workflows.
**Migration note:** no database or permission migration; existing grants remain
simultaneous and server-authoritative. See ADR 0006.

## CHG-006 — Revised Phase 1 authentication and onboarding (2026-10-10)

**Approved by:** User, revised Phase 1 completion prompt. **Version:** SRS v2.1
supplement. **Refs:** AUTH-C-001..004, AUTH-M, OWN-001, MGR-004, SEC-001, SEC-003.
The [approved supplement](SRS-v2.1-phase-one-supplement.md) defines email -> OTP ->
password registration, editable customer age instead of DOB, customer CNIC deferred
to booking-confirmation KYC, owner profile/private documents/agreement, minimum
hostel/main-branch setup and optional owner-only manager invitations. It supersedes
CHG-004 only for initial customer CNIC collection; secure CNIC/disclosure controls
remain. One identity retains simultaneous capabilities. Web becomes guest-first;
mobile enters authentication/session routing. Final splash and two onboarding
screens deferred to pre-launch UI polish. No SMS recovery or phone verification.
**Migration note:** audit existing models first; preserve 0000..0004; use additive
0005+ if needed, retain historical DOB/CNIC data without inferring age or deleting
history. New capabilities require live server validation and transactional audit.
No revised product acceptance or migration verification is claimed by this record.

## CHG-007 — Revised Phase 2 and configurable booking KYC (2026-10-14)

Approved by user Phase 2 prompt and latest answer: Owner may make CNIC optional.
The earlier mandatory-CNIC answer is superseded. SRS v2.2 supplement:
[SRS-v2.2-phase-two-supplement.md](SRS-v2.2-phase-two-supplement.md).
Refs BKG-001..009, ROOM/SEAT, AUTH-C, SEC-001/003, ACC-001..003/006. Combine
inventory/marketplace/booking, allow instant/request policies and additional approved
documents. Security/platform invariants retained. Migration note: additive 0007+;
retain 0000–0006 and historical CNIC/DOB; no deletion or permission expansion.

## CHG-008 — Owner-only pre-confirmation document access (2026-10-14)

Approved by the user's explicit privacy choice. SRS v2.3 supplement:
[SRS-v2.3-booking-document-access.md](SRS-v2.3-booking-document-access.md).
Refs SEC-003, BKG-001..009, ACC-002/003/006. Before confirmation, only the
owning hostel Owner may view customer-submitted private booking documents;
Managers see verification status only. This narrowly supersedes CHG-004's
approval prerequisite for these documents, not full CNIC/address/chat access.
Migration note: additive evidence lifecycle changes; preserve history and
existing post-approval controls. See ADR 0028. Verification is not claimed.

## CHG-009 — Phase3 residency and hostel finance framework (2026-10-18)

Approved by the user's2026-10-17 master execution prompt, after local stabilization.
Version [SRS v2.4 supplement](SRS-v2.4-phase-three-supplement.md). Refs STAY/RES,
RENT/PAY/FIN/OUT, ACC-001..006. Adds actual stays/occupancy/history, explicit Owner
billing/proration policy, immutable ledger/receipts, manual external payment and
settlement workflows. Branch-local manual relationships replace synthetic unclaimed
login creation; phone/email matching never automatically merges identities. Q3/Q9
resolve to explicit configured policy/snapshots. Preserve Owner-only booking files,
live grants, integer paisa, Q14 Owner-only payment reversal and all history.
Migration note: preserve0000..0017; additive generated0018+ only; no financial rewrite
or identity backfill by guessed contact matches. ADR0043. No acceptance claim.

## CHG-010 — Phase3 explicit delegated operational grants (2026-10-18)

Derived from the user-approved Phase3 Owner-controlled Manager framework (CHG-009).
Version [SRS v2.5 supplement](SRS-v2.5-phase-three-permissions.md). Refs MGR-004,
SEC-003, STAY/RES/RENT/PAY/OUT, ACC-001..006. Extend the existing branch grant model
with explicit stay/rent/payment/finance-read/checkout permissions; financial writes
require finance read and their operation permission. No automatic grant backfill,
Owner-only policy/reversal exception, document-access widening or identity merge.
Migration note: additive permission check and bounded contract/OpenAPI/UI expansion;
existing permissions, paths, scoped assignments, histories and default denial remain.
Implementation in progress; no runtime or CI acceptance claim.

## CHG-011 — Explicit disclosed-fee timing (2026-10-19)

Derived from the user-approved configurable Phase3 framework (CHG-009).
[SRS v2.6 supplement](SRS-v2.6-explicit-disclosed-fee-billing.md), RENT-003/004,
FIN-001/004, ACC-004. Owner explicitly selects one-time due offset and required
monthly fee anchor/proration, preserving original rates/cadences independently of
rent's selected cycle. Missing policy never invents an amount or skips a required
fee. Existing authorization, controlled categories, audit and immutable corrections
remain. Migration note: optional nested policy JSON on new explicit versions; no
existing-row/financial rewrite or physical migration change. ADR0049. Calculation
and configuration implementation is in progress; verification is not claimed.

## CHG-012 — Explicit linked-Stay self-read capability (2026-10-19)

Clarifies the already approved Phase3 relationship/capability model (CHG-009,
master prompt§47), [SRS v2.7](SRS-v2.7-linked-stay-self-access.md), RES-001/003,
SEC-003 and ACC-004. A live account reads only its explicitly user-linked Stays,
without requiring a separate Customer profile. Keep exact user ownership,
foreign/unlinked404, account/session rejection, staff grants and all unrelated
Customer booking/profile eligibility. No Resident login role or document-access
widening. Migration note: existing Self metadata on only two own-read routes;
no schema/backfill/profile creation, contact matching or historical rewrite.
ADR0050; RED/controller/UI verification is pending, no acceptance claim.

## CHG-013 — Preserve agreed grace before overdue classification (2026-10-19)

Implementation correction to authoritative RB-002/FIN-002 (SRS v2.0 p.29/30),
[SRS v2.8](SRS-v2.8-invoice-grace-classification.md), CHG-009 and RENT-004/PAY-008.
Overdue follows the original due date plus explicitly agreed grace; issued/partial
state remains neutral/orange until expiry. Preserve all amounts and receipt-backed
Paid/no_charge/void behavior. Migration note: existing immutable agreement JSON
already stores grace; resolve through invoice charge links, require one consistent
value, and never backfill zero or use current settings. Internal calculator input
adds required graceDays. No schema or historical rewrite; ADR0051. RED18 failures/
629 passes reproduced; fixed-source contracts647/44 and DB units159/7 pass with100% configured coverage, static5/5 and8/8. Transitive and real acceptance remain pending in STATUS.md.

## CHG-014 — Owner-controlled immutable charge catalogue (2026-10-19)

Derived from approved Phase3 configuration (CHG-009/010), FIN-004/RENT-003, AUD-004 and ACC-004. [SRS v2.9](SRS-v2.9-owner-charge-catalog.md) records Owner-only create/archive and explicit finance_view for active assigned Manager reads. Prices remain immutable; new record/code and explicit agreement amendment are required for a changed price. Existing archive/source/retention guards remain. Migration note: no physical schema change, grant backfill, financial/history rewrite or public data widening. ADR0052; implementation and verification pending.

## CHG-015 — Phase 9 financial and lifecycle corrections (2026-10-26)

User-directed (Phase 9 directive, 2026-10-26) under RES-005, RENT-003/004, OUT-003..006 and AUD-004. [SRS v2.12](SRS-v2.12-phase9-financial-lifecycle.md): an explicitly agreed rent on transfer amends the agreement from the first un-invoiced period; extensions top up a short final period and resume exhausted billing; checkout may apply held deposit atomically; refunds after checkout are shown beside the unchanged final statement. Migration note: 0056 only replaces two billing guard functions (exhausted → active/manual_required/superseded through the audited human change); no data rewrite. ADR0072.

## CHG-016 — Phase 9 resident services and Phase 10 administration decisions (2026-10-27)

User-directed Phase 9 + 10 directive. Implementation choices where the SRS leaves room: (1) transport is billed as its own `transport` line through the existing billing schedule, per Stay fee period, for the days covered by approved subscriptions, using the branch's approved monthly fee proration; a branch without a monthly fee policy cannot activate paid transport; start/end dates cannot fall inside an already invoiced period; the resident confirms the exact price shown. (2) No new Manager grants: menu = listing_edit; routes = listing_edit + pricing_edit; transport decisions = stay_manage + rent_manage; complaint actions = stay_manage; review replies = listing_edit. (3) Review eligibility = 30 Karachi calendar days from check-in to checkout/today; ratings 1..5 (v1 baseline). (4) Reports are generated on request (bounded 5000 rows, CSV formula-safe, PDF) and audited instead of stored export files. (5) Analytics marks listing views and searches as not collected (ADR0038). (6) Announcements: Support role or Root, in-app only, plain text. (7) Platform subscriptions remain deferred (CHG-003); dashboards show "deferred". Migration note: 0057/0058 are additive; no historical rewrite. ADR0073.

## CHG-017 — Owner mobile foreground location (2026-10-29)

User explicitly requests automatic location on hostel setup entry, manual map changes,
and removal of latitude/longitude inputs. [SRS v2.13](SRS-v2.13-owner-location-selection.md),
ONB-001/GEO/SEC-003: foreground permission-aware one-shot lookup initializes only an
empty draft pin; saved/manual pins remain authoritative. No background collection,
watcher, analytics or device-position logs. Existing explicit branch save, privacy,
review and public-disclosure rules stay unchanged. This supersedes ADR0026's mobile
no-device-location/coordinate-input choice; Web is unchanged. Migration note: native
foreground module/permissions require a data-preserving Android update; no database
migration or backfill. ADR0083; physical acceptance pending.

## CHG-018 — Six-step Owner setup and optional property metadata (2026-10-29)

User supplied the six-step setup reference and explicitly approved real optional
Standard/Premium/Luxury and establishment-year fields. [SRS v2.14](SRS-v2.14-owner-setup-wizard.md):
Basic Information, Location & Address, Building & Rooms, targeted Photos & Gallery,
Amenities & Services, persisted Review & Submit. Native type choices are Male/Female;
legacy canonical values and eligibility remain compatible. Existing permissions,
financial rules, clean media/publication and backend submission gates stay in force.
Migration note: generated additive0060, nullable metadata with no guessed backfill;
current-year validation, SDK/contracts/API reads/writes and source docs update together.
ADR0084. Implementation/physical acceptance in progress, not certified complete.

## CHG-019 — Per-room amenities; room types hidden in native setup (2026-10-29)

User asked that every room can have its own amenities and that room types be removed
from the setup UI. [SRS v2.15](SRS-v2.15-room-amenities.md): rooms inherit room-type
amenities by default or keep their own set (versioned, audited, `listing_edit`); public
room pages disclose effective amenities. Native "Add room" derives/reuses the canonical
room type from beds/rent/deposit. Migration note: additive 0061, no backfill.
Implementation local and focused-tested; physical/release acceptance pending.

## CHG-022 — controlled identity and photo review (2026-10-31)

User-approved HMA-015 completion; see [SRS v2.18](SRS-v2.18-profile-reviews.md).
Root identity decisions and Root/content-moderator photo decisions use dedicated
private proof, immutable versioned history and explicit audited access. Identity
approval revokes sessions; enabled photo governance prevents direct-edit bypass.
Migration0063 generation and disposable application explicitly authorized; development
application/deployment remain pending. Default-off runtime/schema gate preserves
existing behavior until coordinated rollout. No financial or public-disclosure change.

## CHG-023 — owner-defined scoped amenities (2026-11-02)

User-approved property lifecycle master; [SRS v2.19](SRS-v2.19-custom-amenities.md).
Existing amenity records/associations support organization scope and category. Owner CRUD,
manager assignment under existing grants, foreign-code denial, global-catalog isolation
and non-destructive archival are required. Generated migration0065 is additive;
development DB application and Android acceptance remain pending.

## CHG-024 — original-stay agreement acknowledgement (2026-11-02)

User-approved property lifecycle master; [SRS v2.20](SRS-v2.20-agreement-acknowledgement.md).
Authenticated own-stay acknowledgement preserves exact version/digest, server time and
append-only evidence. Existing stay_manage readers can inspect evidence; staff cannot
acknowledge for residents. It does not constitute a cryptographically verified signature.
No retroactive financial changes or new mandatory admission gate. Additive migrations0066/67;
development rollout and Android acceptance remain pending.

## CHG-025 — versioned agreement templates and original-stay scanned evidence (2026-11-02)

User-authorized property lifecycle master; [SRS v2.21](SRS-v2.21-agreement-documents.md).
Extend existing policy/stay snapshots and private scanning/storage. Owner-only future
template edits preserve original stays; linked residents and authorized stay_manage
staff can append owned clean scans and retrieve exact-stay documents with sensitive
audit. Append-only evidence and unique file association prevent replacement/reassignment.
Additive migrations0068/69 are disposable-tested; development rollout remains gated.

## CHG-026 — complete authorized bed/stay operational context (2026-11-02)

User property lifecycle master; [SRS v2.22](SRS-v2.22-stay-operational-reads.md).
Exact-stay private photo review reuses existing operational sensitive scope/audit;
no public disclosure. Bed location, preselected existing admission, receipt-backed
last-payment/issued-invoice due summaries and shared mutation/day-boundary invalidation
complete operational reads without changing prices, settlement arithmetic or grants.
No schema migration. Old frozen snapshots remain valid; device acceptance is separate.

## CHG-027 — direct Customer profile photo save (2026-11-13)

Customer Profile saves a clean, private, self-owned avatar without a review
request. See [SRS v2.23](SRS-v2.23-customer-profile-photo.md).

## CHG-028 — inline avatar upload (2026-11-13)

Profile photos up to 5 MB complete inline after image type and size validation.
See [SRS v2.24](SRS-v2.24-avatar-upload.md).

## CHG-029 — Manager runs the whole branch (2026-11-14)

An activated Manager receives every branch operation permission automatically; the
Owner no longer picks permissions. Branch isolation and Owner-only actions are
unchanged. See [SRS v2.25](SRS-v2.25-manager-full-branch-access.md).

## CHG-030 — Manager removal needs the Owner password; Manager-first sign-in (2026-11-14)

Removing a Manager or cancelling an invitation requires the Owner's own password, checked by
the server. Managers sign in to the Manager workspace first. See
[SRS v2.26](SRS-v2.26-manager-removal-and-entry.md).

## CHG-031 — No profile photo moderation; clearer Admin names (2026-11-14)

User-directed. Owner profile photos attach directly, like Customer photos (CHG-027); the
Admin "Photos" review queue is removed from Operations. Identity correction reviews are
unchanged. Admin labels: "Customers" → "Customer suspensions", "Booking policy" →
"Platform policies" (the same platform defaults and limits every hostel inherits; hostel,
branch and room type settings still override, BKG-006). Verification leads the Admin
dashboard below Platform income.

## CHG-032 — Institutions loaded from OpenStreetMap (2026-11-14)

User-directed. Universities and colleges in Islamabad Capital Territory and Rawalpindi City
Tehsil are imported from OpenStreetMap (ODbL) by `apps/api/scripts/import-institutions.ts`
instead of manual entry. Imported places are publicly approved by the active Root, audited
one row each (`institution.imported`), skipped on rerun (slug `osm-<type>-<id>`) and never
overwrite a same-named place. Admins still edit, deactivate or withdraw any place. The
marketplace shows "© OpenStreetMap contributors". No schema change.

## CHG-033 — Search any place or area, nearest hostels first (2026-11-14)

User-directed. Places gain categories (school, health, hotel, food, government, library,
locality, plus existing university/office/business_hub; migration 0070, additive enum
values). The OpenStreetMap import (CHG-032) now loads every named amenity, shop, office,
stay, health place and locality in Islamabad and Rawalpindi City. Typed place search
covers all categories and aliases, best match first; browsing still lists campuses. Any
approved place can anchor the hostel search (`universityPlaceId`), which picks within
10 km sorted nearest. Public responses still never expose occupant or rent data (BR-05).

## CHG-034 — Near me, pick on map, and Admin Places (2026-11-14)

User-directed. Customers and guests can search hostels around their phone location ("Near
me", foreground permission, one reading, never stored) or a map pin, within 10 km nearest
first (`nearLatitude`/`nearLongitude` + `radiusMeters`; exclusive with
`universityPlaceId`). Admin → Institutions becomes Admin → Places: every category, type and
Shown/Hidden filters, a city picker, a map pin instead of typed coordinates, and plain labels.
Hiding uses the existing audited active/public flags with a reason; nothing is deleted.
`institutionInputSchema.type` defaults to `university` for older clients.

## CHG-035 — Suspensions on the user and hostel screens (2026-11-15)

User-directed UI change. Admin dashboard: the top card reads "Hostel verifications" and the
duplicate Verification and Customer suspensions Operations tiles are removed. Suspending or
lifting a suspension happens on each user's screen (Totals → Users → search → user) and each
hostel branch's screen (Suspend hostel / Lift suspension), using the existing audited,
reason-required customer governance (HMA-015) and verification decisions (ADM-007).
No server or rule change.

## CHG-036 — Identity reviews off, chat reports in Complaints, simpler policies (2026-11-15)

User-directed. Accounts already verify their email, so the optional identity/photo review
switch (`PROFILE_REVIEWS_ENABLED`) stays off and the Admin Identity tile is removed; names
and CNIC are edited directly as when the switch is off. Chat safety reports open from Admin
→ Complaints ("Chat reports") instead of a separate tile; access rules are unchanged.
Platform policies use plain labels, Yes/No answers and minutes/hours (stored in exact
seconds, BKG-006). Every card in the mobile app uses the icy card border.

## CHG-037 — Food menu in setup, per-day meal times, kitchen and dining photos (2026-11-15)

User-directed. Hostel setup → Amenities & Services gains a Food menu card: day buttons, three
meals per day, and per-day serving times picked on an animated clock (copy a day's times to
Mon–Fri, Sat or Sun, since weekdays and weekends often differ). A saved menu shows as a
compact week board with a pencil to edit. New table `menu_meal_times` (migration 0071:
branch, day 1–7, meal, `HH:MM` start/end, start before end) is saved and audited with the
menu version (SERV-001). The Photos step has Kitchen and Dining area sections; guests see
those photos with the menu and times on the hostel page.

## CHG-038 — Errors say what went wrong (2026-11-15)

User-directed. The app names the actual problem instead of "Unable to continue": invalid
fields by name, lost connection, slow server, server restarting, expired sign-in, missing
access, changed-elsewhere conflicts and server faults (with a short reference). The API now
returns the fixed developer-written sentence for input/editing problems only
(VALIDATION_FAILED, CONFLICT, PRECONDITION_FAILED, UNDERAGE, ROOT_ADMIN_LIMIT,
IMPORT_ALREADY_COMMITTED). SEC-003 is kept: identity, account, permission, not-found and
unexpected errors keep the generic title, and raw phone-side runtime text is never shown.

## CHG-039 — Staff management and salary tracking (2026-11-15)

User-approved narrow extension of deferred payroll. See
[SRS v2.27](SRS-v2.27-staff-and-salaries.md). Branch staff records, versioned monthly
salary terms, idempotent monthly obligations, record-only partial payments with reversals,
versioned agreements with private scans, Owner/Manager Staff tools, an optional setup
step and an Admin active-staff count. New Manager grants `staff_manage` and
`staff_payroll_manage` are off by default and excluded from the CHG-029 automatic grant.

## CHG-040 — Waiting list only when a resident has given notice (2026-11-15)

User-directed change to WAIT-001. See [SRS v2.28](SRS-v2.28-notice-based-waitlist.md).
Customers can join a waiting list only when a current resident of that room type has given
departure notice; otherwise the room is simply full and the join is refused. The expected
vacancy date comes automatically from the earliest notice date and can no longer be typed
by management. No schema change.

## CHG-041 — Edit an approved hostel and send for re-verification (2026-11-15)

User-directed. See [SRS v2.29](SRS-v2.29-hostel-re-verification.md). An approved hostel's
basics and location can be edited as a pending revision while the listing stays live; a
Verification Admin approves (changes go live) or rejects (live stays). Migration 0073.

## CHG-042 — Optional Transport operations

User-approved extension of SERV-002 and RENT-004. See [SRS v2.30](SRS-v2.30-transport-operations.md). Transport supports typed destinations, weekly trips, separate monthly fees, agreement-captured included service, and one operational flow for setup, staff, marketplace and residents. Schema additions are in migration 0074.

## CHG-043 — One branch Transport subscription per Stay

User correction supersedes route-level subscriptions from CHG-042. One branch monthly fee covers all routes. Transport already captured in agreed rent has no separate fee. Migration 0075 adds branch fee consistency, one live subscription or request per Stay, and non-overlapping subscription windows. It preserves rows and fails transactionally if existing data conflicts with those constraints. See [SRS v2.30](SRS-v2.30-transport-operations.md).

## CHG-044 — Transport setup and collections (2026-11-16)

- SERV-002 / FIN-001 / PAY-008. New routes are added in mobile Hostel Setup under Amenities & Services. Operations retains live stats and existing-route maintenance, and is the staff workspace for Transport-only invoices and collections.
- Branch Billing Policy captures a monthly due day, refundability and partial-month treatment for future agreements. Owners and branch Managers with live finance_view and rent_manage grants can version these Transport fields. Invoice status uses Karachi dates and receipt-backed balances.
- See [SRS v2.31](SRS-v2.31-transport-collections.md). No additive database migration is required.

## CHG-045 — Transport logic corrections (2026-11-16)

Corrections to CHG-042/043/044, no new migration:

- Included transport survives agreement versions: a Stay keeps the included routes recorded by
  its booking even after a rent change (which writes a version without a booking snapshot).
- Walk-in (manual) admissions: a route is included when its inclusion date is on or before the
  Stay's first agreement date, the same rule a booking uses; earlier agreements are never
  silently entitled. One shared lookup feeds both the resident view and billing.
- Checkout closes transport: a pending request is withdrawn and an active subscription ends on
  the checkout date, audited; issued invoices are untouched.
- Riders list opens with `finance_view` or with the decision grants `stay_manage` +
  `rent_manage`; invoice state is returned only to `finance_view` readers.
- The paid route a resident rides is recorded on the request. When a paid route is archived or
  made included, its riders move (audited) to another paid route; the last paid route cannot
  be removed while riders remain.

## CHG-046 — Branch Transport pricing and route directions (2026-11-16)

SERV-002 / FIN-001 / PAY-008. Route setup shows outbound and return departures together. Branch Billing Policy publishes either included coverage or one separate monthly fee. Migration 0076 allows schedule-only routes. See [SRS v2.32](SRS-v2.32-branch-transport-pricing.md).

## CHG-047 — Mobile Transport subscription setup (2026-11-16)

SERV-002 / FIN-001. Move the monthly subscription fields to Amenities & Services and simplify mode selection in Billing Policy. See [SRS v2.33](SRS-v2.33-transport-subscription-setup.md).

## CHG-048 — Mobile Bed Board with rent colours (2026-11-17)

BED-001/002 / RES-004/005 / RENT-004 / PAY-004..008 / SERV-002. Rooms & rent opens on a visual Bed Board (green paid, yellow due, red overdue, light blue proof sent, silver reserved, white vacant) with a bed sheet for details, proofs, transport and history; a vacant bed opens Add Resident. Additive API fields, no migration. See [SRS v2.34](SRS-v2.34-mobile-bed-board.md).

## CHG-049 — Transport is an on/off switch and a list of places (2026-11-18)

SERV-002 / CHG-042. User-directed. In Hostel Setup, Transport has an On/Off switch and the places it goes to ("available at"); no route name, timings, pick-up points, description or destination type. A route is complete (shown to customers and offered to residents) once it has a place; a departure time is no longer required. Customers see one "Transport available at" list on the hostel profile. Amenities, Food menu and Transport are separate cards. No database migration; existing routes keep working.

## CHG-050 — One payment proof can pay several bills (2026-11-18)

PAY-002..009 / SERV-002. User-directed. A resident who pays rent and transport (or any open bills of the same Stay) in one transfer submits one proof with one screenshot and the total. The proof keeps its main bill and lists the others (migration 0077, `resident_payment_proof_invoices`). While it waits, none of its bills can be in another proof. On approval one payment is split oldest due first up to each balance, anything beyond is advance credit, and one receipt is issued. A proof still never marks a bill paid by itself (non-negotiable 3); the Rent Board shows every covered bill as proof pending.

## CHG-051 — Link active manual residents to customer accounts (2026-11-18)

RES-001 / AUTH-C / SEC-003 / ACC-004/006. User-directed: first-time signup opens
Customer profile setup after email verification and password creation. A unique
verified-email match links the current active manual Stay directly. A phone-only
match sends a request to the hostel's Residents queue and needs branch staff approval.
Checkout invalidates the request; former residents never produce a request. Both
matching and approval require state `active`. Migration 0078 is additive; closed
history is not linked. See [SRS v2.35](SRS-v2.35-resident-account-linking.md).

## CHG-052 — A first bill is never due before move-in (2026-11-18)

RENT-001 / RENT-004. User-directed fix. A calendar-month bill was due on the month's due day even when the stay started later, so a resident who moved in on the 17th with rent due on the 1st was overdue at once. Every rent, monthly fee and transport period is now due no earlier than the day it starts: the first bill is due on move-in, later months on the agreed day. Bills already issued keep their dates.

## CHG-053 — Owner cancels and reissues a wrong unpaid bill (2026-11-18)

RENT-003 / RENT-004 / ACC-006. User-directed. A bill issued with a wrong due date could not be
corrected: issued bills are immutable. The Owner (never a Manager) can now cancel a bill that has
no payment, no adjustment and no proof under review, and reissue it with a new due date (not
before the bill's period starts) and a required reason. The old bill stays on record as voided
with the reason; each of its charges is credited in full by a `correction` adjustment and copied
once onto the new bill (source key `reissue:…`). Billing scans ignore the copies, so the original
charge still stands for its period and nothing is billed twice. One audit row
`resident.invoice.reissued`. No schema change; `POST
/v1/branches/{branchId}/stays/{stayId}/invoices/{invoiceId}/reissue` (Idempotency-Key, CSRF).

## CHG-054 — Resident CNIC at Add Resident and booking check-in (2026-11-18)

RES-001 / CHG-004 / CHG-007. User-directed. A hostel now records a resident's CNIC when it adds a
walk-in resident (required in the app) and at booking check-in (taken from the customer's account,
or typed when the account has none). It is private: stored encrypted with a keyed hash, shown to
staff only as the last 4 digits, never on the marketplace and never in logs, history, audit or
idempotency records. Residents added earlier keep no CNIC. Additive migration 0079.

## CHG-055 — Explicit combined security payments; block excess collections (2026-11-18)

PAY-008 / BKG-007/008 / RENT-005 / SERV-002. User-directed: combine security, rent and
applicable transport in one resident proof/receipt, including security-only payment.
Security is validated against the remaining agreed amount and cannot be in duplicate
pending proofs. Reject new collections above selected obligations instead of creating
advance credit. Transport is optional at booking as well as after admission; separate first-month
transport joins upfront, while included routes have no extra charge. Carry verified booking
security/rent into the new Stay once, preserving history and avoiding double collection.
Migrations 0080/0081 are additive; no historical reclassification. See
[SRS v2.36](SRS-v2.36-combined-security-payments.md).

## CHG-056 — Independent physical-bed rent in Hostel Setup (2026-11-20)

User-directed ROOM-002 / BED-001 / BKG-003..005 / ACC-004 / ACC-006.
[SRS v2.37](SRS-v2.37-individual-bed-pricing.md) removes the setup room-rent editor
and new whole-room choice. Each bed has an explicit initial rent and independently
versioned effective prices; quotes, discovery and manual-admission defaults use
that bed's rate. Existing contracts retain their captured amounts and legacy beds
retain their historical type fallback until explicitly priced. Additive 0082/0083;
no backfill or historical repricing. Implemented with focused checks; coordinated
acceptance remains pending (see STATUS).

## CHG-057 — Room size follows physical beds; admission owns security (2026-11-21)

User-directed ROOM-002 / BED-001 / BKG-003..005 / RES-001. Add Room keeps only its
identity/photo; actual added beds determine classification automatically. Security
is entered for the new resident/bed at admission, not in room setup. Empty setup
containers are unpriced, with explicit per-bed prices required later. Preserve
historical financial snapshots and identity/claim guards. See [SRS v2.38](SRS-v2.38-bed-derived-rooms.md).
Implemented with focused PostgreSQL/API/native checks; local migrations 0084-0085 applied. Final coordinated acceptance remains pending.

## CHG-058 - Per-bed rent and security preset (2026-11-21)

User correction on Add Bed: set security alongside this bed's own rent; default it
into new native admission terms and future bed quotes. No room security preset,
no automatic payment/paid state and no historical repricing. Nullable migrated
presets inherit the last explicit dated bed amount, then legacy type security;
explicit zero is retained. See [SRS v2.39](SRS-v2.39-bed-security.md). Implemented with focused checks and local migration 0086; coordinated acceptance remains pending.

## CHG-059 - Native numeric entry and editable photo controls (2026-11-21)

User-directed UI-001 / SEC-003 / AUTH-C / OWN-001. Format numeric amounts and
quantities with live thousands separators while preserving exact canonical input.
Use choose icons and corner-pencil Replace/Delete controls on editable photos.
Self-profile inputs accept explicit null to unlink the avatar; retain files/history,
scan and ownership checks, identity restrictions and audited self-profile saves.
See [SRS v2.40](SRS-v2.40-photo-controls.md). No database migration.

## CHG-060 - Private CNIC photo on manual resident admission (2026-11-21)

User-directed RES-001 / SEC-003 / STAY-001. Add a camera in the CNIC field and
save an optional scanned, uploader-owned private image with the new resident,
atomically with admission. No identity/payment verification, public disclosure,
existing-resident overwrite or historical file deletion. See
[SRS v2.41](SRS-v2.41-resident-cnic-photo.md). Additive migration 0087.

## CHG-061 — Rent-aligned transport invoices and subscriber Operations (2026-11-22)

SERV-002 / RENT-003/004 / PAY-008/009. User requested routes only in setup,
Transport subscribers and interactive request approval in Operations, transport-only
monthly totals, and one rent-dated monthly invoice with classified rent/transport
and remaining security. Preserve historical bills and liability accounting. See
[SRS v2.42](SRS-v2.42-combined-transport-invoices.md) for behavior and migration note.
