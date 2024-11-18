# HSM AUD-001–015 final acceptance report

Report date: 2026-10-29 (Asia/Karachi). Repository `D:\hsm`, branch
`codex/recovery-20261023`. Evidence: `.tools/final-campaign/` (local, git-ignored).
Live checklist: [audit-remediation-20261027.md](audit-remediation-20261027.md).

## 1. Executive summary

The coordinated local acceptance campaign is complete. Every application quality
gate, every real-infrastructure integration package (DB, Worker, API, Files/ClamAV,
Notifications) and all 19 approved Chrome browser scenarios pass at the final
source. One genuine defect was found and corrected: a never-executed AUD-009 API
acceptance test seeded data that the database correctly rejected (test defect,
not a production defect; `1970a28`). All other first-run failures were proven
environmental and passed on unchanged, file-scoped reruns. No timeout, assertion,
coverage or security gate was weakened.

**Overall decision: LOCALLY ACCEPTED — NOT RELEASE-READY.** Release still requires
hosted CI evidence, physical Android acceptance, full operational recovery
evidence, and a clean-revision certificate (sections 15, 19–22).

## 2. Exact tested source

| Item                                               | Value                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Quality/DB/Worker/API/Files/Notifications campaign | `7b8837a2169a3a091aca1ca53e25849e953c8c95`                                                                 |
| Browser campaign and API focused rerun             | `1970a2854efbc223aa012776a6460310f675ab76` (= `7b8837a` + one API test file)                               |
| Production source hash (before = after)            | `477e0cc7d39cb6f33635f6295ea6b47af130d083ad9a6a93a24c26aa5ea65990`                                         |
| Input hash before → after                          | `233f016d…` → `d28e6830…`; sole changed input: `apps/api/test/integration/dashboard-booking-queue.spec.ts` |
| Manifests                                          | `source-after-quality.json`, `source-after-campaign.json` (2452 files each, per-file SHA-256)              |
| Clean-revision certificate                         | **false** — user-owned uncommitted Login/AGENTS/docs edits; guard intact                                   |
| User-owned changes before vs after                 | byte-identical (`trackedChanges` unchanged)                                                                |

What was and was not tested:

- Server/web packages (`apps/api`, `apps/worker`, `apps/web`, `packages/{db,files,
notifications,contracts,api-client,security,test-support}`) are byte-identical to
  the commits above (`git diff` empty).
- The only uncommitted source reachable by a tested artifact is the additive
  `natureLoginColors` export in `packages/ui/src/login-tokens.ts`. It is absent
  from every production `.next` chunk (present only in sourcemaps/dev chunks).
- Mobile unit/component results ran on HEAD **plus** the user's uncommitted Login
  visual edits; they certify that working tree, not HEAD alone.
- No isolated clean worktree was used: it would require a fresh install and a full
  repeat of every gate on this 4-CPU/8 GB machine. The above byte-level evidence is
  recorded instead; a clean-revision certificate remains an owner action.

Toolchain: Node v24.22.1, pnpm 10.18.3, Turbo 2.11.7, Vitest 3.2.7, Playwright
1.64.0, Testcontainers 11.14.0, PostGIS 17-3.5, Redis 7.4, ClamAV 1.5.4. Config
SHA-256: `pnpm-lock.yaml` c3ca8e85…, `turbo.json` 6827d33a…, `playwright.config.ts`
f2d803b9…, API `vitest.integration.config.ts` e1e8d286…, DB `vitest.config.ts` d262e368….

## 3. Relevant commits

| Commit    | Change                                                   |
| --------- | -------------------------------------------------------- |
| `d897b84` | AUD-010 named report and property controls               |
| `7793dc7` | AUD-009 scoped queue acceptance record                   |
| `b3584a6` | AUD-008 complete atomic announcement audiences           |
| `6d13ec9` | AUD-011 active phase entry points                        |
| `4c7487c` | AUD-012 bounded report measurements                      |
| `691b98d` | AUD-013 explicit audited terminal billing recovery       |
| `0c2cee4` | AUD-015 Root authority serialization                     |
| `9bc9fca` | AUD-013 Redis recovered retry-budget dispatch            |
| `260cd2d` | Approved authenticated-entry routing (AUTH-C)            |
| `7b8837a` | Combined quality checkpoint (AUD-014)                    |
| `1970a28` | AUD-009 pending-queue acceptance test seeds exact claims |

All verified as ancestors of HEAD and pushed to `origin/codex/recovery-20261023`.

## 4. AUD-001–015 matrix

| ID      | Original defect                                       | Correction                                              | Final evidence                                                                                                                                                  | Classification                                                       |
| ------- | ----------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AUD-001 | Settlement/deposit traversal used presentation limits | Complete traversal; bounded details only                | DB settlement 7/7 + checkout 5/5 (long histories, rollback, races); API `audit-settlement-checkout`; Worker billing/checkout 3/3; browser PAY-001, P9-FIX-03    | VERIFIED COMPLETE                                                    |
| AUD-002 | Browser reporter catalog knew 5 of 19 titles          | Closed catalog of all 19                                | Full campaign: 19/19 recognized and passed                                                                                                                      | VERIFIED COMPLETE                                                    |
| AUD-003 | Uncertain command intents lost on remount             | In-memory immutable recovery with live re-authorization | Prior focused/regression evidence; browser AUTH-C                                                                                                               | ACCEPTED EXCEPTION (full-process restart persistence, user-accepted) |
| AUD-004 | Timestamp `To` excluded its day; UTC display          | Inclusive Karachi boundaries                            | API `audit-report-dates` and filter suites pass in full API run                                                                                                 | VERIFIED COMPLETE                                                    |
| AUD-005 | Sampled/truncated financial aggregates                | Complete bounded traversal, safe integers               | API `audit-metrics-completeness`, `audit-report-completeness`; browser OWN-001                                                                                  | VERIFIED COMPLETE                                                    |
| AUD-006 | Report ceiling applied before eligibility             | Eligibility before ceiling                              | API report completeness/options/owner-scope suites; browser OWN-001 download                                                                                    | VERIFIED COMPLETE (local)                                            |
| AUD-007 | CSV omitted completeness metadata/warning             | Metadata through API/BFF/download                       | API report suites; browser OWN-001 real download                                                                                                                | VERIFIED COMPLETE (local)                                            |
| AUD-008 | 5000-candidate audience truncation                    | Distinct-user paging, atomic delivery                   | DB announcement membership 5/5 + delivery 5/5 (1/5000/5001 recipients, rollback/retry); Worker outbox 5/5; Notifications 11/11                                  | VERIFIED COMPLETE                                                    |
| AUD-009 | Plain counts, missing queues, 100-branch ceiling      | Five queue destinations, direct links, Owner paging     | API `dashboard-queues` + corrected `dashboard-booking-queue` (first real execution; `1970a28`); browser OWN-001/ACC-002                                         | VERIFIED COMPLETE                                                    |
| AUD-010 | Missing hierarchy/filters                             | Building/floor/room hierarchy and named filters         | DB `report-property-structure` 4/4; API report filter/options/owner-scope; browser ACC-002 isolation                                                            | VERIFIED COMPLETE (local)                                            |
| AUD-011 | Conflicting phase entry docs                          | Reconciled active scope, history preserved              | Documentation review; no runtime component                                                                                                                      | VERIFIED COMPLETE                                                    |
| AUD-012 | Report performance risk                               | No defect confirmed; measured                           | Focused 1001-row evidence (4.4–5.8 s, 77 queries); full API report suites within unchanged budgets. Larger-than-1001 and production proxy overhead not measured | IMPLEMENTED — ACCEPTANCE PENDING                                     |
| AUD-013 | Terminal billing reused retained Redis attempt        | Explicit audited recovery; distinct budget dispatch     | Worker `billing-recovery` 8/8, `billing-redis-recovery` 1/1 (real Redis/BullMQ) at final source                                                                 | VERIFIED COMPLETE (local)                                            |
| AUD-014 | Provenance/exact-source certification                 | Manifests, hashes, cache provenance                     | Sections 2, 16, 17; clean-revision certificate false; hosted CI unavailable                                                                                     | IMPLEMENTED — ACCEPTANCE PENDING                                     |
| AUD-015 | Adverse coverage; Root demotion race                  | Root serialization; adverse suites                      | API concurrency/security suites; Worker checkout/transport races, disposable restore 1/1; physical device and full ops recovery outstanding                     | IMPLEMENTED — ACCEPTANCE PENDING                                     |

## 5. Unit/component regression (configured package gates)

From the earlier quality campaign at `7b8837a` (`.tools/final-campaign/*.json`):
API 2368, DB 839, Worker 78, Web 1052 (Turbo cache replay), Mobile units 268
(cache replay), Mobile components 383/72 files, Contracts 1073, SDK 1011, UI 23,
shared libraries 23 tasks (15 cache). All PASS with their configured coverage
gates. No production source changed afterwards, so they were not repeated.

## 6. Real-infrastructure integration

| Package          | Full run                                              | Rerun (unchanged limits)       | Result                 |
| ---------------- | ----------------------------------------------------- | ------------------------------ | ---------------------- |
| DB               | 48/51 files; 354 passed, 2 failed, 5 skipped          | 3 files, 22/22                 | 51/51 files, 361 tests |
| DB seed coverage | not evaluated (run failed)                            | 3 files, 18/18; `seed.ts` 100% | PASS                   |
| Worker           | 9 files, 25/25                                        | —                              | PASS                   |
| API              | 91/93 files; 440 passed, 1 failed, 2 skipped (6964 s) | 2 files, 3/3                   | 93/93 files, 443 tests |
| Files/ClamAV     | 3 files, 9/9                                          | —                              | PASS                   |
| Notifications    | 2 files, 11/11                                        | —                              | PASS                   |

All full runs were fresh executions (Turbo cache bypass). DB and API gates are
composites of a full run plus a file-scoped rerun, not single uninterrupted runs.

## 7. Failed attempts and diagnoses

| Failure                                | Cause                                                                                                                 | Evidence                                                                                                   | Action                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| DB checkout: 5 skipped                 | PostGIS readiness log not seen within 60 s (beforeAll)                                                                | `db-integration.log`                                                                                       | Rerun 5/5                       |
| DB settlement mixed case: 30 s timeout | ~1400 sequential fixture inserts under CPU/memory contention; prior runs 11–17 s                                      | rerun 14.2 s                                                                                               | Rerun pass                      |
| DB billing neutral outcome 2           | Windows host clock ahead of Docker WSL2 VM clock; guard rejects `executed_at > clock_timestamp()`                     | temporary probe: +2 s worker clock reproduces exact error, synchronized passes (`db-clock-skew-probe.log`) | Rerun pass; residual risk below |
| API `dashboard-booking-queue`          | **Test defect**: bare reserving `pending_request` rows violate deferred inventory-source guard; never executed before | full-run error "Inventory source and claim must commit together"                                           | Fixed `1970a28`; rerun 1/1      |
| API `auth-delivery`: 2 skipped         | Stack startup exceeded unchanged 180 s hook (~335 MB free RAM)                                                        | rerun 158.8 s                                                                                              | Rerun 2/2                       |

Residual risk (not a current defect): billing execution timestamps come from the
worker clock but are validated against PostgreSQL's clock. Single-VPS deployment
shares one kernel clock; the planned dedicated-database topology
([architecture](02-architecture.md)) needs tight NTP synchronization.

## 8. Browser acceptance (19 approved scenarios)

Run at `1970a28` with `playwright.local-chrome.config.ts` (Chrome channel) and the
closed privacy reporter; unchanged 90 s test / 15 s expect budgets; exit 0,
2026-10-28T22:44:26Z–22:54:38Z. Artifact `browser-campaign.xml`: tests=19,
failures=0, skipped=0.

| #   | Scenario                                            | Result |
| --- | --------------------------------------------------- | ------ |
| 1   | STAY-001 booking and walk-in admission              | PASS   |
| 2   | AUTH-C real identity and session lifecycle          | PASS   |
| 3   | SEC-001 public browser security and accessibility   | PASS   |
| 4   | CHG-006 guest entry and signup return               | PASS   |
| 5   | AUTH-C private Owner evidence and additive access   | PASS   |
| 6   | ACC-001 paged inventory blocking and release        | PASS   |
| 7   | BKG-001 booking checkout and public privacy         | PASS   |
| 8   | ACC-002 real manager scope and revocation           | PASS   |
| 9   | PAY-001 rent proof receipt and checkout             | PASS   |
| 10  | PAY-006 rejected proof partial payment and transfer | PASS   |
| 11  | P9-FIX-01 repriced Stay transfer                    | PASS   |
| 12  | P9-FIX-02 exhausted billing extension               | PASS   |
| 13  | P9-FIX-03 deposit checkout and subsequent refund    | PASS   |
| 14  | CMP-001 complaint reopen and acceptance             | PASS   |
| 15  | SERV-002 transport enrollment and billing           | PASS   |
| 16  | REV-001 verified Stay review and reply              | PASS   |
| 17  | OWN-001 owner dashboard and report                  | PASS   |
| 18  | ADM-001 moderation scope and audit                  | PASS   |
| 19  | ACC-002 cross-branch and resident privacy           | PASS   |

## 9. Security and financial integrity

Covered by passing suites at the final source: API `test/security` and
`test/concurrency` (authorization matrix, branch/tenant isolation, grant
revocation, idempotency/replay); DB guards (receipt-backed payments, immutable
finance history, single deposit spend under concurrency, audit rollback); Worker
exactly-once billing and recovery; Files ClamAV scanning and private storage;
browser privacy/isolation scenarios 7, 8, 19; gitleaks on every commit. No
financial policy, migration or calculation was changed.

## 10. Mobile, device, hosted CI and operations

| Area                                                   | Status                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile lint/typecheck/Android JS export                | PASS (earlier campaign)                                                                                                                  |
| Physical Android (Pixel 6 Pro connected)               | **DEVICE ACCEPTANCE PENDING** — user approved non-destructive testing, but the phone was in active personal use; left untouched per user |
| Hosted CI / PR                                         | **BLOCKED** — `gh` not authenticated; GitHub API returns 403 for the private repo. No hosted CI claimed                                  |
| Disposable PostgreSQL backup/restore                   | PASS (Worker `billing-backup-restore` 1/1) — not offsite DR                                                                              |
| Object-storage, secret/env and offsite recovery drills | NOT RUN — no evidence                                                                                                                    |

## 11. Outstanding exceptions and owner actions before release

1. AUD-003: full-process restart persistence remains a user-accepted exception.
2. Run physical Android acceptance (Maestro flows in `apps/mobile/e2e`, inventory
   in [STATUS](STATUS.md)) when the phone is free.
3. Authenticate GitHub (`gh auth login`) or review Actions in the web UI; obtain a
   real hosted CI pass for `1970a28` or later.
4. Commit or set aside the Login visual work, then produce a clean-revision
   certificate with the existing guard.
5. Measure AUD-012 beyond 1001 rows through the production proxy.
6. Perform object-storage, secret/env and offsite restore drills.
7. Before any dedicated-database deployment, enforce NTP synchronization.

No Phase 12, merge into `main` or deployment is authorized or performed.
