# Platform Admin rendered UI audit — 2026-10-31

HMA-017 / ADM-001 / GEO-003 / RPT-003 / AUD-001. Local Pixel 6 Pro, existing Root
session and real development API. This is a partial acceptance record: missing live
records prevent some nested visual checks. No production acceptance is asserted.

## Implemented from rendered findings

- Reused AppHeader/AdminHeader, AdminPage, FilterPanel, CohortStats, WorkflowTabs
  and the existing private-data readers/command recovery. No competing header.
  The unused CohortStats implementation was removed after confirming its only
  caller was the shared directory.
- Initial two-column statistics refinement is superseded by the user's later
  instruction: standalone cohort cards are removed from all nine directories.
  Actual month/quarter/year/lifetime counts now accompany the single period
  selector inside Filters and sorting. Removed redundant all-status badges. Whole record tiles now open the same audited profiles, with a chevron
  instead of a second full-width profile button. Data caveats remain in Data notes.
- Reduced filter padding and replaced shared full-width refresh buttons with
  accessible 48dp icon controls. Removed duplicate end-of-pagination paragraphs.
- Policy editor groups Defaults, Rules and Limits into existing mounted tabs;
  changing tabs preserves every draft field. Explicit defaults, validation,
  version checks and confirmation remain unchanged.
- Institution create/edit now occupies a focused screen. Standard/header and
  Android back return to the existing searched/filtered directory. Pending or
  unresolved commands lock back navigation. Existing history and confirmations
  remain available. No extra route, API or duplicate editor was introduced.
- Audit filters and analytics date fields are collapsible. Analytics begins with
  actual data instead of a stack of queue shortcut buttons; shortcuts remain below.
- Removed redundant Admin-list dashboard button and completion text. Replaced
  missed profile/detail loading text with the shared detail skeleton. Corrected
  obsolete Normal Admin text claiming workspaces were unimplemented.
- Shortened complaint snapshot caption to prevent its chevron wrapping. Approved
  main dashboard structure, income unavailable state and six date periods remain.
- Keyboard taps/insets are handled by the shared Admin scroll container.

## Screen inventory and visual status

Screens below mean rendered screen/workflow families, not every possible record.
The screenshot manifest provides the individual captured states and scroll pages.

| Screen / workflow                                                              | Audit status and dependency                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Root Dashboard and date controls                                               | Actual captures; approved structure preserved                                                                     |
| Platform Operations hub                                                        | Actual full-scroll captures; all 12 destinations visited                                                          |
| Awaiting verification                                                          | Actual pending branch directory; shared refinements                                                               |
| Registered users, search, filters                                              | Actual directory and real Root record; shared refinements                                                         |
| User metadata profile                                                          | Actual real Root profile; no enforcement attempted                                                                |
| Hostel businesses                                                              | Actual empty directory; shared refinements                                                                        |
| Hostel branches, statuses and filters                                          | Actual empty directory; shared refinements                                                                        |
| Owners                                                                         | Actual empty directory; shared refinements                                                                        |
| Managers                                                                       | Actual empty directory; shared refinements                                                                        |
| Bookings                                                                       | Actual empty directory; shared refinements                                                                        |
| Occupied placements                                                            | Actual empty directory; branch cohorts remain explicit                                                            |
| Approved payments                                                              | Actual empty directory; hostel-direct/receipt restrictions preserved                                              |
| Complaint categories                                                           | Actual empty directory; private complaint content remains withheld                                                |
| Identity correction reviews                                                    | Actual empty queue and status controls                                                                            |
| Profile photo reviews / current photos                                         | Actual empty queues; purpose warnings preserved                                                                   |
| Customer governance                                                            | Actual empty eligible-customer queue; protected Root excluded                                                     |
| Listing verification                                                           | Actual Root redirect to canonical pending branch directory                                                        |
| Review moderation                                                              | Actual empty queue; reports/restoration filters retained                                                          |
| Support workspace                                                              | Actual empty queue; search/filter controls retained                                                               |
| Chat safety                                                                    | Actual empty queue; purpose/audit warning preserved                                                               |
| Announcements                                                                  | Actual compose form and empty history; no announcement sent                                                       |
| Platform booking policy                                                        | Actual unconfigured state and editor; Defaults/Rules/Limits                                                       |
| Institution directory                                                          | Actual existing institution row and search controls                                                               |
| Institution create/edit                                                        | Actual form; focused editor/back behavior checked in tests                                                        |
| Platform analytics                                                             | Actual current totals and selected-date cohort                                                                    |
| Platform audit history                                                         | Actual retained audit events; exact filter/pagination tests                                                       |
| Admin Management                                                               | Actual team statistics and all navigation entries                                                                 |
| Admin accounts / Root membership                                               | Actual Root listing and detail; no privilege mutation                                                             |
| Invite Normal Admin                                                            | Actual blank form; no invitation sent                                                                             |
| Own Admin profile                                                              | Actual current Root profile                                                                                       |
| Account / Choose your space                                                    | Actual screenshot inspected at user request; oversized controls identified, further account-wide redesign pending |
| Hostel/branch/owner/manager/booking/complaint/payment/occupancy record details | Pending rendered checks: no corresponding live records; existing shared detail UI retained                        |
| Verification dossier, evidence, pricing and decision tabs                      | Pending real-record rendered checks; no submitted branch                                                          |
| Support ticket actions/conversation                                            | Pending real-ticket rendered checks                                                                               |
| Moderation decision/history and restoration details                            | Pending real-review rendered checks                                                                               |
| Identity/photo evidence, decisions and current-photo case                      | Pending real-review/photo rendered checks                                                                         |
| Customer decision confirmation                                                 | Pending eligible Customer record; component tests cover reason/confirmation                                       |
| Chat-safety evidence/context modal                                             | Pending reported case; purpose gate retained                                                                      |
| Announcement preview, schedule/cancel history                                  | Pending populated form/record physical checks; command tests retained                                             |
| Policy confirmation                                                            | No live setting submitted; version/confirmation component test passes                                             |
| Institution save confirmation/history                                          | Disposable component fixture covers deactivation/confirmation; no live save                                       |
| Normal Admin assigned-role landing                                             | Pending separate Normal Admin session; Root session retained                                                      |

## Consolidation and integrity

No product route/component was deleted speculatively. Root listing verification
continues to reuse the comprehensive branch directory; institution form implementation
is reused in its focused view. Only redundant controls/text were removed. All search,
status, sort, cursor, API, RBAC and branch isolation behavior stays on existing paths.
One hostel business can already have multiple branches under its organization;
this UI work makes no schema change or new ownership model.

## Verification

Focused Native regression: **7 suites, 54 tests passed**, including explorer search,
periods, sorting, pagination, profile navigation, disclosures, institution return
state, policy version confirmation, operations, profile-review guards and headers.
Evidence: `.tools/reports/admin-visual-regression.log`. Coverage was disabled for
this focused run; no app-wide coverage certification is implied. An initial run's
30 assertions passed but its unrelated global coverage threshold failed; retained.
After the filter-only period change, focused regression passes **19/19** across
Explorer and settings (including nine directory kinds; nine new cases failed
before the fix). Evidence: `admin-period-controls-before.log` /
`admin-period-controls-after.log`. Counts overlap the earlier54; do not add them.
Final Mobile strict typecheck passes (`admin-period-controls-typecheck.log`). Broad
Mobile lint remains blocked by **18 existing errors** (`admin-visual-lint-final.log`),
including public-field entropy detection in policy-form and unrelated navigation
mocks/Owner UI/unused imports. All three errors introduced in this pass were fixed.
No full-suite or backend regression was rerun for these UI-only changes.

## Evidence and limitations

Actual screenshot/XML files are under
`.tools/reports/admin-visual-audit-20261031/`. Before images are retained separately
from after images. Contact sheets are resized copies of those real captures.
A mislabeled initial Support capture showed Operations and is excluded as support
evidence; its real destination was revisited. Interrupted/hot-reload captures are
not final visual acceptance evidence. No synthetic data, development DB seed,
credential change, worker start, external message, migration or APK rebuild occurred.

The app remains connected to Metro/API. Full all-record/all-role visual acceptance,
real privileged mutations, loading/error permutations and production performance
remain pending; they are not represented as completed by empty queue screenshots.

## Before / final screenshot pairs

All links are actual device screenshots. Intermediate `after-*` directory images
are superseded by the user's filter-only correction in `final-*`. Full viewports
and SHA-256 identifiers are listed in
[screenshot inventory](D:/hsm/.tools/reports/admin-visual-audit-20261031/screenshot-inventory.json).

| Screen                             | Before                                                                                                      | Final                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 01-awaiting-verification           | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-01-awaiting-verification-1.png)           | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-01-awaiting-verification-1.png)           |
| 02-registered-users                | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-02-registered-users-1.png)                | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-02-registered-users-1.png)                |
| 03-hostel-businesses               | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-03-hostel-businesses-1.png)               | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-03-hostel-businesses-1.png)               |
| 04-hostel-branches                 | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-04-hostel-branches-1.png)                 | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-04-hostel-branches-1.png)                 |
| 05-hostel-owners                   | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-05-hostel-owners-1.png)                   | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-05-hostel-owners-1.png)                   |
| 06-hostel-managers                 | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-06-hostel-managers-1.png)                 | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-06-hostel-managers-1.png)                 |
| 07-bookings                        | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-07-bookings-1.png)                        | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-07-bookings-1.png)                        |
| 08-occupied-placements             | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-08-occupied-placements-1.png)             | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-08-occupied-placements-1.png)             |
| 09-approved-payments               | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-09-approved-payments-1.png)               | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-09-approved-payments-1.png)               |
| 10-resident-complaints             | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-10-resident-complaints-1.png)             | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/final-10-resident-complaints-1.png)             |
| op-01-identity-correction-reviews  | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-01-identity-correction-reviews-1.png)  | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-01-identity-correction-reviews-1.png)  |
| op-02-profile-photo-reviews        | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-02-profile-photo-reviews-1.png)        | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-02-profile-photo-reviews-1.png)        |
| op-03-customer-governance          | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-03-customer-governance-1.png)          | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-03-customer-governance-1.png)          |
| op-05-review-moderation            | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-05-review-moderation-1.png)            | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-05-review-moderation-1.png)            |
| op-06-support-agent-workspace      | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-06-support-agent-workspace-1.png)      | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-06-support-agent-workspace-1.png)      |
| op-07-chat-safety-cases            | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-07-chat-safety-cases-1.png)            | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-07-chat-safety-cases-1.png)            |
| op-08-announcements                | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-08-announcements-1.png)                | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-08-announcements-1.png)                |
| op-09-platform-booking-policy-edit | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-09-platform-booking-policy-edit-1.png) | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-09-platform-booking-policy-edit-1.png) |
| op-10-institution-directory-create | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-10-institution-directory-create-1.png) | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-10-institution-directory-create-1.png) |
| op-11-platform-analytics           | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-11-platform-analytics-1.png)           | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-11-platform-analytics-1.png)           |
| op-12-platform-audit-history       | [Before](D:/hsm/.tools/reports/admin-visual-audit-20261031/before-op-12-platform-audit-history-1.png)       | [Final](D:/hsm/.tools/reports/admin-visual-audit-20261031/after-op-12-platform-audit-history-1.png)       |

Physical final check: all nine directory kinds plus the pending-verification alias
were revisited after removing the cards. Pending/user filter-expanded states show
real0/1 counts on the same period selectors. App left on Root Dashboard.
