# Local Owner rollout gate — migrations0065–0069

## Approved execution —2026-11-02

The user explicitly approved local0065–69 application. All five were applied through
Turbo/Drizzle; the journal now contains70 migrations through0069 with zero pending.
Post-migration comparison found all109 existing tables' row counts/content fingerprints
unchanged, including account/permission/history records. New evidence tables are additive.
No reset, seed, password/session replacement or production operation occurred.

The standard local preflight now accepts exact migration hashes or deterministic
LF/CRLF variants only, retaining strict timestamp/content checks. Five focused tests
cover exact/Windows/Unix matching and rejection of actual SQL changes; the live preflight
passes without editing installed history. API/worker builds and local readiness pass.
Android is USB-connected; current UI acceptance requires the user to unlock the phone.

## Historical preparation record (superseded)

Prepared and disposable-tested; not yet applied at the original checkpoint (2026-11-02).
Scope is local development only. The user's earlier instruction permits generated
migrations/disposable tests and explicitly withholds development DB application.

| Migration                       | Additive change                                                             |
| ------------------------------- | --------------------------------------------------------------------------- |
| 0065_third_colleen_wing         | Organization-scoped amenity definitions/category and scoped name uniqueness |
| 0066_closed_black_crow          | Exact original agreement acknowledgement evidence                           |
| 0067_agreement_acceptance_guard | Existing append-only guard on acknowledgement evidence                      |
| 0068_sad_bug                    | Private agreement upload purposes and exact-stay scanned-file association   |
| 0069_agreement_file_guard       | Existing append-only guard on scanned evidence                              |

The existing development container was started, without reset/seed/schema mutation.
Read-only Drizzle inspection found65 installed migrations through0064. All timestamps
and SQL content match source;0062–64 differ only by LF/CRLF checksum normalization.
No installed migration or history row was edited. Exactly the five tags above remain.

A private custom-format backup was created at
`.tools/private-backups/owner-before-0065-1793604949485.dump` (605,938 bytes).
The database/loopback container target was checked before dumping. `pg_restore --list`
validated the archive; it is Git-ignored and contains private application data.
Existing private object storage is unaffected by these database additions.

After explicit approval: recheck the baseline and backup, run the established Turbo
`db:migrate` task against local development, verify the five new journal entries and
non-destructive invariants, build/restart the affected API/worker and run Android
acceptance with the user's device. Do not reset/seed the DB, alter Root credentials,
delete history, drop evidence tables or apply to production. If the baseline differs,
stop migration application and report the discrepancy. Prefer forward corrections
while retaining new historical evidence; never automatically restore over user changes.

Evidence: final disposable regression26 API +13 DB cases passed, plus the earlier
scoped-amenity/acknowledgement and migration-history checks. See STATUS and the Owner
implementation report. A passing disposable test is not local rollout/device acceptance.
