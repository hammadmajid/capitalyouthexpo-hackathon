# Safe local environment recovery — 2026-10-28

Refs: AUTH-C-002, ADM-002, NTF-001/002, SEC-003. Local development only.
No UI, authorization, booking, rent or other business behavior was changed.

## Root causes and corrections

| Failure                                       | Verified cause                                                                                                        | Correction                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launcher stops before applications start      | `.env` lacked JWT, CNIC HMAC and CNIC encryption keys                                                                 | After explicit user approval, generated independent development keys and derived the worker email key using the existing HKDF contract                        |
| Validator still fails after keys are restored | Startup unconditionally validated bootstrap credentials although it never seeds                                       | Bootstrap credentials are optional at runtime; supplied partial/invalid credentials still fail; `db:seed` remains strict                                      |
| API/Worker configuration disagrees            | API had `VISITS_ENABLED=false`, Worker had `true`                                                                     | Preserved API setting and synchronized Worker to `false`                                                                                                      |
| Source and local schema differ                | 40 applied migrations, 19 pending; existing hashes matched                                                            | After user approval and database backup, applied existing migrations 0040–0058; 59 applied, zero pending, matching hashes                                     |
| Mobile Home / Signup fail to connect          | API was not listening while startup was blocked; ADB forwards were intact                                             | Started API/Worker and Metro; actual API responses and Pixel flows now succeed                                                                                |
| Web supervisor fails                          | Independent Web/Mobile startup graphs concurrently invoked the shared client generator; Web failed opening its output | Launcher prepares shared dependencies in one graph, then launches supervised dev tasks with prerequisites already prepared; verified Web restart and HTTP 200 |

The worker derived key cannot recover its original encryption master. No master
keys were found in current files, both prior local environment backups, process/
Windows User/Machine variables, or checked PowerShell history. Before replacement,
the database had no protected CNIC, OTP or outbox records. The user explicitly
approved replacement knowing existing access and refresh tokens stop working.
Session rows and the Admin password hash were preserved; signing in requires the
existing password. No Root password was generated or reset and no seed was run.

## Preservation

- Byte-verified `.env` / `.env.worker` backups:
  `.tools/env-safe-recovery-2026-10-27T22-11-55-102Z/` (UTC directory timestamp).
- PostgreSQL custom archive, checked with `pg_restore --list`:
  `.tools/database-safe-recovery-20261028/hsm.dump` (416061 bytes).
- Private baseline fingerprints confirm the original user/Admin rows and both
  original session rows remain unchanged, including the password hash.
- No database reset, record deletion, volume deletion or queue clearing occurred.
  Compose recreated PostgreSQL/storage containers with their persistent volumes.
- Existing Redis `outbox-dispatch` is the source-defined one-second scheduler.
  Its delayed `dispatch` job contained only `{ type: "dispatch" }`. No job was
  manually removed or rescheduled. Normal worker startup registers its standard
  schedulers and processes jobs; existing completed history was not cleared.
- Signup checks added test identities, OTP/outbox history and continuation grants.
  They were retained. This was a shared working tree with concurrent audit work;
  unrelated edits and records were not reverted or included in the recovery commit.

## Actual readiness and signup evidence

- API `/v1/health/live`: 200; `/v1/health/ready`: 200, PostgreSQL and Redis true.
- Home `/v1/marketplace` and
  `/v1/marketplace/institutions?limit=20&radiusMeters=5000`: 200, empty data,
  null continuation. Pixel Home shows the correct empty marketplace without error.
- Worker logged `Worker ready` and delivered actual encrypted OTP outbox records
  to Mailpit, status `sent`, one attempt, no error, provider acknowledgement stored.
- HTTP registration start: 202, verification required, `Cache-Control: no-store`.
  OTP verification: 200, password continuation returned. OTP reuse: 401.
  Persisted OTP consumed and email verified. No code or setup token was printed.
- Pixel `pk.hsm.app`: submitted a test email, advanced to Verify your email,
  received its Mailpit code, verified it and advanced to Set your password.
  Password completion was intentionally left to the account holder.
- Metro `/status`: 200; Web `http://localhost:3000/`: 200; Mailpit API: 200.
  Pixel ADB forwards for 4000 and 8081 were preserved.
- Initial HTTP mail polling timed out at 45 seconds during worker restarts;
  subsequent inspection found the email sent at about 50 seconds, and resumed
  verification passed. The later device email was sent within a few seconds.
- Web initially failed shared generation and later experienced slow cold
  compilation. Successful page response was checked after the corrected restart.

## Verification and evidence

- API/Worker builds: 10/10 tasks pass (`.tools/recovery-build.log`).
- DB/Worker full units and configured coverage: 8/8 tasks pass;
  DB 780/780, Worker 61/61 (`.tools/recovery-tests.log`).
- Final DB rerun after fixture cleanup: 780/780 and configured coverage pass
  (`.tools/recovery-db-final.log`). New validator regressions: 4/4.
- Mobile units: cached pass, 268/268 with configured coverage
  (`.tools/recovery-mobile-tests.log`); this is not a new native E2E suite run.
- API/Worker/Web/Mobile lint and typecheck plus DB typecheck pass. The combined
  static command initially exits 1 on a concurrent audit test's non-null assertion
  (`.tools/recovery-static-final.log`). That audit was corrected independently;
  final DB lint recheck passes (`.tools/recovery-db-lint-final.log`, cached).
- Recovery JS/TS lint: zero errors (existing-style warnings); PowerShell parses.
- Retained RED validator regression and focused GREEN logs: focused GREEN has
  4/4 assertions but exits 1 on unchanged whole-package coverage thresholds. It is
  not counted as a full package pass. Full DB coverage passes above.
- Sanitized HTTP/SMTP evidence: `.tools/recovery-signup.log` (initial timeout),
  `.tools/recovery-signup-verified.log` (successful resumed verification).

## Changed files and manual notes

Tracked recovery files: `infra/local-env.mjs`, `infra/dev.ps1`, `infra/README.md`,
`packages/db/unit/local-environment.spec.ts`,
`packages/db/unit/local-environment.fixture.mjs`, this report and the recovery
entry in `docs/STATUS.md`. Ignored configuration changes: `.env`, `.env.worker`.
Ignored backups, private preservation metadata, diagnostic scripts and logs remain
under `.tools/`; none belong in Git.

Use the existing Admin password to sign in again after key replacement. Local
emails are available in Mailpit at `http://localhost:8025`; delivery to a personal
external mailbox is not expected in this development configuration. No dependency
upgrade, UI redesign, deployment, Admin reset or full Phase 11 acceptance occurred.
