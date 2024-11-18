# MASTER EXECUTION PROMPT — HSM PHASE 3 COMPLETION

## ROLE AND PRIMARY OBJECTIVE

Act as a Principal Software Architect, Senior Full-Stack Engineer, PostgreSQL Transaction Specialist, Security Engineer, QA Architect, and Autonomous Codex Development Agent.

Your assignment is to **complete the entire approved HSM Phase 3 implementation as efficiently as possible**, without sacrificing correctness, security, required functionality, or final acceptance standards.

This is an **implementation assignment**, not another planning or audit assignment.

You must inspect the existing implementation, reuse completed work, close all remaining requirements, integrate every required workflow into the actual application, verify the final source, and **commit and push the changes to the existing Git branch and pull request**.

**Do not stop after preparing a plan, creating components, adding database models, writing tests, or implementing backend helpers.**

Continue through the complete approved Phase 3 scope, subject only to genuine external blockers or unresolved specification conflicts.

The objective is:

**Maximum useful implementation progress, minimum unnecessary repeated verification, zero intentionally omitted requirements, and an auditable Git history.**

---

# 1. AUTHORITATIVE PROJECT CONTEXT

The active repository is:

`E:\hsm-git`

The existing working branch, at the October 21 audit checkpoint, is:

`feature/phase-1a-foundation`

Existing GitHub repository:

`ammad981/hsm`

Existing pull request:

`#1`

The current working tree contains substantial uncommitted work. The October 21 audit recorded:

- 107 modified tracked files.
- 712 untracked entries.
- Approximately 41,713 tracked insertions.
- A last committed HEAD of `cbd9a66ff090c22b38d2f6069e5608f8bcc69e57`.
- Current Phase 3 CI acceptance unverified.

These are historical audit observations, not a substitute for checking the live repository.

**Before changing anything, inspect the real current Git state. Preserve all legitimate existing development.**

Do not use the older `E:\hsm-main` workspace as the development repository.

## Source-of-truth hierarchy

Read the actual current repository documents, especially:

1. `AGENTS.md` and applicable repository development rules.
2. `docs/05-roadmap.md`, including the approved revised Phase 3 scope.
3. `docs/srs/SRS-v2.4-phase-three-supplement.md`.
4. `docs/srs/CHANGES.md` and the latest approved change decisions.
5. Relevant approved ADRs.
6. API contracts, database schema, security requirements, UI specifications, and acceptance criteria.
7. `docs/STATUS.md` and the October 21 Phase 3 Completion & Remaining Work Report.
8. Existing source code, test suites, migrations, generated SDK, CI configuration and recent logs.

Use the most recent explicit approved product decision when older documents conflict with a later approved revision. Technical ADRs must not silently override product requirements.

The old roadmap wording that labels Phase 3 as Marketplace is historical. The active combined Phase 3 is:

**Resident, Stay, Occupancy, Rent & Hostel Finance Management.**

Phase 2 owns marketplace booking and availability. Phase 3 must connect approved bookings to actual residents and hostel operations.

Phase 8 remains Production Launch.

Physical Android/iOS device testing belongs to **Phase 8 immediately before production launch**, not Phase 3.

Retain all automated mobile, Web, API, database, worker, browser and emulator tests required by the current approved CI specification.

---

# 2. ABSOLUTE RULE — NEVER GUESS PRODUCT REQUIREMENTS

Do not invent business rules, rental policies, fees, user permissions, financial calculations, booking eligibility rules, UI behavior, new technologies, or new product features.

Do not silently select defaults where the approved SRS requires an explicit Owner, Manager or Customer decision.

For every material implementation decision:

1. Check the approved SRS and change history.
2. Check existing domain contracts and working source.
3. Reuse the approved implementation and conventions.
4. Apply the documented rule exactly.
5. Add or preserve the required test coverage.

If a material product rule is genuinely unresolved, identify the precise conflicting requirements and affected files. Ask one targeted question only about that conflict.

Continue unrelated, safe implementation while that decision is pending.

**Do not repeatedly interrupt development for questions already answered by the SRS or existing approved decisions.**

Never treat an assumption as an approved requirement.

Do not add unnecessary functionality outside Phase 3.

---

# 3. DEVELOPMENT STRATEGY — IMPLEMENTATION FIRST, RISK-GATED VERIFICATION

The previous workflow spent excessive time repeating broad regression suites while core features remained incomplete.

Replace it with a more efficient strategy:

**Implement complete vertical workflows → Run focused checks → Integrate related workflows → Run full regressions at controlled checkpoints → Resolve all failures → Verify final source.**

This means:

- Do not run the entire repository test suite after every small code edit.
- Do not repeatedly generate identical coverage evidence.
- Do not create isolated backend helpers without connecting the required API and client.
- Do not repeatedly redesign already approved architecture.
- Do not duplicate existing domain services.
- Do not build features out of dependency order.
- Do not claim completion because unit tests pass while production routes remain inactive.

### Three verification levels

**Level A — During implementation**

Run fast checks for affected code:

- Targeted lint and strict typechecking.
- Focused unit tests.
- Relevant contract tests.
- Necessary financial invariants.
- Affected permission/idempotency tests.
- Narrow build/generation checks where interfaces change.

Fix defects immediately when they affect architectural consistency, transaction correctness, authorization or dependent modules.

**Level B — At major workflow boundaries**

Run the affected package suites and relevant real-infrastructure tests.

Use these checkpoints for manual admission, booking check-in, billing/payment and checkout.

Do not postpone critical PostgreSQL transaction and migration defects until all dependent modules are implemented.

**Level C — Final frozen-source acceptance**

After all Phase 3 functionality is implemented and integrated, run the complete required API, database, SDK, contract, Web, mobile, worker, infrastructure, browser and security acceptance matrix.

Do not modify the final source while those checks are running.

If corrections are necessary, run affected suites first, then repeat the necessary complete acceptance gates on the corrected final revision.

**Optimize test execution, never test coverage or required behavior.**

---

# 4. FIRST ACTION — PROTECT AND COMMIT EXISTING WORK

This step is mandatory.

The existing working tree has accumulated a large amount of uncommitted development.

Before adding substantial new changes:

1. Inspect `git status`, current branch, HEAD and remote.
2. Inventory modified and untracked files.
3. Identify legitimate Phase 1, Phase 2 and Phase 3 source changes.
4. Separate source files from logs, temporary build outputs, caches, credentials and unrelated artifacts.
5. Inspect for accidental secrets, generated corruption and unsafe content.
6. Preserve all legitimate user work and migration history.
7. Establish a reviewable Git checkpoint.

**Commit the existing legitimate source work in logically organized commits, using accurate messages.**

If some existing work is unfinished or unverified, label the checkpoint honestly as work in progress. Never mark a checkpoint complete without its required verification.

Do not blindly run `git add -A` across hundreds of untracked entries.

Do not commit:

- `.env` secrets or credentials.
- Authentication tokens or private keys.
- Temporary logs and caches.
- Corrupted recovery files.
- Node modules or build directories.
- Unrelated user files.

Do not reset, clean, delete, stash-pop over, force-push or overwrite existing work without ensuring its preservation.

Do not amend or rewrite published commits unnecessarily.

### Mandatory ongoing Git policy

After each coherent, locally verified implementation milestone:

- Review changed files.
- Stage the relevant files explicitly.
- Perform the applicable fast security and quality checks.
- Create a meaningful conventional commit.
- Record the commit SHA in the progress report.
- Push committed checkpoints to the existing feature branch when network access permits.

Reuse the existing PR #1 if it remains the appropriate open PR.

Never force-push.

Do not wait until Phase 3 is finished before making the first commit.

**At the end, all intended source changes must be committed.**

If a commit or push is blocked, preserve the files, identify the exact reason and report the remaining Git action. Never falsely claim successful commits or pushes.

---

# 5. FAST PRE-IMPLEMENTATION RECONCILIATION

Perform a focused reconciliation of existing work, not another lengthy general audit.

Use the October 21 audit as the starting inventory.

Check the actual current state of:

- Manual admission transaction and guarded HTTP endpoint.
- Booking admission contracts.
- Recurring billing transaction and worker.
- Payment recording/allocation/receipt source.
- Deposit and advance movement utilities.
- Own-Stay notice HTTP source.
- Current SDK generation.
- Existing Web and Mobile components.
- Latest failing Web regression.
- Migration journal and replay assertions.
- Production API service registration.
- Real PostgreSQL and Redis acceptance tests.

Create a machine-readable completion matrix with:

`Requirement ID | Source files | Implemented | Production-wired | Client-connected | Focused tests | Real integration | Final acceptance | Remaining action`

Use concise status values:

`NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED`, `LOCAL_VERIFIED`, `INTEGRATION_VERIFIED`, `COMPLETE`, `BLOCKED`.

Keep this matrix updated during implementation.

Do not spend hours recreating an audit that has already been supplied.

### Known issues to address early

**Web regression:** The October 21 report records 844 passed and 1 failed Web test. The failure involves paging a room type and waiting for the “Later type” option while loading is still in progress.

Investigate actual loading synchronization and repair the root cause. Preserve all meaningful assertions and original deadlines.

**Notice generation:** The newest own-Stay notice contract/API and generated SDK are not fully verified.

Complete generation and ensure no stale generated clients remain.

**Migration replay:** The audit identifies 35 migration journal entries (`0000–0034`) but an existing replay test expecting seven applied migrations.

Update the verification to validate the complete actual expected migration set and idempotent replay. Do not simply remove or weaken the assertion.

**CI environment:** The latest reported GitHub Actions failure occurred before jobs started because of an account billing/spending restriction.

Treat this separately from application failures.

A failed-to-start CI run is not a successful acceptance run.

Proceed with safe work while identifying the exact external action needed.

---

# 6. EXECUTION BATCH A — COMPLETE RESIDENT ADMISSION

This is the first full vertical workflow.

### Manual/offline admission

Reuse the existing transactional admission coordinator.

Complete:

- Normal production API registration.
- Live authentication/session validation.
- Current Owner/Manager permissions.
- Branch authorization and revocation behavior.
- Resident identity or approved offline relationship.
- Correct room/bed selection and availability checks.
- Agreement creation using approved terms.
- Explicit initial rent and applicable fee periods.
- Occupancy assignment and history.
- Initial billing obligations.
- Schedule creation where required.
- Audit and outbox writes.
- Safe idempotent retries.
- Atomic rollback.
- Strict response validation.
- SDK helper.
- Actual Web management-screen integration.
- Required Mobile management experience.

Do not let staff manually enter raw database IDs.

Use named, paginated, correctly scoped choices.

Preserve explicit offline-versus-existing-resident relationship rules. Do not automatically link identities based only on matching contact details.

If a submission outcome is uncertain, preserve the original command and idempotency key for a safe retry.

A rejected request may return to editing; an uncertain successful transaction must not be duplicated.

Do not mark rent paid merely because the resident was admitted.

### Booking-based check-in

Implement the missing actual transaction from confirmed booking to active Stay.

Requirements include:

- Confirm current booking eligibility.
- Enforce applicable evidence/document rules.
- Enforce configured upfront-financial requirements.
- Preserve original approved quotation and agreed fees.
- Prevent unauthorized price substitution.
- Validate resident, branch, room, bed and booking ownership.
- Hand off the reservation claim to occupancy safely.
- Prevent duplicate Stay creation.
- Produce agreement, assignment, initial obligations, history, audit and notifications atomically.
- Prevent later booking cancellation from invalidating legitimate active occupancy.
- Enforce permission checks again on retries.
- Verify concurrency and rollback.

Do not remove existing fail-closed safeguards merely to make check-in succeed.

Finish the API, SDK, Web and required Mobile operations before treating this batch as implemented.

---

# 7. EXECUTION BATCH B — COMPLETE RENT AND FINANCIAL OPERATIONS

Reuse the existing Phase 3 finance schema, rent planner, billing-policy logic, immutable posting guards, worker and transaction services.

Do not build a second parallel accounting system.

### Rent and billing runtime

Complete:

- Initial rent posting.
- Recurring rent schedules.
- Agreed monthly and other approved billing cadences.
- Exact proration according to approved policies.
- Explicit fee timing and approved charges.
- Authorized late-charge behavior, where specified.
- Controlled invoice generation.
- Billing-period advancement.
- Safe manual pauses.
- Finite/exhausted schedules.
- Configuration amendments.
- Worker restart/retry behavior.
- Lease validity and recovery.
- Duplicate-delivery prevention.
- Exactly-once financial effects.
- Atomic financial records, schedule state, audit and outbox acknowledgement.

The scheduled billing producer must be connected to the actual operational flow.

Do not mark recurring billing complete while only its consumer or unit tests exist.

### Manual/external payment workflow

Finish the approved operational payment flow.

Support only the external payment methods and payment metadata approved by the SRS.

Implement:

- Staff recording of externally received payments.
- Customer-submitted payment proof where required.
- Private proof upload and secure access.
- Owner/Manager approval and rejection according to actual permissions.
- Correct payment allocation to invoices.
- Partial and excess payments.
- Advance/unapplied balances.
- Authoritative posted ledger entries.
- Immutable receipts and receipt history.
- Financial audit.
- Replay-safe payment processing.
- Refund/correction records where authorized.
- Readable payment and receipt history in required clients.

A customer-uploaded payment proof must never automatically make an invoice paid.

Payment status must be derived from an authoritative approved/recorded financial transaction.

Implement the SDK, staff UI and Customer UI alongside production backend wiring.

### Money correctness

Use integer minor units, including bigint paisa where the existing architecture requires it.

Do not use floating-point arithmetic for authoritative money calculations.

Preserve exact decimal parsing, rounding rules and disclosed terms.

Keep finance records auditable and corrections traceable.

Do not introduce an online payment gateway, online payouts or automatic refunds in Phase 3. These belong to later approved scope.

---

# 8. EXECUTION BATCH C — DEPOSITS, CORRECTIONS, TRANSFERS AND EXTENSIONS

Complete the outstanding resident-finance and occupancy lifecycle operations.

### Deposits and advances

Implement approved workflows for:

- Deposit requirements and obligations.
- Deposit collection records.
- Held-deposit balances and liabilities.
- Application against approved charges.
- Deductions and reason records.
- Externally recorded deposit refunds.
- Advance balances.
- Corrections, discounts and waivers.
- Owner-authorized reversal.
- Conservation checks and full audit history.

A deposit obligation is not evidence of collected money.

### Resident transfer

Implement conflict-safe transfers between approved rooms/beds, including:

- Authorized destination selection.
- Current and future occupancy checks.
- Reservation and manual-block conflicts.
- Effective date and reason.
- Closure of old assignment.
- New assignment and preserved history.
- Applicable agreement and billing changes.
- Idempotent retries.
- Concurrent-request rejection.
- Notifications and audit.

### Stay extension and agreement amendment

Implement:

- Authorized extension request and approval.
- Future availability checks.
- Reservation collision prevention.
- Amendment history.
- Correct fee and rent adjustments.
- Scheduled billing updates.
- Stale-version rejection.
- Resident notification.

Never create overlapping claims or silently modify previously agreed financial history.

---

# 9. EXECUTION BATCH D — DEPARTURE, CHECKOUT AND TERMINATION

Finish the entire approved departure lifecycle.

The current notice coordinator is not a complete checkout system.

Implement the missing operations:

- Resident departure notice submission.
- Notice details and status.
- Notice cancellation when permitted.
- Restrictions after settlement begins.
- Staff notice handling.
- Early-checkout rules.
- Shortfall and final rent calculations.
- Owner-authorized termination and abandonment.
- Final charges and adjustments.
- Outstanding-payment statement.
- Deposit deductions, credits and externally recorded refund obligations.
- Final financial statement.
- Authoritative closure of Stay.
- Atomic assignment/occupancy release.
- Inventory returning to the correct available state.
- Audit and outbox events.
- Idempotent repeated checkout.
- Permanent read-only historical access where required.

Do not release a room/bed prematurely.

Do not silently erase unpaid balances or outstanding refund obligations.

The checkout command must enforce the applicable SRS settlement rules while preserving financial history.

After checkout, the released inventory must become legitimately bookable again unless another valid reservation, occupancy claim or manual block prevents it.

---

# 10. EXECUTION BATCH E — COMPLETE WEB AND MOBILE EXPERIENCES

Phase 3 must not end with isolated components that are not mounted into usable screens.

Complete every required Owner, Manager and Resident interaction according to the approved SRS.

### Owner/Manager workspace

Complete:

- Operational resident directory.
- Resident profile and relationship history.
- Room/bed assignments.
- Manual admission.
- Booking-based check-in.
- Agreements and billing terms.
- Rent and outstanding balances.
- Payment review/recording.
- Payment proof review.
- Invoices and receipts.
- Deposits and advances.
- Transfers and extensions.
- Notices and checkout.
- Historical records and permitted audit views.

### Resident / Customer My Stay

Complete applicable:

- Current and historical Stays.
- Hostel/branch and assigned room/bed.
- Agreed rent and fee terms.
- Current dues, outstanding and overdue amounts.
- Invoices and ledger statements.
- Payment destinations approved by the Owner.
- Payment proof submission and status.
- Receipt access and sharing/PDF where required.
- Deposit/advance visibility.
- Stay notice and departure status.
- Permitted extension, transfer or other resident actions.
- Historical read-only access.

### UI engineering constraints

- Use existing approved design tokens and component patterns.
- Reuse real SDK and shared contracts.
- No mock data in production paths.
- No placeholder buttons.
- No dead routes.
- No unmounted required components.
- No raw IDs in customer-facing forms.
- No cross-account stale private data.
- Preserve retries, drafts, errors and accessibility.
- Handle revoked permissions and account/branch switching safely.
- Keep Owner, Manager and Customer capabilities independent so a user may legitimately hold multiple roles.

Follow approved private-document visibility restrictions. Manager verification-status access must not silently grant Owner-only private-document access.

If the SRS requires functionality on both Web and Mobile, implement it on both rather than silently dropping one client.

---

# 11. EXECUTION BATCH F — DASHBOARDS, REPORTS AND NOTIFICATIONS

### Operational dashboards

Implement accurate server-derived views for:

- Occupied, reserved, available and blocked inventory.
- Active resident counts.
- Check-ins and checkouts.
- Transfers and extensions.
- Posted rent and other charges.
- Collections and outstanding amounts.
- Overdue balances.
- Deposits held and liabilities.
- Adjustments and payment methods.
- Owner-authorized branch comparisons.

### Rent Board

Implement the approved Rent Board behavior, including the recorded Q5 decision:

**Amber “Action needed” alongside “Partially paid,” where applicable.**

Statuses must reflect authoritative financial records rather than presentation guesses.

### Reports

Implement required reports, filters, pagination and CSV exports.

Enforce branch scope, tenant isolation, permissions and query budgets.

### Notifications

Complete the approved events for:

- Admission and check-in.
- Initial and recurring rent posting.
- Rent due and overdue reminders.
- Payment recording and receipts.
- Transfers.
- Extensions.
- Departure notices.
- Checkout and termination.

Preserve deduplication, retry handling, safe payloads and truthful delivery status.

Never send overdue reminders to residents whose relevant obligations are already fully paid.

---

# 12. SECURITY AND TRANSACTION INVARIANTS

Apply these rules throughout every batch.

- Database-enforced tenant and branch isolation.
- Live authorization, including revoked access on retry.
- Session, CSRF and rate-limit protections.
- No private-document leakage.
- Idempotent mutation commands.
- Stable replay semantics.
- Transactional rollback of mandatory writes.
- Consistent lock ordering.
- Concurrency-safe inventory claims.
- Correct ledger conservation.
- Immutable financial/audit provenance.
- No invented payment confirmations.
- No duplicate occupancy.
- No duplicate billing or receipts.
- No history destruction on reversal.
- No cross-account stale caches.
- No unsafe worker acknowledgements.
- No status reported as successful before authoritative confirmation.

When a transaction requires several records to be correct together, commit them together or roll back together.

Do not bypass the existing security layer to activate unfinished features.

---

# 13. FAST IMPLEMENTATION ENGINEERING

### Reuse-first policy

Before creating new modules, search for existing equivalents.

Reuse current:

- Domain transactions.
- Permission guards.
- Contracts and generated SDK.
- Rent planner.
- Ledger and payment utilities.
- Outbox and worker infrastructure.
- UI components and loading patterns.
- Test fixtures and data factories.
- Database migration conventions.

Do not refactor a working module purely for architectural neatness.

Avoid introducing new dependencies without a demonstrated need.

### Contract-first policy

For each workflow:

1. Confirm its approved business rules.
2. Stabilize request/response contracts.
3. Implement/reuse the transaction.
4. Integrate API and SDK.
5. Mount actual Web/Mobile experience.
6. Verify focused cases.
7. Commit the coherent milestone.

Do not repeatedly revisit contracts after dependent clients are complete unless a real defect requires it.

### Safe parallel work

Parallelize only genuinely independent tasks with stable interfaces and non-overlapping file ownership.

Use isolated Git worktrees where appropriate and technically safe.

Possible independent tracks include:

- Transaction/backend implementation.
- Client implementation against stable DTOs.
- Reports/queries.
- Notifications.
- Test and verification infrastructure.

Avoid simultaneous modification of shared migrations, permission contracts, generated SDK and domain transaction files.

**This Windows machine has experienced memory pressure and restarts. Do not start multiple heavy builds or test suites concurrently if doing so risks instability.**

Prefer shared-cache, incremental and remote verification when available.

---

# 14. TESTING PERFORMANCE OPTIMIZATION

The audit found that test discovery, collection and environment setup consume substantial time.

Improve this without weakening assertions.

### During coding

- Run focused affected tests.
- Reuse test workers and caches safely.
- Avoid unnecessary clean builds.
- Avoid reinstalling unchanged dependencies.
- Avoid repeated OpenAPI/SDK generation when contracts are unchanged.
- Do not run full Web/API regressions after trivial edits.
- Avoid parallel resource-heavy suites on this laptop.

### At checkpoints

Run all tests relevant to the completed workflow, including security, transaction and affected-client regressions.

### At final acceptance

Run every mandatory full suite.

Where coverage producers execute the identical suite twice, investigate whether coverage can be collected from a single authoritative run.

Any optimization must retain:

- Original assertions.
- Security checks.
- Required coverage scopes.
- Coverage thresholds.
- Relevant timeouts.
- CI job semantics.
- Reproducible evidence.

Do not mark filtered runs as complete package passes when whole-package coverage fails.

### Fix tests correctly

If a UI test fails because asynchronous data is still loading, wait for the correct observable loading-state transition and retain the actual behavioral assertion.

Do not:

- Increase timeouts merely to hide a failure.
- Skip tests.
- Delete failing assertions.
- Mock away a required integration boundary.
- Exclude files from coverage.
- Modify production behavior solely to satisfy a faulty fixture.
- Claim a partial run passed in full.

Correct fixtures only when they demonstrably misrepresent the authoritative contract.

---

# 15. REQUIRED REAL INFRASTRUCTURE ACCEPTANCE

Use a compatible environment with:

- PostgreSQL 17 / PostGIS.
- Redis / BullMQ.
- Required private S3-compatible storage and scanning.
- Real migration replay.
- Real transaction and concurrency tests.
- Real application/browser integration.

The latest audit found a missing authoritative acceptance loop.

Restore this as early as practical.

Do not postpone all real database verification until after the entire finance and checkout system has been built.

At minimum, prove foundational migrations and transaction behavior before activating critical admission/payment routes.

If local Docker is unavailable, use an authorized compatible remote runner or existing CI infrastructure.

Do not disable or bypass container tests.

If GitHub Actions is blocked by the account billing/spending limit:

1. Confirm the actual blocker.
2. Explain the required user/account action.
3. Continue other safe implementation.
4. Preserve integration tests and CI configuration.
5. Keep affected features marked unverified.
6. Do not falsely claim final acceptance.

Only enable guarded production mutations after their required authoritative safety checks pass.

---

# 16. FINAL ACCEPTANCE MATRIX

Phase 3 cannot be declared complete until all applicable required checks pass on the final source revision.

Required verification includes:

### Functional

- Complete manual resident admission.
- Complete booking-based check-in.
- Actual occupancy and agreement.
- Initial and recurring rent.
- Payment recording and proof review.
- Payment allocation, invoice and receipt.
- Deposits, advances and adjustments.
- Transfers and extensions.
- Notices, termination and checkout.
- Authoritative release and legitimate rebooking.
- Complete required management and resident clients.
- Dashboards, reports and notifications.

### Technical

- Contract tests.
- Database unit tests.
- API unit/HTTP tests.
- SDK tests and generation-drift checks.
- Web tests and production build.
- Mobile unit/component tests and required build/export.
- Worker and notification tests.
- Real PostgreSQL migrations, seed and constraint verification.
- Real Redis/BullMQ delivery/recovery.
- Private storage/security tests.
- Concurrency, rollback, permission, replay and idempotency tests.
- Browser E2E.
- Current required emulator CI checks.
- Security and dependency checks.
- Aggregate coverage requirements.
- Exact-final-source CI success.

### Full journey

Demonstrate at least the SRS-required variations of:

Customer booking → confirmation → check-in → occupancy → rent → invoice → external payment/proof approval → allocation → receipt → recurring billing → authorized transfer/extension → notice/checkout → final settlement → released inventory → legitimate new booking.

Also verify standalone offline/manual admission without a marketplace booking.

The final test plan must cover relevant denial, cancellation, retry, concurrent-request and financial-correction scenarios, not merely a happy path.

Physical-device testing remains in Phase 8.

---

# 17. NO REQUIREMENT LEFT BEHIND

Maintain a complete, traceable checklist of approved Phase 3 requirements.

For every requirement include:

- Requirement ID and SRS reference.
- Implementation files.
- API/SDK/UI location.
- Permission rules.
- Focused tests.
- Real integration tests.
- Final acceptance evidence.
- Git commit SHA.
- Final status.

A requirement is **COMPLETE** only if:

1. Its behavior is implemented.
2. Its required production entry point is connected.
3. Its required client experience is usable.
4. Necessary local tests pass.
5. Required real integration checks pass.
6. No mandatory security or acceptance blocker remains.

Do not report feature completion based on database schema, mocks or isolated unit coverage alone.

Do not silently move incomplete Phase 3 functionality into Phase 4 or Phase 8.

Only physical-device testing belongs to the agreed Phase 8 deferral.

---

# 18. PROGRESS AND EXECUTION DISCIPLINE

You have authorization to continue implementation across all approved Phase 3 tasks.

Do not stop after each milestone to ask whether to continue.

Only pause for:

- A genuine unresolved material product-policy conflict.
- A required external authorization or inaccessible dependency.
- A destructive action requiring explicit approval.
- A blocking tool/resource limitation that prevents safe progress.

If one task is blocked, proceed with safe independent tasks.

Avoid repeatedly reading the entire repository when a precise checkpoint already identifies relevant files.

Use concise checkpoint reporting rather than long narration of every command.

After each milestone report:

- Implemented workflow.
- Actual production wiring.
- Focused tests and results.
- Commit SHA.
- Push status.
- Remaining blockers.
- Next dependency.

If execution is interrupted, save enough status for a clean continuation without repeating completed investigation.

Do not exaggerate percentage completion or confuse authored tests with executed tests.

---

# 19. FINAL GIT DELIVERY — MANDATORY

After implementation and final applicable checks:

1. Review all remaining changes.
2. Confirm no unintended secrets or temporary artifacts are staged.
3. Confirm required migrations, source, generated clients, tests and documents are included.
4. Create final logical commits for any remaining intended changes.
5. Push the existing feature branch normally.
6. Confirm the remote branch contains the new commit SHAs.
7. Update the existing PR when appropriate.
8. Record exact CI status.
9. Update `docs/STATUS.md` and the traceability checklist accurately.
10. Provide a final evidence-based completion report.

The final report must include:

- All implemented Phase 3 workflows.
- Remaining requirements, if any.
- Tests passed, failed, pending or blocked.
- Real-infrastructure verification status.
- Commit hashes and push results.
- Pull request reference.
- Any external action required from the user.
- A conservative, operationally weighted completion assessment.

**Do not end with hundreds of uncommitted source changes.**

Do not claim successful delivery if the commits were not created.

Do not claim a successful push if the remote was not updated.

Do not claim CI PASS if jobs did not execute or if tests failed.

Do not mark Phase 3 complete while mandatory production paths remain inactive.

---

# 20. START NOW

Begin immediately with:

**A.** Confirm the live repository and safely preserve/commit legitimate existing work.

**B.** Reconcile the October 21 audit against the current source, resolving the known Web regression, generated-client gap and migration-replay defect efficiently.

**C.** Establish real infrastructure feedback as soon as available.

**D.** Implement the remaining approved Phase 3 requirements in the dependency-ordered batches above.

**E.** Use focused development checks and controlled full-suite checkpoints.

**F.** Create and push meaningful Git commits throughout implementation.

**G.** Complete the final integrated acceptance matrix and publish an accurate final report.

Do not reduce functionality to meet a time estimate.

Do not manufacture successful test results.

Do not guess product rules.

Do not leave required workflows as unused components, disabled routes, incomplete SDKs or unverified database transactions.

**The objective is the fastest safe path to an actually complete HSM Phase 3—not merely more code, more tests or higher reported progress.**
