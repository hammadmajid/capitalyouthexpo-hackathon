# AUD-014 final acceptance provenance and sequence

Finish focused AUD-015 fixes before freezing source. Use the existing coverage
discovery/fingerprint/manifest code in packages/config; do not replace its clean
revision, source or report checks. Historical logs remain tied to their original
checkpoints. The final report is written only after recording campaign results.

For each checkpoint record exact commit/tree, relevant working-tree changes,
source/config hashes, command and test selection, UTC start/end, process exit,
passed/failed/skipped counts and sanitized log/report/coverage paths in.tools.
Capture source/config state before and after; changed inputs invalidate affected
evidence. Preserve failed attempts and distinguish assertion passes from coverage
gate failures. Bounded focused runs do not imply a full gate pass.

## Controlled campaign

1. Verify no competing suites and healthy Docker. Preserve existing development
   services/volumes; full-stack fixtures must pass their existing actual ClamAV
   health checks. Do not increase timeouts, disable scanning or shorten fixtures.
2. Run affected-package static/build and full unit/component coverage gates with
   Turbo caching, one heavy package at a time. Reuse unchanged historical checks
   only when the frozen source/config match. No forced dependency installation,
   clean build or OpenAPI regeneration for unchanged contracts.
3. Run real PostgreSQL financial/concurrency/authorization/report format cases and
   DB/Worker gates sequentially, then scanner/storage/notification checks. Include
   the new recovery, Root, checkout/transport races and disposable restore checks.
4. Run all19 approved browser scenarios with the closed privacy reporter and the
   existing local Chrome runner, recording its configuration hash. Never substitute
   selected journey passes for the complete campaign.
5. Use the existing exact-source aggregate producer/gate and inspect hosted CI,
   native/device and operations evidence. Classify unavailable requirements
   explicitly; local passes cannot stand in for these gates.

## Current constraints

Uncommitted user-owned Login/mobile/UI changes, AGENTS Turbo text and the local
Chrome config are intentionally preserved. The existing coverageSnapshot rejects
dirty tracked files or untracked product source; never disable this guard or
silently commit someone else's work to produce a clean-source certificate.
Normal local test evidence may describe the exact dirty-source hash, but cannot
claim the clean-revision aggregate gate passed. A clean isolated checkout must
have correctly resolved workspace dependencies before it can provide independent
evidence; symlinking dependencies back to changing product source is insufficient.

GitHub connector repository lookup still returns404 on2026-10-28 while authorized
Git pushes succeed. Hosted checks/PR evidence remain unavailable through that
connection. Physical Android audit scenario acceptance and full offsite/S3/secret
restore are separate from Login screenshots and a disposable PostgreSQL restore.
No deployment or real resident recovery is part of this campaign.
