# Migration reconciliation after laptop recovery

Date: 2026-10-23. Requirements: ACC-001/004/006, SEC-003.

## Verified local history

The development database at D:\hsm was fresh before migration replay. PostgreSQL
reproduced SQLSTATE 42601 in historical PL/pgSQL functions. The user approved
five parentheses-only corrections in 0009, 0022, 0027 and 0030. Commit d56b4b8
records the exact changes. The predecessor 75bb501 retains the pre-repair files.
No journal timestamp or ordinal was changed; no guard condition was removed.

`node infra/local-database.mjs` compares every applied SQL checksum and timestamp
against the current files and journal. It performs reads only. The new laptop
has 40 matching entries and zero pending migrations. Failed replay attempts
rolled back. This does not establish the old laptop's database state.

## Old laptop risks

Final stabilization adds generated custom migration 0040 rather than changing
0000–0039 again. It fixes BEFORE-trigger comparison of generated inventory ranges
and applies the already-required waiting-list history guards. The new migration
must follow an exactly verified prefix. Rehearse it on a scratch restore of the
old dataset after proving historical variants; never overwrite old journal hashes
to make the new verifier accept that dataset. It changes no records or base terms.
The new 0040 SQL file alone is pinned to LF in .gitattributes so Windows checkout
conversion cannot change its future applied checksum. No historical SQL file is
renormalized by this rule.

The old PostgreSQL database and private storage are not accessible in this task.
Do not assume they are empty, current or compatible. Drizzle's ordinary migrator
uses migration timestamps to choose pending work; it is not a substitute for
checking already-applied checksums. A timestamp can appear current while the
historical file, function definition or actual constraints differ.

Raw file hashes also depend on line endings. Preserve the original SQL bytes
and Git attributes. A normalized-text match may explain provenance but must
never be used to silently rewrite a recorded checksum. Encryption/HMAC and email
keys must stay with their dataset; fresh local keys cannot decrypt old records.

The current Git index and working files are CRLF for 0009/0022/0027 and mixed
for 0030 (`git ls-files --eol`). Those committed bytes are retained exactly;
do not apply a formatter or blanket line-ending conversion to migration SQL.

## Evidence-first reconciliation

1. Stop application writes on the old laptop during a consistent backup window.
   Preserve a custom-format pg_dump, schema-only dump, extension versions,
   roles/grants, migration journal rows and exact old source revision. Export
   relevant function definitions and constraints. Securely preserve private
   objects and the original encryption/envelope keys separately from Git.
2. Verify backup integrity and restore into an isolated scratch PostgreSQL 17
   instance using a new database and new volume. Never replace the original.
   Record counts and reference checks before any scratch migration.
3. Compare each old recorded hash/timestamp with the exact old SQL bytes, the
   pre-repair files from 75bb501 and current files from d56b4b8. Classify every
   mismatch as known provenance or unexplained. Inspect actual function bodies,
   not only journal rows, for the four affected migrations.
4. If the old database predates the repaired migrations, prove its recorded
   prefix against its original source. Rehearse pending migrations on the scratch
   restore and verify constraints, data counts and relevant concurrency/audit
   suites. Do not run the current startup helper against the old database until
   this plan is approved and history verification passes.
5. If any affected migration is already recorded with another checksum, keep
   its metadata unchanged. Determine the actual function semantics and propose
   an additive, Drizzle-generated repair migration when needed. Preserve the
   old SQL artifact and explicitly document the legitimate historical variant.
   A future provenance-aware verifier must require exact known source/hash
   evidence; the current verifier intentionally fails closed on a mismatch.
6. If provenance cannot be proven, stop reconciliation and recover the exact
   original artifacts. Never mark a migration applied, update its hash, skip a
   failed statement or reset the database merely to make startup green.
7. Present scratch evidence, backups, migration diff, rollback/restore procedure
   and expected data impact for approval before modifying the old database.
   Then run the approved plan in its maintenance window and retain all evidence.

## GitHub synchronization

Keep codex/recovery-20261023 as the recovery/stabilization checkpoint. Preserve
75bb501 and d56b4b8; no amend, rebase, merge or force push is needed. Local
stabilization commits remain ahead of origin until the user explicitly authorizes
a normal push. Review the complete diff and redacted secret scan first.

Before switching laptops, compare both HEADs and unique commits after a fetch.
Preserve the old checkout, uncommitted changes and a Git bundle/backup before
integrating anything. Never replace an old working tree with a new clone or pull
through local changes. If the old laptop has unique work, use a separate
review/integration branch and a normal PR after both histories are inventoried.

After revised Phase 1 dependencies and quality acceptance are satisfied, start a
separate codex/phase2-<ticket> branch from the agreed reviewed checkpoint. Use a
PR into protected main and retain SRS requirement IDs. Environment setup alone
does not authorize new Phase 2 product scope or historical Phase 3 activation.
