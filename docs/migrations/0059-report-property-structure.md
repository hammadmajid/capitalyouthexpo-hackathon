# Migration 0059: Report property hierarchy prerequisite

Requirements: PROP, RPT-001/002, SEC-003; AUD-010. Generated with Drizzle Kit.
No existing database has been migrated by this remediation command.

Adds branch-scoped buildings and floors, and nullable `rooms.floor_id` with a
composite branch/floor foreign key. Existing rooms retain an unknown floor; no
building, floor, resident, payment or historical identity is invented or rewritten.
Metadata versions protect new management edits; existing room location versions
start at 1. No existing public or inventory response fields are expanded by the
schema alone. New management and report endpoints require their own validation,
authorization, SDK and Web implementation before AUD-010 can be complete.

The generated migration is additive: new tables, columns, constraints and indexes;
no DROP, DELETE or UPDATE backfill. Preserve all committed earlier migrations.
An initial uncommitted draft was verified on disposable PostgreSQL, then
regenerated before deployment to include stale-edit versions. Final migration
fresh/upgrade and regression evidence must refer to the regenerated file.

Acceptance: apply to a fresh disposable database and a database migrated only
through 0058 containing an existing room and prices. Verify unchanged old data,
null location, no fabricated parents, idempotent migrator replay, foreign-branch
parent rejection and retention under archival. Keep generated journal/snapshot
and SQL consistent. Apply to an existing environment only through its reviewed
migration workflow; do not drop columns/tables as an operational rollback.
