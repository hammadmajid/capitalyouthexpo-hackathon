# HSM — PHASE 1 MASTER EXECUTION PROMPT

## Foundation, Authentication, Marketplace & Booking Gap Closure

### Revised 12-Phase Development Roadmap

# 1. YOUR ROLE AND MISSION

Act as a Principal Software Architect, Senior Full-Stack Engineer, Security Engineer, Database Architect, QA Lead, and Autonomous Codex Development Agent.

You are working on HSM — Hostel Marketplace & Management System.

**Your immediate assignment is to complete Phase 1 of the NEW 12-phase remaining-work roadmap.**

This is NOT the original historical Phase 1.

The new Phase 1 is:

**Foundation, Authentication, Marketplace & Booking Gap Closure.**

Your objective is to bring all approved foundational, authentication, hostel-onboarding, marketplace, booking, visit, chat and waiting-list functionality assigned to this phase to full implementation completeness.

Existing work must be reused.

Do not rebuild completed features.

Do not implement features assigned exclusively to later phases.

**Prioritize useful implementation, correctness, integration, and completion. Avoid repeated audits, unnecessary refactoring and excessive test execution.**

You must:

1. Inspect the existing Phase 1-relevant code.
2. Determine exactly what is already implemented.
3. Identify all genuine remaining implementation gaps.
4. Complete the missing features.
5. Connect backend, SDK, Web, Mobile and worker components.
6. Verify implementation consistency.
7. Run full applicable phase tests AFTER phase code completion.
8. Fix every relevant failure.
9. Commit and push all legitimate Phase 1 changes.
10. Report verified progress percentages.

Do not stop after creating a plan.

---

# 2. WORKSPACE AND AUTHORITATIVE DOCUMENTATION

Primary working repository:

`E:\hsm-git`

Use the current active Git branch.

Never use the older `E:\hsm-main` directory for implementation.

Before editing:

- Check Git status.
- Check current HEAD.
- Check upstream branch.
- Inspect recent commits.
- Identify existing uncommitted changes.
- Preserve legitimate existing work.

Read the relevant project instructions and requirements:

- `AGENTS.md`
- `docs/05-roadmap.md`
- `docs/STATUS.md`
- `docs/srs/CHANGES.md`
- Latest approved SRS and supplements.
- Relevant architecture decisions.
- Existing database/API contracts.
- Existing screen and design specifications.
- Relevant acceptance criteria.
- Existing Phase 1 and Phase 2 source and verification records.

Use the latest explicitly approved change when older SRS wording conflicts with a later authorized revision.

Do not assume the original 50-page SRS v2.0 overrides approved later amendments.

Do not guess unresolved business rules.

Do not reinterpret requirements to simplify implementation.

When a material decision is genuinely unresolved, identify the exact requirement conflict and continue independent work rather than stopping the entire phase unnecessarily.

---

# 3. EXECUTION STRATEGY — FAST, IMPLEMENTATION FIRST

Follow this exact sequence:

**Quick targeted audit → Dependency review → Complete implementation → Code-level audit → Phase-wide tests → Fix failures → Final verification → Git commit/push → Progress report.**

## During implementation

Do not repeatedly run entire repository test suites.

Do not repeatedly run the complete API or Web regression after every file change.

Use:

- Relevant typechecking.
- Relevant linting.
- Small focused tests when necessary.
- Contract compatibility checks.
- Static migration review.
- Incremental compilation.

Run essential focused tests immediately for critical authorization, state-transition or concurrency logic when doing so prevents high-risk errors from spreading.

## After completing all Phase 1 code

Run the full applicable Phase 1 testing matrix.

Resolve every failure without weakening tests or accepted behavior.

Reuse successful test outputs only when they apply to the exact relevant source revision and required scope.

Do not omit required phase tests simply because they are expensive.

## Efficiency requirements

- Avoid full-repository rescanning.
- Avoid unnecessary documentation.
- Avoid speculative architecture changes.
- Avoid duplicate services.
- Avoid redundant database queries.
- Avoid unnecessary code generation.
- Preserve build caches.
- Avoid multiple memory-heavy tasks running simultaneously.
- Use current dependency and package tooling.
- Prefer existing design patterns.
- Focus on finishing actual user workflows.

**Spend execution effort on code that closes real functional gaps.**

---

# 4. INITIAL TARGETED AUDIT — ONE PASS ONLY

Begin with a fast, evidence-based audit of existing functionality relevant to Phase 1.

Inspect these areas:

| Area                | What to determine                                                          |
| ------------------- | -------------------------------------------------------------------------- |
| Foundation          | Application startup, package structure, services and infrastructure wiring |
| Authentication      | Signup, verification, login, recovery, sessions and role switching         |
| Owner onboarding    | Profile, business structure, branches and initial configuration            |
| Manager access      | Appointment, temporary credentials, revocation and branch permissions      |
| Hostel setup        | Building, floor, room, bed, pricing, photos and amenities                  |
| Marketplace         | Guest discovery, listings, search, filters, ranking, detail pages          |
| Booking             | Customer requests, approval, reservation, expiry and confirmation          |
| Visits              | Scheduling and management responses                                        |
| Chat                | Customer-management messages, files and privacy                            |
| Waiting list        | Entry, deduplication, vacancy notification and removal                     |
| Client connectivity | Production API ↔ SDK ↔ Web/Mobile                                          |
| Workers             | Booking expiry, notifications and required background actions              |
| Security            | Resource scope, private files, identity and session protection             |
| Tests               | Existing local test evidence and missing acceptance scenarios              |

For each area classify:

`COMPLETE / PARTIAL / MISSING / BROKEN / UNVERIFIED`

Identify exact source files and requirements.

Do not classify a feature as missing merely because its latest complete regression has not run.

Do not classify a feature as complete merely because it has a passing isolated unit test.

Preserve the distinction between implementation and final infrastructure acceptance.

Create a concise Phase 1 implementation checklist.

**Once the checklist is established, stop broad auditing and begin coding immediately.**

---

# 5. WORKSTREAM A — FOUNDATION AND SECURITY GAP CLOSURE

Inspect existing foundation code and repair only actual missing or broken functionality.

Scope includes:

- Application entry points.
- Environment configuration and validation.
- API error handling.
- Shared contracts.
- SDK generation.
- Web and Mobile integration.
- Authentication middleware.
- Authorization services.
- Role and capability evaluation.
- Idempotency infrastructure.
- Transaction conventions.
- Audit logging.
- Worker/outbox dependencies.
- Upload authorization.
- Sensitive-data handling.
- Required rate limiting and security validation.

Reuse existing PostgreSQL/Drizzle, Redis/worker, storage and API architecture according to current repository decisions.

Do not introduce a replacement stack.

Do not create duplicate authentication or authorization systems.

### Required correctness

- All privileged API operations enforce real server-side authorization.
- Manager access is branch-scoped.
- Owner access is limited to owned resources.
- Customer private data is account-scoped.
- Platform Admin does not implicitly receive hostel operational permissions.
- Session revocation must take effect correctly.
- Private file URLs and document IDs must not leak.
- Critical actions retain auditable evidence.
- Errors must not expose internal financial, identity or infrastructure details.

Do not perform a large foundation rewrite unless a real blocking defect proves it necessary.

---

# 6. WORKSTREAM B — AUTHENTICATION AND ACCOUNT MANAGEMENT

Complete the approved authentication experience across applicable Web and Mobile clients.

Inspect current authentication implementation before changing anything.

## Customer authentication

Verify and complete approved:

- Email or other approved signup methods.
- Verification requirements.
- OTP delivery and validation flows.
- Login.
- Logout.
- Password creation and reset.
- Password recovery.
- Session renewal.
- Token/session revocation.
- User profile completion.
- Security/error states.
- Account switching.
- Revalidation after authentication changes.

Use the exact approved authentication provider and verification method.

Do not invent a new SMS/WhatsApp or payment-dependent verification provider.

If external credentials are unavailable, complete provider integration code and clearly document the external configuration required.

Never claim real OTP delivery is verified unless it has been tested against the configured provider.

## Multiple product roles

One identity may legitimately have multiple approved roles.

Implement and verify:

- Customer context.
- Hostel Owner context.
- Assigned Manager context.
- Correct role selection.
- Accurate capabilities.
- Account context changes.
- Private-cache invalidation after access changes.

Do not create duplicate identities merely because the same user has multiple roles.

## Manager authentication

Preserve the approved Manager onboarding process, including:

- Owner-authorized invitation.
- Correct branch binding.
- Approved temporary credential lifecycle.
- Required first-login credential change.
- Revocation.
- Suspended/deactivated states.
- Rejection of unauthorized old sessions.
- Correct manager-to-branch access restrictions.

Do not assume that hiding a screen is sufficient authorization.

All relevant permissions must be enforced by the API.

---

# 7. WORKSTREAM C — OWNER ONBOARDING AND HOSTEL SETUP

Audit the existing Owner and hostel configuration flows.

Complete only genuine gaps.

## Owner and organization

- Owner profile.
- Business/brand ownership.
- Hostel establishment.
- Multiple owned hostels/branches where approved.
- Correct branch selection.
- Owner authorization.
- Required verification documents and status.
- Account and branch relationship history.

## Physical hostel structure

Ensure complete approved operations for:

- Branches.
- Buildings.
- Floors.
- Rooms.
- Room types.
- Beds/seats.
- Published and unpublished records.
- Approved amenities.
- Hostel rules.
- Policies.
- Room and bed pricing.
- Security-deposit disclosure.
- Mandatory photographs.
- Archived and inactive resources.

## Additional existing setup features

Audit and complete those actually required by the approved SRS:

- Effective-dated prices.
- Room duplication.
- Approved CSV imports.
- Manager appointment.
- Hostel location.
- Supported geography.
- Nearby universities.
- Branch payment destinations.
- Listing publication eligibility.
- Platform verification integration.

Maintain the original data consistency rules.

Do not create fictional vacancy counts.

Do not allow archived beds or unpublished records to appear as newly bookable resources.

Do not replace authoritative bed availability with a manually editable marketing counter.

Complete required API, SDK and UI connections.

---

# 8. WORKSTREAM D — COMPLETE PUBLIC MARKETPLACE

The public marketplace must work as a real customer experience.

Guest browsing must remain available without forcing authentication where the SRS permits guest access.

## Discovery

Verify and complete:

- Marketplace home.
- Guest-accessible listings.
- Islamabad/Rawalpindi geographic scope.
- Location and area search.
- University and relevant destination search.
- Distance-based filters.
- Price filters.
- Deposit filters.
- Hostel category and eligibility filters.
- Room type and seater capacity.
- Amenities.
- Mess availability.
- Transport availability.
- Availability-now and selected-date behavior.
- Sorting.
- Organic ranking.
- Pagination.
- Empty, loading and error states.

Use actual stored location and inventory data.

Do not fabricate distance or availability.

Map-provider failure must not make ordinary browsing unusable where the approved fallback allows manual location/search.

## Listing details

Complete:

- Hostel identity and verification status.
- Branch and location.
- Room types.
- Bed/seat choices.
- Mandatory approved photographs.
- Current disclosed rent.
- Deposit and required upfront terms.
- Amenities.
- Rules and cancellation policy.
- Current availability.
- Public contact information according to visibility settings.
- Menu/transport summaries where configured.
- Approved ratings/reviews when available.

Never disclose occupant identity or private financial data in public DTOs.

## Customer utilities

Audit and complete approved:

- Favourites.
- Listing comparison.
- Parent/family share page.
- Correct public SSR/share behavior.
- Authentication transitions from public discovery to booking.

Ensure the page works through actual application routing, not just unit-tested components.

Do not add sponsored ranking or paid placement if not approved.

---

# 9. WORKSTREAM E — COMPLETE BOOKING AND RESERVATION WORKFLOWS

This workstream ends at a correctly confirmed booking.

**Actual resident check-in and Stay creation belong to new Phase 2.**

Do not implement the entire resident-finance system in Phase 1.

However, preserve and complete the approved booking-side requirements necessary for confirmation and the later check-in handoff.

## Customer booking

Implement and verify:

- Selection of eligible hostel/room/bed.
- Correct availability validation.
- Maximum concurrent active-booking limits.
- Submitted booking requests.
- Required customer information.
- Approved booking dates.
- Original pricing snapshot.
- Agreed deposit.
- Disclosed fee terms.
- Cancellation-policy acknowledgement where required.
- Own-booking lists and detail.
- Request withdrawal.
- Booking status history.

## Owner and Manager operations

Complete:

- Authorized booking review.
- Approval.
- Rejection with reason.
- Required policy checks.
- Reservation establishment.
- Booking expiry.
- Correct confirmation requirements.
- Status history.
- Booking notifications.
- Branch-scoped booking management UI.

## Financial requirements before confirmation

Where the approved booking policy requires upfront rent/deposit verification:

- Use the existing approved booking/payment-evidence contract.
- Enforce actual verification requirements.
- Preserve direct-to-hostel payment custody.
- Preserve original pricing and payment evidence.
- Integrate with existing verified financial components where appropriate.
- Do not introduce an unapproved booking fee.
- Do not infer payment solely from uploaded proof.
- Do not create a second incompatible payment ledger.

Resident monthly-payment proof review belongs to Phase 5; booking prerequisite verification belongs to the booking workflow.

## Booking integrity

Preserve:

- No duplicate active reservation for the same exact inventory.
- No invalid confirmation.
- No unauthorized room/bed allocation.
- No confirmation after relevant eligibility expires.
- No silent price change.
- Safe repeated requests.
- Correct idempotency.
- Correct cancellation and expiry release.
- Clear preserved booking-to-check-in handoff contract.

Write real concurrency and rollback acceptance tests for Phase 10, but do not run container-dependent suites in this phase.

Do not bypass existing fail-closed checks merely to allow a booking to confirm.

---

# 10. WORKSTREAM F — VISIT MANAGEMENT

The approved visit workflow must be functional across the required clients.

Implement or complete:

- Manager-configured visiting hours.
- Customer visit requests.
- Date and time selection.
- Availability and eligibility validation.
- Owner/Manager approval.
- Rejection.
- Rescheduling.
- Current visit status.
- Customer/management visit lists.
- Visit-related notifications.
- Historical records where required.
- Unauthorized request denial.

A visit must not be silently rescheduled.

Prevent duplicate, malformed or unauthorized state transitions.

Reuse the existing visit implementation if already present.

---

# 11. WORKSTREAM G — IN-APP CHAT

Inspect current chat architecture and approved realtime technology before making changes.

Complete the approved customer-to-hostel messaging workflow.

Scope includes:

- Conversation creation.
- Correct customer and hostel participants.
- Message submission.
- Message history.
- Read/unread state where specified.
- Management conversation view.
- Customer conversation view.
- Authorized notifications.
- Reconnection behavior.
- Safe message ordering.
- Pagination/history.
- Secure file attachments.
- Report/safety linkage.
- Correct permission revocation.

Use existing Socket.IO or the currently approved real-time architecture.

Do not introduce another messaging stack unnecessarily.

### Privacy

- No unauthorized third-party conversation access.
- No unrestricted Platform Admin chat visibility.
- Reported/safety access requires specific approval and audit.
- Private attachments require authorization and approved scanning.
- Actor/branch changes must clear inaccessible cached messages.

Use focused checks during implementation.

Full relevant chat/security suites run during Phase 1 verification.

---

# 12. WORKSTREAM H — WAITING LIST

Complete approved hostel/room-type waiting-list functionality.

Required behavior:

- Customer can join an eligible waiting list.
- Correct hostel/branch/room-type binding.
- Duplicate active entries prevented.
- Customer can view and leave the waiting list.
- Management receives permitted visibility.
- Availability changes may trigger applicable alerts.
- Notifications use deduplication.
- Availability alerts do not automatically create bookings.
- Historical and expired records follow approved rules.
- Cross-account and cross-branch access is denied.

Reuse existing availability and notification infrastructure.

Do not implement a separate, inconsistent vacancy source.

---

# 13. WORKSTREAM I — PHASE 1 NOTIFICATIONS AND BACKGROUND JOBS

Complete the background operations needed by Phase 1:

- Authentication/security events.
- Manager invitation events.
- Hostel verification outcomes.
- Booking submitted.
- Booking approved/rejected.
- Reservation expiry.
- Booking confirmation.
- Visit requests and decisions.
- Chat events.
- Waiting-list availability.
- Relevant account/permission changes.

Requirements:

- Correct recipients.
- Deduplicated delivery.
- Correct event source.
- Authorized links.
- No private data leakage.
- Safe retry behavior.
- Explicit delivery state.
- Durable outbox/worker integration where existing architecture requires it.

Do not claim external email/SMS delivery succeeded without provider confirmation.

Actual Redis/restart/container tests remain deferred to Phase 10.

---

# 14. REQUIRED WEB, MOBILE AND SDK INTEGRATION

For every completed feature, inspect its actual operational path.

The complete chain must exist:

**Database/domain → API → contracts → SDK → actual Web/Mobile route → user action → authoritative server response.**

Do not leave functionality trapped in:

- Unregistered routes.
- Unexported SDK helpers.
- Unmounted React components.
- Mock-only screens.
- Fixture-only application factories.
- Disabled production paths without documented safety reasons.
- Placeholder forms.
- Hardcoded example data.
- Buttons without actual operations.

Follow the approved design system.

Preserve:

- Accessible forms.
- Loading states.
- Safe error states.
- Empty states.
- Permission-aware navigation.
- Branch selection.
- Account switching.
- Retry behavior.
- Consistent validation.
- Mobile responsiveness.
- Correct session-expiry handling.

Only implement the platforms required by the current approved SRS and change history.

Do not add unnecessary new platform scope.

---

# 15. PHASE-LEVEL IMPLEMENTATION AUDIT

When all Phase 1 workstreams have been implemented, STOP adding new features temporarily.

Perform a targeted code-completeness audit.

Check:

1. Does every Phase 1 requirement have an implementation?
2. Are all required controllers registered?
3. Are the API contracts correct?
4. Is the SDK current?
5. Are all required screens connected?
6. Are background jobs wired?
7. Are permissions enforced in backend code?
8. Are data validation and state transitions consistent?
9. Are audit events present?
10. Are private data and uploads secure?
11. Are errors and retry paths handled?
12. Are there duplicate services or inconsistent business rules?
13. Are missing imports, exports and types resolved?
14. Does the code preserve all approved SRS decisions?
15. Are later-phase requirements correctly excluded rather than silently forgotten?

Correct actual defects.

Do not refactor unrelated working code.

**The target is to eliminate preventable integration and test failures before launching expensive phase-wide tests.**

---

# 16. PHASE 1 TESTING STRATEGY

Run complete relevant phase testing only after Phase 1 code is implemented and audited.

## A. Static and build checks

Run all applicable:

- Typechecking.
- Linting.
- Contract checks.
- API builds.
- SDK generation and drift checks.
- Web build.
- Required Mobile build/export checks.
- Relevant security static checks.

## B. Functional tests

Run required unit and component suites for:

- Authentication.
- Session lifecycle.
- Role switching.
- Owner onboarding.
- Manager appointment/revocation.
- Hostel setup.
- Branch and inventory permissions.
- Marketplace discovery.
- Search and sorting.
- Pricing and availability.
- Booking transitions.
- Booking confirmation.
- Visit scheduling.
- Chat privacy and messaging.
- Waiting list.
- Worker/notification behavior.
- Web and Mobile interactions.

## C. Security tests

Verify:

- Customer/Owner/Manager privilege separation.
- Cross-branch authorization denial.
- Foreign account denial.
- Revoked permissions.
- Secure temporary credentials.
- CSRF and relevant rate limits.
- Private document access.
- Safe attachment validation.
- Booking replay and idempotency.
- Sensitive-data privacy.

## D. Deferred tests

Write and preserve all required real infrastructure scenarios, including:

- PostgreSQL constraints.
- Migration application and replay.
- Concurrent reservations.
- Transaction rollback.
- Redis/BullMQ retries.
- Storage/scanner integration.
- Full application-container tests.

Mark these:

`IMPLEMENTED — NOT RUN — DEFERRED TO PHASE 10`

Do not run Docker or Testcontainers during Phase 1.

Do not claim such tests passed.

## E. Failure resolution

If a full phase test fails:

1. Inspect the actual failure.
2. Identify the root cause.
3. Correct source or genuinely defective fixtures.
4. Run focused confirmation.
5. Rerun the required phase tests against corrected source.

Never:

- Delete failing assertions.
- Skip tests.
- Lower coverage thresholds.
- Increase timeouts just to hide failures.
- Change an approved policy to make a test pass.
- Mark a failed command as successful.

Keep expensive full-suite reruns limited to genuinely necessary verification passes.

---

# 17. PHASE 1 EXIT CRITERIA

Phase 1 can be declared **IMPLEMENTATION COMPLETE** only when:

- Every approved Phase 1 functionality gap is closed.
- All required API routes and services are connected.
- All required SDK interfaces are current.
- All required Web/Mobile experiences are functional in source.
- Required worker code is connected.
- No missing authorization checks remain.
- Booking confirmation and reservation logic are complete.
- Visits, chat and waiting list meet their approved implementation requirements.
- No known Phase 1 feature remains merely a disconnected component.
- All required non-container phase tests and static checks pass.
- Remaining Phase 10/11 acceptance dependencies are explicitly tracked.
- All intended Phase 1 code is committed and pushed.

This is an **implementation-completion gate**, not a final production acceptance claim.

Any runtime capability requiring real PostgreSQL or Redis proof must remain guarded until required Phase 10 acceptance passes.

Do not falsely report production readiness.

---

# 18. MANDATORY GIT COMMITS AND PUSH

You must commit your work.

Before implementation, inspect existing working changes and preserve them safely.

After each coherent, verified functional milestone:

1. Review the actual diff.
2. Stage only intended changes.
3. Exclude secrets, logs, caches and unrelated artifacts.
4. Run applicable fast checks.
5. Create an accurate conventional commit.
6. Push to the existing feature branch.
7. Record the commit SHA.

Example commit scopes:

- `fix(auth): close approved authentication workflow gaps`
- `feat(marketplace): complete remaining customer discovery flows`
- `feat(booking): close reservation and confirmation workflows`
- `feat(visits): complete visit management`
- `feat(chat): complete authorized hostel conversations`
- `feat(waitlist): complete vacancy notifications`
- `test(phase1): complete phase-level regression coverage`

Use messages appropriate to the changes actually made.

Do not invent commits.

Do not blindly use `git add -A`.

Do not force-push.

Do not overwrite existing legitimate work.

Do not wait until the end of the phase to commit everything.

Confirm whether each push succeeded.

If network authorization prevents pushing, preserve completed local commits and report the exact blocker.

---

# 19. COMPLETION PERCENTAGES — MANDATORY

Track Phase 1 and overall HSM progress using actual requirements.

At phase start, establish the Phase 1 requirement baseline.

Do not use arbitrary file counts, code volume or number of tests as the primary progress measure.

Use fixed, requirement-based weights that reflect the effort and functional significance of approved deliverables.

Report separately:

**1. Phase 1 implementation completion:** XX%

**2. Overall HSM implementation completion:** XX%

**3. Phase 1 local verification:** PASS / FAIL / PENDING

**4. Infrastructure acceptance:** DEFERRED TO PHASE 10

**5. Final system acceptance:** DEFERRED TO PHASE 11

**6. Production readiness:** NOT YET ACCEPTED

Do not misinterpret the historical 28.9% Phase 3 estimate as overall project completion.

At every meaningful completed milestone provide:

### HSM PHASE 1 PROGRESS

- Phase completion: XX%
- Overall HSM implementation: XX%
- Newly completed requirements: [IDs]
- Remaining Phase 1 requirements: [IDs]
- Local verification: [actual result]
- Docker acceptance: DEFERRED
- Latest commit: [actual SHA]
- Git push: SUCCESS / BLOCKED
- Next target: [one concrete workflow]

Update the persistent source-of-truth progress checklist.

Do not generate lengthy progress reports after every small code edit.

Percentages must increase only when actual functional requirements are implemented.

Keep separate the percentages for implementation and verification.

---

# 20. EXACT SCOPE BOUNDARY — DO NOT START PHASE 2

This assignment covers only revised Phase 1.

Do not proceed to revised Phase 2 until Phase 1 is completed and reported.

Phase 2 will handle:

- Manual/offline resident admission.
- Confirmed-booking check-in.
- Active Stay creation.
- Resident agreement creation associated with check-in.
- The required check-in transaction and occupancy claim handoff.

Later phases cover:

- Full occupancy management.
- Resident transfers.
- Rent and invoices.
- Staff payment recording.
- Resident rent-proof review.
- Deposits and financial corrections.
- Checkout and final settlement.
- Mess and transport.
- Complaints and reviews.
- Platform administration and reporting.

Do not move missing Phase 1 requirements to later phases to make the percentage reach 100%.

Avoid modifying later-phase code except for narrowly required compatibility or defects caused by your Phase 1 changes.

Preserve every approved future requirement.

---

# 21. PERFORMANCE AND RESOURCE CONSTRAINTS

Development is being performed on a Windows machine where heavy builds and test suites have previously created delays and memory pressure.

Apply resource-aware execution:

- Run expensive tests serially where appropriate.
- Preserve Turbo/build caches.
- Avoid unnecessary dependency reinstallations.
- Avoid repeated SDK generation when contracts have not changed.
- Avoid unnecessary full Next.js builds.
- Avoid repeated Jest/Vitest discovery loops.
- Do not start several memory-heavy workers simultaneously.
- Use focused diagnostics before full regression reruns.
- Avoid enormous logs in the conversational output.
- Record command logs locally where needed without committing temporary files.

Do not sacrifice test integrity for speed.

Do not artificially limit legitimate coding work with arbitrary time estimates.

**Optimize the work sequence, not the quality standard.**

---

# 22. FINAL PHASE 1 DELIVERY REPORT

At the end of Phase 1, provide a clear report containing:

### Implementation

- Completed requirements by workstream.
- Changes to backend/database/API.
- Changes to SDK.
- Changes to Web.
- Changes to Mobile.
- Changes to workers/notifications.
- Any remaining known implementation gaps.

### Verification

- Exact local tests executed.
- Actual pass/fail totals.
- Coverage outcomes where applicable.
- Static/build results.
- Tests not executed.
- Docker-dependent acceptance deferred to Phase 10.
- Any external service/provider verification still pending.

### Git

- All relevant commit SHAs.
- Current branch.
- Push confirmation.
- Existing pull request status where accessible.
- Working-tree status.

### Progress

- Initial Phase 1 completion estimate.
- Final Phase 1 implementation percentage.
- Overall HSM implementation percentage.
- Evidence for any percentage increase.
- Clear remaining acceptance dependencies.

### Handoff to revised Phase 2

State the exact interfaces and requirements needed for subsequent resident admission and booking-to-Stay check-in.

Do not start Phase 2 implementation.

---

# 23. BEGIN IMPLEMENTATION NOW

Execute in this order:

**ACTION 1:** Inspect the current Git state and preserve legitimate existing changes.

**ACTION 2:** Read the current approved requirements relevant to revised Phase 1.

**ACTION 3:** Conduct one focused audit of existing Phase 1 functionality.

**ACTION 4:** Establish requirement-based initial Phase 1 and overall HSM implementation estimates.

**ACTION 5:** Immediately begin closing actual implementation gaps, prioritizing end-to-end workflows.

**ACTION 6:** Perform lightweight correctness checks throughout implementation.

**ACTION 7:** Complete every Phase 1 requirement and connect actual application entry points.

**ACTION 8:** Conduct the final Phase 1 code-completeness audit.

**ACTION 9:** Run the complete applicable Phase 1 test suite.

**ACTION 10:** Correct failures and obtain required non-container verification.

**ACTION 11:** Commit and push all legitimate Phase 1 changes.

**ACTION 12:** Provide the final report, completion percentages and Phase 2 handoff.

Do not spend the execution session repeatedly planning or auditing.

Do not run Docker or real container-dependent testing.

Do not start Phase 2.

Do not invent product requirements.

Do not skip mandatory features.

Do not weaken security or testing.

Do not claim success without supporting evidence.

**FINAL DIRECTIVE:**

Complete Phase 1 of the revised HSM roadmap as efficiently as possible. Reuse existing work, think through dependencies before coding, implement complete user workflows, perform full phase testing after implementation, fix defects correctly, commit and push the results, and report accurate completion percentages.

**The target is 100% Phase 1 code implementation with all applicable non-container phase checks passing—not an unsupported claim of production readiness.**
