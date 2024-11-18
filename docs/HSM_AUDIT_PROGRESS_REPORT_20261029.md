# HSM audit remediation — full progress report

Report date: 2026-10-29, Asia/Karachi. Repository: `D:\hsm`.
Branch: `codex/recovery-20261023`. Latest pushed checkpoint: `7b8837a`.

## Overall position

The identified implementation corrections and focused follow-up work are in place.
The application quality gates have passed, but **AUD-001–015 are not yet all finally
accepted**. The coordinated real-infrastructure campaign is underway and its first
DB run is currently not green: a settlement test exceeded its unchanged30-second
limit, and five checkout cases were skipped. Diagnosis and acceptance remain open.
No completion percentage, release, merge, deployment or hosted CI pass is claimed.

Your requested overdue, complaints and checkout destinations, direct links and
Owner paging are implemented. Their scoped real database5/5 and Chrome4/4 checks
passed previously. The separate final full19-scenario browser campaign is pending.

## Finding-by-finding report

| Finding                                  | Implemented or investigated                                                                                                                                                                                                                                                                                                                           | What remains                                                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-001 — settlement completeness        | Removed presentation limits from financial totals and fund traversal. Added long-history, rollback, checkout and refund/application race coverage. Earlier focused reader7, checkout5 and HTTP6 cases passed.                                                                                                                                         | Final DB acceptance is not green: one current settlement case timed out and checkout cases skipped. Diagnose and verify without raising timeouts or weakening assertions.                                                                       |
| AUD-002 — browser reporter               | Closed privacy reporter recognizes all19 approved browser titles and preserves actual outcomes with sanitized diagnostics.                                                                                                                                                                                                                            | Execute the complete19-scenario browser campaign.                                                                                                                                                                                               |
| AUD-003 — uncertain command recovery     | Retains immutable command bodies/keys in memory across remounts/backgrounding, with actor/resource binding and live authorization on replay.                                                                                                                                                                                                          | Full-process restart/device persistence remains the explicit user-accepted open exception. Final device acceptance is separate.                                                                                                                 |
| AUD-004 — dates                          | Corrected inclusive Karachi end dates, timestamp boundaries and display behavior. Focused33 cases and real HTTP5 passed.                                                                                                                                                                                                                              | Final integration confirmation at the campaign source.                                                                                                                                                                                          |
| AUD-005 — complete aggregates            | Removed sampling/old-debt cutoffs from affected financial aggregates; uses complete bounded traversal and safe integer arithmetic.                                                                                                                                                                                                                    | Final financial/dashboard neighboring integration.                                                                                                                                                                                              |
| AUD-006 — report eligibility             | Eligibility is evaluated before the report output ceiling; later eligible records are not lost behind earlier ineligible candidates.                                                                                                                                                                                                                  | Complete final large-candidate JSON/CSV/PDF and authorization acceptance. Earlier export fixture/setup gaps are not declared closed.                                                                                                            |
| AUD-007 — export completeness disclosure | Completeness metadata is preserved through API/BFF/download flows; incomplete or unknown completeness produces a warning.                                                                                                                                                                                                                             | Full browser/download and final format acceptance.                                                                                                                                                                                              |
| AUD-008 — announcement audience          | Replaced5000-candidate truncation with complete distinct-user paging. Keeps atomic delivery, deduplication, cancellation, lease validation, rollback and acknowledgement. Real focused10 cases and Worker assertions passed.                                                                                                                          | Final full DB/Worker acceptance; earlier selected coverage failures were not represented as full passes.                                                                                                                                        |
| AUD-009 — dashboard actions and paging   | All five queue links work: bookings, proofs, overdue, complaints and checkouts. Added direct routes, scope enforcement and Owner paging beyond100 branches. Scoped PG5/5 and Chrome4/4 passed.                                                                                                                                                        | Final whole-system browser campaign; this is no longer a destination/paging implementation gap.                                                                                                                                                 |
| AUD-010 — report filters/hierarchy       | Building/floor/room hierarchy and required filters are implemented across report families, including authorized named choices, complete Owner scope and Web controls. Historical timing follows ADR0079.                                                                                                                                              | Final cross-format, tenant-isolation and browser campaign.                                                                                                                                                                                      |
| AUD-011 — conflicting phase docs         | Reconciled active entry points to approved audit remediation/Phase11 preparation. Preserved historical phase text, SRS decisions and unrelated user edits.                                                                                                                                                                                            | Final review/acceptance; no runtime fix remains for this finding.                                                                                                                                                                               |
| AUD-012 — performance risk               | Measured1001 invoices/1001 Stay candidates on disposable PostgreSQL. JSON/CSV/PDF each77 queries; observed4.4–5.8s. Candidate query used expected index; warmed same-actor delay464ms. Six focused cases passed.                                                                                                                                      | Larger-export and full HTTP/proxy overhead risk remains for final acceptance. The10-second proxy budget was unchanged; no speculative optimization was added.                                                                                   |
| AUD-013 — terminal Worker recovery       | Added explicit, scoped, audited billing recovery after five failures. Proves rollback, stale/invalid/foreign rejection, concurrent recovery and one invoice/execution. Also reproduced and fixed retained BullMQ job-ID collision: fresh budget dispatch includes persisted due time. Real Redis recovery passed with original failed entry retained. | Full Worker/infrastructure acceptance and operational review. No real resident recovery was executed.                                                                                                                                           |
| AUD-014 — provenance                     | Records commits, source/config hashes, commands, UTC times, exits, logs and coverage. Preserves failures and distinguishes Turbo cache replay from fresh execution.                                                                                                                                                                                   | Final complete campaign and exact-source aggregate gate. Preserved dirty user work prevents the existing clean-revision producer from certifying this checkout; guard remains intact. Hosted CI/PR access is unavailable through the connector. |
| AUD-015 — adverse coverage               | Mapped all requested scenarios. Added Root concurrency, billing/checkout, transport/billing and disposable backup/restore checks. Fixed mutual Root demotion500 by serializing before authority locks. Added approved authenticated-entry tests.                                                                                                      | Final combined real integration/browser checks, physical Android audit scenarios and full operational recovery evidence.                                                                                                                        |

## Passing application quality evidence

These are configured package gates, not a claim that whole-application aggregate
coverage or all release acceptance has passed.

| Check                                                           | Result                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| API units and configured coverage                               | 2368 tests /232 files PASS                                             |
| DB units and configured coverage                                | 839 tests /39 files PASS                                               |
| Worker units after Redis correction                             | 78 tests /8 files PASS;100% lines/statements/functions,98.93% branches |
| Web units and configured coverage                               | 1052 tests /142 files PASS — valid Turbo cache replay                  |
| Mobile units and configured coverage                            | 268 tests /23 files PASS — valid Turbo cache replay                    |
| Corrected complete Mobile components                            | 383 tests /72 files PASS, coverage PASS                                |
| Contracts                                                       | 1073 tests; lint/typecheck/build PASS                                  |
| SDK                                                             | 1011 tests; lint/typecheck/build PASS                                  |
| UI                                                              | 23 tests; lint/typecheck/build PASS                                    |
| Shared Files/Notifications/Security/Observability/Emails/Config | 23 tasks PASS;15 reused from cache                                     |
| API and Worker builds                                           | PASS                                                                   |
| Web lint/typecheck/production build                             | PASS                                                                   |
| Mobile lint/typecheck/Android JavaScript export                 | PASS outside Windows sandbox                                           |

The first Mobile component run reproduced four stale route assertions. You approved
reconciliation with `/authenticated-entry`; two expectations were updated and ten
entry cases added. Complete corrected383-case run passed. The finalized visual
Login edits were not changed. Only the approved routing dependency and tests were
committed from that work.

Mobile export initially failed in sandbox `os.userInfo` with `uv_os_get_passwd`
ENOMEM. The same call succeeded outside with about1.6GB free. The unchanged build
passed outside the sandbox; no heap, timeout, assertion or coverage relaxation.
Android export is not an installed-device acceptance result.

## Current integration campaign

The first full DB integration command is still running as of this report's check.
It has reported one30-second settlement timeout and five skipped checkout cases.
There is no terminal exit code yet and it must not be counted as passed. The cause
has not yet been conclusively diagnosed. Earlier focused passes remain historical
evidence, not a substitute for this failing/pending final checkpoint.

Queued after a successful DB gate: full Worker, API, Files/ClamAV and Notifications
integration, sequentially. The runner stops on a failed package before starting
the next package. Then run all19 browser scenarios with the closed reporter and
existing Chrome configuration. No competing heavy suite is intentionally launched.

Existing development services and data remain preserved. Disposable fixture
projects/databases are isolated; no existing local DB migration or reset was run.

## Remaining work in execution order

1. Finish/inspect the current DB run; diagnose the timeout and skipped checkout
   cases. Correct a proven defect or resource/setup cause, then verify affected
   cases with unchanged thresholds and assertions.
2. Complete DB, Worker, API, upload/scanner and notification integration gates.
3. Complete all19 browser scenarios, including reports/downloads, permissions,
   dashboard navigation and actual Worker effects.
4. Complete remaining security and exact-source aggregate/provenance checks.
   Preserve the clean-revision guard and obtain an authorized clean source state
   without silently staging unrelated user work.
5. Resolve or explicitly retain external acceptance gaps: GitHub connector404
   blocks PR/hosted-check inspection; physical Android scenarios and full offsite/
   object-storage/secret recovery are not certified by component tests or the
   bounded disposable PostgreSQL restore.
6. Produce `docs/HSM_AUD_001_015_FINAL_ACCEPTANCE.md` after campaign results, using
   truthful per-finding statuses and retaining AUD-003's accepted exception.

## Commit and preservation status

All audit/authenticated-entry changes listed here are committed and pushed. Local
HEAD and the remote-tracking branch both resolve to `7b8837a` at report inspection.

| Checkpoint | Change                                                  |
| ---------- | ------------------------------------------------------- |
| `b3584a6`  | Complete atomic announcement audiences — AUD-008        |
| `6d13ec9`  | Active phase documentation — AUD-011                    |
| `4c7487c`  | Bounded report measurements — AUD-012                   |
| `691b98d`  | Explicit audited terminal billing recovery — AUD-013    |
| `0c2cee4`  | Root concurrency correction and adverse tests — AUD-015 |
| `fb9992d`  | Controlled final acceptance/provenance preparation      |
| `9bc9fca`  | Actual Redis recovery dispatch correction               |
| `260cd2d`  | User-approved authenticated-entry routing/tests         |
| `7b8837a`  | Combined quality checkpoint                             |

Unrelated Login artwork/form/field/mode/screen edits, visual assertions, UI tokens,
design/Login documentation, generated AGENTS guidance and the local Chrome config
remain preserved. The local pnpm store is untouched. No forced reset, secret commit,
main merge or production deployment was performed.

Detailed evidence: `.tools/final-campaign/` and focused `.tools/audit-*` logs.
Live checklist: `docs/audit-remediation-20261027.md`. Live history: `docs/STATUS.md`.
