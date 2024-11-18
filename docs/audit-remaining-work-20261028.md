# Remaining audit execution inventory — 2026-10-28

User completion directive: implement remaining defects first with focused tests;
freeze the intended source, then run one coordinated sequential acceptance campaign.
Historical checkpoints remain evidence of their tested revisions, not new-source
certification. No Phase12 or deployment. Preserve all unrelated mobile/Login work.

| Finding         | Remaining implementation/evidence                                                                     | Dependency/order                                           |
| --------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| AUD-008         | Complete audience implemented; real focused10 and Worker23 assertions pass; full final gate pending   | Implemented at b3584a6                                     |
| AUD-011         | Active scope reconciled with preserved history/user edits                                             | Implemented at6d13ec9                                      |
| AUD-012         | Representative query/plan/heap/lock evidence6/6 PASS; larger export/HTTP risk retained                | Focused checkpoint4c7487c                                  |
| AUD-013         | Terminal recovery implemented; real8 + DB44/CLI14 assertions PASS                                     | Implemented at691b98d; final gates pending                 |
| AUD-014         | Record frozen source/config, commands and terminal results using existing provenance                  | Final campaign now; dirty aggregate guard retained         |
| AUD-015         | Inventory complete; mutual Root demotion corrected; focused races/restore PASS                        | Implemented at0c2cee4; final/device/ops acceptance pending |
| AUD-001/004/005 | Corrections implemented; refresh only evidence invalidated by final changes                           | Final financial/concurrency campaign                       |
| AUD-002/007     | Closed reporter and real download verified; full approved19 browser scenarios at final campaign       | Do not rerun browser per finding                           |
| AUD-003         | Implemented recovery; full-process restart persistence remains an explicit accepted exception         | Preserve user choice                                       |
| AUD-006         | Eligible-before-limit fixed; final real export/parity evidence remains                                | Focused gaps then final campaign                           |
| AUD-009         | Implementation and scoped database/browser + full affected regressions verified through7793dc7        | Do not reopen without new evidence                         |
| AUD-010         | Hierarchy/filters/permissions/named Web controls + real Chrome verified; top old matrix note is stale | Reconcile evidence; final cross-format acceptance          |

Final output: `docs/HSM_AUD_001_015_FINAL_ACCEPTANCE.md` after the campaign.
Classify each finding VERIFIED COMPLETE, IMPLEMENTED — ACCEPTANCE PENDING,
BLOCKED, ACCEPTED EXCEPTION, or NOT COMPLETE. Do not invent unavailable Android,
hostedCI/billing, backup/restore or external PR evidence. Existing source hashes
and checkpoint manifests in.tools should be reused, not replaced by a new framework.
