# Owner work and instruction report — 29 October 2026

Work stopped at the user's explicit request. This report records the work performed during this Owner session, the user's requested behavior, evidence limits, and unfinished work. It does not certify full Owner acceptance or a release.

## Current checkpoint

- Branch: `codex/recovery-20261023`.
- HEAD: `6fe0fb9c550cb33743f0485f048be16dfd407454`.
- Changes remain local and uncommitted. No commit, push, PR, release or production deployment was performed during this session.
- Existing Login/UI/Web/AGENTS changes were already present and were preserved. The entire working-tree diff must not be attributed to this session.
- The installed Pixel build includes the earlier foreground-location implementation. Later wizard/metadata/password-control source changes have not been installed on the phone.
- The latest partial source is **not verified buildable**. Earlier passing checks apply to their recorded snapshots, not the current partial wizard.
- No further implementation, tests, device navigation, migrations or service changes are authorized by the stop/report request.

## What the user instructed

### Original Owner acceptance work

The supplied master prompt requested the supported Owner journey on the physical Pixel 6 Pro, source/API review, fixes for actual gaps, focused evidence and a reusable acceptance harness. Genuine onboarding and real authorization were required. Synthetic identity documents, fabricated consent, fake privileges and invented acceptance results were not permitted. The session instruction was to avoid commits/pushes unless explicitly requested.

### Onboarding and error behavior

1. Navigate sign-in/sign-up yourself; the user would enter the password privately on the phone.
2. The user set the password and reported that password visibility was unavailable. Add Show/Hide; initially the user explicitly deferred this fix until the end.
3. CNIC/avatar pictures initially could not upload. Diagnose and fix the actual failure.
4. After pictures uploaded, profile continuation still failed. Diagnose that separately.
5. When a number is already linked to another identity, say so explicitly. A generic error is insufficient. The user entered another genuine number they control and profile completion succeeded.

### Location and hostel setup

6. Remove visible latitude/longitude inputs from hostel setup.
7. Automatically attempt current-location detection as the Owner enters setup.
8. Retain a manual way to change the location, including choosing a map pin.
9. Add Islamabad and Rawalpindi sublocations, sectors and areas.
10. Hostel gender/type choices must be only **Male** and **Female**, with no other visible gender/type choices.
11. Make the UI professional, including well-designed image/upload areas that display the actual uploaded pictures.
12. Replace setup with the supplied six-step functional flow:
    - Basic Information.
    - Location & Address.
    - Building & Rooms.
    - Photos & Gallery.
    - Amenities & Services.
    - Review & Submit.
13. Implement the screens inside those steps, rather than only an overview. Building/room setup must support the actual hierarchy; photos should relate to the appropriate room/floor context. Review must preview all entered/saved information before submission.
14. After a clarification, the user explicitly approved **Standard/Premium/Luxury** and **Establishment Year** as real optional saved fields. These describe property tier/year separately from the Male/Female type choice.

### Owner dashboard and navigation

15. After Owner login, show the Owner's own professional dashboard.
16. Before a hostel exists, use the supplied empty-dashboard reference: clear first-hostel action, profile/manager state and setup progress.
17. Once a hostel exists, show logical real operational figures: hostels, residents/people, bookings, occupancy, pending work, properties/branches/beds, revenue/rent/outstanding and relevant actions/reports.
18. Add an Owner side menu containing Edit profile, platform terms and conditions, Help & Support, language settings, privacy policy, Sign out, Delete account, notifications, Customer-mode switching and other supported logical settings.
19. Use the supplied Invite Manager design as the visual reference for that experience.
20. Use the supplied post-creation dashboard reference after hostel creation.

### Execution and cleanup

21. Initially, finish the current work before the later design additions. The user subsequently made the six-step setup the active requested change.
22. Remove superseded old UI code as the replacement is integrated, so duplicate implementations do not accumulate. Preserve required shared business behavior and unrelated existing work.
23. Latest execution order: complete **all requested implementation first**, then physical mobile verification and focused tests. **No large/full test suites.** This supersedes the original broader acceptance-test timing.
24. Latest instruction: **stop here and provide a full report** of work, instructions and intended behavior.

## Work completed and evidence

### Environment and reusable harness

- Inspected the existing local environment and reused the API, database, Redis, storage and scanner services. No database, account, Docker volume or app-data reset was performed.
- Confirmed actual Pixel connectivity and app launch. A focused launch flow passed in approximately 42 seconds.
- Started a dedicated Metro supervisor when needed and recorded its identity. Existing API/workers were preserved.
- Created local Owner acceptance artifacts under `.tools/owner-acceptance`: baseline, checklist, defect register, device results, source inventory, selected-test and device runners, safe account/profile diagnostics and focused Maestro flows.
- Added preflights for API, Metro and local upload storage. Device output containing private information stays in private local evidence directories.
- Initial source inventory covered 123 files and 740 control expressions; it is preliminary and was not refreshed for the newest wizard fragments.
- Did not use the existing native smoke script that reinstalls and seeds a synthetic preverified Owner.

### Genuine account and Owner onboarding

- Read-only checks established that the existing test identity needed email verification and Owner completion.
- Resumed the genuine sign-up flow for that identity. Used its matching local Mailpit verification code in memory without printing or saving the code in the report.
- Reached Set your password. The user entered and submitted the password privately on the phone.
- The user supplied genuine identity details, CNIC images and personal agreement on the phone. The agent did not fabricate identity evidence or accept personal consent.
- After successful profile completion, read-only database checks confirmed verified email, established password, completed Owner, an active organization and an active mobile session.
- A focused force-stop/session-restore check passed in approximately 52 seconds. Owner access remained available after the later certificate-preserving APK update as well.

### CNIC/avatar upload problem

- Found that signed local upload URLs used `localhost:9000`, while USB forwarding initially covered only API/Metro.
- Added the storage forwarding and the runner preflight for port 9000.
- The user retried successfully. Read-only database evidence showed two clean verification-document uploads and a clean avatar.
- Existing pending upload rows were preserved. No private images are reproduced in this report.

### Profile save and identity collision

- Diagnosed the continuation failure using in-memory comparisons: the entered phone and CNIC formats were valid, but the mobile number collided with another existing local identity.
- Explained the cause without exposing that other identity. The user changed to another genuine number, and profile save worked.
- Changed the native `IDENTITY_EXISTS` message to explain that the mobile number or CNIC is already linked, with sign-in/use-your-own-unlinked-details guidance.
- This new error copy has focused source-test evidence; a fresh physical reproduction of the new copy is pending.

### Owner profile edit consistency

- Found that organization name was editable after initial completion even though the existing server only creates it during first completion.
- Restricted that field to first completion and added explanatory copy for later profile edits.
- Focused component assertions passed. A complete physical profile-edit regression is pending.

### Direct inventory creation

- Added native entry points/forms for room type, room and bed creation using canonical contracts and SDK calls.
- Preserved pricing versus inventory permissions, branch/actor scope, integer-paisa amounts, inactive defaults, safe errors and retained command/idempotency behavior.
- Focused entry and form assertions passed at that snapshot.
- No new room type, room or bed was physically/API-verified through these forms yet. This is source implementation with targeted test evidence, not completed inventory acceptance.

### Disposable setup fixture

- Created exactly one disposable hostel through the genuine Owner UI: `E2E-OWNER-Pixel-20261029`, with primary branch `E2E-OWNER-Main`.
- It remains a draft with an explicitly disposable acceptance address. It was not approved or published.
- An initial harness expectation was corrected because the backend already creates a primary draft atomically; another hostel was not created.
- A harness focus error mixed coordinate text during an early save. Existing validation correctly rejected it; the harness repaired the fixture inputs.
- The inventory navigation attempt timed out before inventory creation. No claim of rooms/beds being created is made.

### Automatic location and manual map selection

- Removed visible latitude/longitude entry from native hostel setup.
- Added a foreground current-location attempt when the verified Owner enters setup, status/error guidance and an explicit current-location action.
- Approximate permission is supported. No background tracking, watcher or location foreground service was introduced.
- Automatic detection initializes an empty location draft; it does not silently overwrite a saved/manual pin. Explicit current-location or map selection can change it. Normal Save persists it.
- Permission denial, disabled services, timeout and unavailable native support retain a usable manual/draft path without invented coordinates.
- Added the compatible Expo location dependency and updated native permissions/configuration.
- An initial native prepare unexpectedly attempted a clean because of the installed Expo CLI default and failed with EBUSY. Investigated the installed CLI, backed up relevant native/signing files privately, and corrected `android:prepare` to explicitly use `--no-clean --no-install`.
- The corrected prepare succeeded; signing identity was retained. Manifest checks confirmed foreground coarse/fine permission and no background/service location permission.
- An incremental Android debug build passed in approximately 7 minutes 29 seconds. The APK package, permissions and matching signing certificate were checked before `adb install -r`, which succeeded without uninstalling or clearing app data.
- On the actual Pixel, focused checks observed current-location detection, a rendered ready map, manual pin confirmation and successful main-branch save.
- Read-only database comparison confirmed that the explicit manual change persisted. No actual private GPS coordinates are printed here.
- This is a narrow verified location result; it does not certify the subsequent unfinished wizard or the whole Owner journey.

## Partial work at the stop point

### Optional saved tier/year

- Added optional nullable property tier/year to contracts, SDK form/body mapping, backend setup policy/projection and Drizzle schema.
- Existing records are intended to remain null; no guessed backfill.
- Added tier validation and integer year validation, including a current-year boundary.
- Generated `packages/db/migrations/0060_owner_setup_metadata.sql` plus Drizzle metadata.
- **Migration 0060 was not applied.** Existing hierarchy migration 0059 is also pending in the local runtime checkpoint.
- No migration backup/apply, API rebuild/restart, regenerated client/OpenAPI validation, or end-to-end HTTP/database persistence verification was completed for these additions.
- Therefore these fields are not yet operational in the installed app/live local API.

### Six-step setup UI

- Added shared Owner color/spacing tokens and setup shell/card/button/step primitives.
- Added draft-aware form/input support and a retained-command bridge for setup actions.
- Added Basic Information and Location & Address step fragments. The basic fragment offers Male/Female labels and optional tier/year fields.
- The existing setup route is still the earlier form with the verified GPS changes. The new six-step wizard is **not fully wired**.
- Building/floor/room workflow, contextual gallery, amenities/services step and comprehensive review/submit step are unfinished.
- A known integration gap remains: the new location step passes a `disabled` prop to geography controls whose existing props were not yet extended. Current source may fail typecheck until integration is completed.
- Shared UI package output has not been rebuilt for the new tokens. The latest additions have not been statically or physically verified.

### Password visibility

- Added Show/Hide behavior in the new shared `flow-input.tsx`, with independent secret-field controls, accessibility labels, value preservation and disabled-while-saving handling.
- This is source-only partial work. No new focused regression/static check or phone verification has confirmed the Set password experience after this change.

### Design and documentation

- Preserved all four supplied reference images under `docs/design/references/`: empty dashboard, Invite Manager, active dashboard and setup wizard.
- Added location and setup metadata SRS notes/ADRs, and updated relevant status, schema/API/screen documentation.
- References have been saved as design guidance; saving them is not implementation of those screens.
- No superseded old Owner UI has been deleted yet because its replacement is incomplete.

## Still pending

| Requested area                                         | Status at stop                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| More Islamabad/Rawalpindi sectors and areas            | Not implemented; observed existing catalog was limited to Islamabad F-8/H-12 and Rawalpindi Saddar |
| Fully integrated Male/Female-only selector             | Fragment written; active setup replacement pending; legacy stored types need compatible handling   |
| Optional tier/year working end to end                  | Source/migration generated; apply, runtime update and verification pending                         |
| Complete six-step wizard and navigation/draft behavior | Partial first two step fragments only                                                              |
| Building/floors/room types/rooms/beds in setup         | Pending integrated hierarchy screens and verification                                              |
| Photos grouped by appropriate room/floor context       | Pending                                                                                            |
| Amenities/services persisted selections                | Pending                                                                                            |
| Preview of every saved section and real submit gate    | Pending                                                                                            |
| Professional pre-hostel dashboard                      | Reference saved; implementation pending                                                            |
| Professional active dashboard and real metrics         | Reference saved; implementation pending                                                            |
| Owner landing directly on dashboard after login        | Pending                                                                                            |
| Side menu and requested account/settings destinations  | Pending                                                                                            |
| Invite Manager visual redesign                         | Reference saved; implementation pending                                                            |
| Show/Hide password fully verified                      | Source fragment added; verification pending                                                        |
| Remove superseded Owner UI                             | Pending replacement completion                                                                     |
| Focused final tests and physical verification          | Pending; intentionally deferred by latest user order, then stopped                                 |
| Full Owner acceptance / hosted CI / release            | Not certified; no release or deployment performed                                                  |

## Behavior constraints recorded for the remaining work

These are implementation interpretations of the user's requests and existing project rules, not additional claims that the user explicitly approved every detail below.

- Dashboard counts, finance totals, activity and photos must come from scoped real data. Screenshot names, growth percentages, balances and photos are examples, not runtime facts.
- Pre-hostel dashboard should emphasize setup; operational/finance widgets belong after hostel creation as requested.
- Male/Female is the requested visible gender choice; Standard/Premium/Luxury is a separate optional property tier.
- Existing legacy hostel types should remain readable; do not silently rewrite historical records to remove visible choices.
- Geographic coordinates may remain necessary internal map data, while the user-facing numeric fields are removed.
- Gallery must use supported upload targets and real hierarchy associations; do not invent an unsaved floor-media entity or ignore submitted fields.
- Submit must use actual backend validation/verification state. Creating a draft does not approve or publish a hostel.
- Manager reference design does not itself authorize inventing email delivery or unsupported role grants. Preserve actual branch prerequisites and backend authorization unless a business change is approved.
- Customer-mode switching must respect genuine capabilities/onboarding.
- A Delete account menu request is not permission to delete this test account. Any implemented closure must respect history, financial records and retention rules.
- Legal/help/language/notification destinations need supported behavior; avoid invented policy text and cosmetic switches that do not save anything.
- Keep the Android UI adapted to the actual device; do not reproduce the reference images' phone frames or iPhone status bars.

## Verification ledger and limitations

Observed selected results before the latest partial wizard changes:

| Area                                              | Recorded result                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Profile regression                                | Initially failed; after fix 6 assertions passed                                   |
| Inventory entry wiring                            | Initially failed; after wiring 18 assertions passed                               |
| New inventory creation forms                      | 7 assertions passed                                                               |
| Identity messaging/profile/private-file selection | 45 assertions across 3 selected files passed                                      |
| Location component selection                      | Expanded selection: 18 assertions across 4 files passed                           |
| Location unit selection                           | 8 assertions passed after correcting asynchronous fake-timer test synchronization |
| Mobile lint/typecheck                             | Passed at earlier profile/inventory/location snapshots                            |
| Native config typecheck                           | Passed at the location snapshot                                                   |
| Location Android build/update                     | Build and certificate-preserving update passed                                    |
| Physical location/manual map persistence          | Focused device flows and DB comparison passed                                     |
| Optional metadata contracts                       | Initial valid-tier failures; after schema change 45 selected assertions passed    |

Several selected Vitest commands exited nonzero because the unchanged global coverage floor was evaluated against an intentionally small selection. Passing assertion counts are **not** reported as a passing complete coverage gate. One early inventory static check failed due to an incomplete test fixture, then its corrected rerun passed. One early location unit run timed out due to test synchronization, then the corrected rerun passed.

No large/full suite was run in this session. There has been no fresh test, static check, device check or acceptance campaign on the final partial wizard tree. Hosted CI remains an existing external acceptance dependency; it was not newly certified here. AUD-003 full-process restart persistence remains the existing accepted exception, not a newly solved issue.

Private test evidence and signing backups remain local. Passwords, OTPs, CNIC details/images, personal phone numbers, environment secrets, signed URLs and private GPS coordinates are intentionally excluded.

## Resume checkpoint, only if requested

Resume from the partial local source without discarding unrelated changes. Complete metadata/runtime integration and the six setup steps, then dashboard/menu/Manager/geography and old-UI cleanup. Resolve the known integration gap before claiming a build. Follow the user's latest order: finish implementation first, then focused checks and physical Pixel verification; no large test campaign. Commit/push only if explicitly authorized.
