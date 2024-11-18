# Phase 3: marketplace and booking completion

Approved by the user's master implementation directive on 2026-10-24. This
supersedes the active phase numbering of the 2026-10-22 revised Phase 1 prompt.
Historical source, approvals and acceptance evidence remain preserved.

## Boundaries

Complete setup/publication, marketplace, visits, chat, waiting lists, booking
through confirmation, and their notifications. Actual admission, ResidentStay
creation and occupancy handoff belong to Phase 4. Do not activate historical
resident/finance mutations as part of this assignment. Domain rules in SRS v2.0
and CHG-001..014 remain authoritative; this execution revision changes scheduling,
not pricing, authorization, disclosure, booking states or retention.

Critical PostgreSQL/PostGIS, Redis, transaction and realtime acceptance is now
required within Phase 3. A source implementation, selected assertions or an
infrastructure smoke check cannot establish phase completion.

## Environment reconciliation

- Repository: `D:/hsm`; Windows 11 Pro; Node 24.22.1.
- Existing branch: `codex/recovery-20261023`; starting HEAD `045bc54`.
- Remote: `https://github.com/ammad981/hsm.git`; tracking origin branch of the
  same name; initially five local commits ahead. Normal pushes are authorized by
  this directive, superseding earlier no-push assignments.
- `git fsck --no-reflogs --connectivity-only` exits 0; dangling objects are retained.
  No index recovery, clone, reset or cleanup is necessary.
- Existing dirty files and untracked migration 0040 are preserved. Initial patch
  and untracked inventory are in ignored `.tools/phase3-start-*` evidence files.
- Use `corepack pnpm` (10.18.3); shell `pnpm` resolves to 11.25.0.
- Existing Docker Desktop was stopped; started with its installed executable.
  Engine 29.9.2 is reachable; Compose configuration validates. Existing development
  containers/volumes remain untouched. Docker memory is approximately 3.5 GiB;
  run tests serially and use isolated Testcontainers databases.

## Requirement checklist

| Workstream                               | Source evidence                                                                           | Current classification / remaining                                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup/publication                        | inventory, Web/Mobile duplication and scoped CSV import; DB0046/0047                      | PARTIALLY IMPLEMENTED: duplication/import connected and transaction-verified; effective pricing, configuration/photos, publishability and verification remain           |
| Marketplace                              | public API, Web/Mobile comparison and server-rendered family summary                      | PARTIALLY IMPLEMENTED: compare/share connected with real source checks; applicable filters, configured services/disclosures and final platform acceptance remain        |
| Booking (BKG-001..009, ACC-001..004/006) | `apps/api/src/booking`, shared SDK and customer/staff booking components                  | PARTIALLY IMPLEMENTED: verify request-to-confirmation and original financial evidence/handoff                                                                           |
| Visits (VISIT-001)                       | API/SDK, both clients, DB follow-up, notification repository and real worker tests        | SOURCE IMPLEMENTED / INTEGRATION VERIFIED: enabled by default, lifecycle/history/follow-up and retry/suppression checked; final browser/device/phase acceptance remains |
| Chat (COMM-001/002, SEC-003)             | contracts, DB0041..45, API chat, SDK, Web/Mobile components, notification/worker delivery | SOURCE IMPLEMENTED / INTEGRATION VERIFIED: messaging, scanned attachments, reported-case safety and immediate revocation; final browser/device/phase acceptance remains |
| Waiting list (WAIT-001)                  | contracts, DB0039/0040, scoped API/SDK/clients, observation and worker delivery           | SOURCE IMPLEMENTED / INTEGRATION VERIFIED: preferences, estimates, lifecycle, retry/deduplication and final eligibility; final browser/device/phase acceptance remains  |
| Notifications (NTF-002)                  | notification outbox, `packages/notifications`, worker runtime                             | PARTIALLY IMPLEMENTED: finish phase event/worker paths and retry/recipient acceptance                                                                                   |

Connected milestone: WAIT-001 join/list/leave, authorized branch list, retained
history and duplicate prevention through the normal production API and clients.
Static graphs26/26 and34/34 pass; normal generation10/10 passes. Complete SDK
745/51 passes. Real Docker HTTP5/5 passes. Native selected10/3 passes; Web selected
4/4 assertions pass but its command exits1 on unchanged global coverage floors.
Full Web/phase/browser acceptance remains pending. Evidence is in STATUS.md.
Reuse migration 0039 and additive stabilization 0040; never recreate tables.

## Progress accounting

Do not reuse the old 55.4% revised Phase 1 figure or historical resident/finance
Phase 3 percentages. The new denominator excludes foundation/auth and later
resident operations. Current traceable implementation percentage is PENDING until
the requirement inventory has been checked; no unsupported numerical baseline is
claimed. Overall HSM percentage is likewise PENDING because the complete weighted
12-phase requirement allocation is not present in the supplied directive.

Phase 3 verification: static/unit PENDING; Docker integration PENDING; phase
regression PENDING; browser/realtime PENDING. Fully accepted workstreams: 0/7.
This is not production acceptance. Increase implementation credit only for
connected required functionality with recorded evidence.

## Next actions

- [x] WAIT-001 normal API, generated SDK and both clients; own/branch privacy tests.
- [x] Expected vacancy controls with current scope, version preconditions and audit.
- [x] Actual named/paginated room-type preferences in both clients, retained on retry.
- [x] Vacancy event fanout, worker/sweep registration and retry/deduplication.
- [x] VISIT-001 source activation and real PostgreSQL/worker lifecycle, retry and suppression checks; final browser/device gates remain below.
- [ ] Trace remaining setup, marketplace and booking gaps once; implement closures.
- [x] COMM-001/002 messaging source and real database/socket/Redis checks; final browser/device gates remain below.
- [ ] Completeness review, final applicable regressions/builds/security and handoff.
- [ ] Commit/push each verified milestone and attach the resulting PR.
