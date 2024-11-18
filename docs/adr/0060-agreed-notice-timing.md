# ADR 0060: Original agreed notice timing

- Status: source implementation; verification and complete notice/checkout workflow pending
- Date: 2026-10-20
- Refs: OUT-001/002/003/006, RENT-003, ACC-001/004; CHG-009

## Decision

Use the original persisted agreement to calculate required notice days, requested checkout date, earliest policy-compliant checkout date and exact day shortfall. Reuse the canonical calendar arithmetic; a leap day and year boundaries must not change the duration. A zero-day policy stays zero. Unsupported calendar overflow fails rather than silently clamping a policy. The server supplies the submission date in Asia/Karachi.

Emergency short notice records the actual shortfall and reason. It does not automatically waive the agreement, invent a penalty or prevent filing merely because the notice is short. Monetary consequences require the separate authorized settlement calculation under disclosed rules. A new notice cannot request a date before submission.

This calculation alone is not notice persistence, checkout acceptance, financial settlement or inventory release. The eventual command must preserve the exact agreement/policy and request in append-only history, live scope, version checks, mandatory audit and notifications in one transaction. Submission must retain actual occupancy and its canonical inventory claim. Final checkout is a different transaction with authoritative release time.

## Verification

Seventeen contract cases cover exact/short/long/zero notice, leap-year and lower supported-year arithmetic, emergency reason, strict malformed/injected input and explicit upper-calendar overflow. They pass in complete contracts757/48, all configured coverage100%. No CI or Phase3 completion claim.

## Persistence component follow-on

Internal source now requires an actual authorizer before hierarchy/Stay locks and a publisher for linked accounts, with no fallback. Exact self linkage remains checked in source; Owner/Manager live grants, sorted identity locks and authorized idempotency stay caller duties. Lock the exact active Stay, match expected version, select the latest agreement effective on server Karachi today and reject malformed producer facts. Future versions cannot replace current notice policy. Append original agreement/policy/date/shortfall/reason in history, mandatory audit, state/version and required delivery within one transaction.

No expected departure, assignment, inventory claim, billing schedule, charge, payment or fund is changed. Seven actual PostgreSQL cases cover occupancy/history, concurrent notice, required delivery and audit rollback/retry, foreign Stay, future policy isolation and emergency notice. All41 new DB cases pass within complete533/22 at100% configured coverage. Normal notice static23/23, notifications76/4 and worker39/6 pass; actual PostgreSQL cases are NOT RUN LOCALLY; no export/route/producer or full lifecycle completion is claimed. The fixed private notice event/template remains subject to the normal notification gate.
