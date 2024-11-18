# API 05: Management Setup (`/owner`, `/manage/branches/{branchId}`)

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Rules: BRN-_, ONB-_, PROP-_, ROOM-_, SEAT-_, TRUST-_, MGR-_, AUTH-M-_. All writes are audited (`hostel_audit_log`).

## Phase 3 dated pricing (SRS p.18 / BKG-004 / ACC-004/006)

Normal routes: `GET/POST /branches/{branchId}/inventory/room-types/{roomTypeId}/prices`.
GET returns private/no-store `{branchId,roomTypeId,data,nextCursor}`; bounded
`limit=20` (max100), optional exclusive effective-date cursor, descending dates.
Each version contains id, branchId, roomTypeId, effectiveFrom, createdAt,
bedMonthlyRentPaisa, roomMonthlyRentPaisa, depositPaisa and complete disclosed fees.
Creator identity is excluded. Existing branch inventory-read authority applies.

POST requires both inventory_edit/pricing_edit, current branch/type authority,
cookie CSRF and UUID Idempotency-Key. Body explicitly supplies effectiveFrom and
all money/fees. Return201/no-store is the version; replay reauthorizes. Duplicate
type/date conflicts409, invalid date/money400, missing mode price422. No undated
update or deletion route. Configuration PUT preserves money/fees and rejects a
price change422 with instructions to use dated publication. Legacy creation
retains its explicit initial prices. Current public and management prices use
the latest due Pakistan date; immutable existing financial snapshots stay intact.
ADR0069 and SRS v2.10 record migration0048/0049 and legacy fallback.

## Phase 3 room duplication (PROP-001 / ROOM-002 / ACC-004)

The normal route is `POST /branches/{branchId}/inventory/rooms/{roomId}/duplicate`,
superseding the planned `/manage` path below. It requires a current Owner or active
assigned Manager with `inventory_edit`, CSRF for cookie callers and an
`Idempotency-Key`. Strict body: `{roomNumbers: ["204", "205"]}` or ascending
`{from: 204, to: 210}`. Technical request limits are 100 rooms and 5000 new beds.
These bound one command, not branch inventory. Response201/no-store contains only
`branchId`, `sourceRoomId`, `roomIds`; replay repeats these identifiers after live
actor, branch, grant and source checks. A reused key with changed input returns409.

The transaction locks current branch hierarchy/source/type, rejects every live
label collision before insertion, creates fresh room/bed IDs and B1..Bn ordinals
up to the configured capacity, and writes one audit record. Any failure rolls back
the entire batch and its replay record. Copies reference the same room type,
retaining its capacity, integer-paisa pricing, fees and configured amenities.
They start inactive for explicit review. No occupancy, claims, reservations,
files, media publication or historical bed identities are copied. Source/type
archival returns404; wrong branch authority returns403. Existing uniqueness
constraints remain the final collision barrier; no schema migration is needed.

## Revised Phase 1 hostel setup contracts (CHG-006)

`PUT /me/owner-profile` supersedes the planned `/owner/onboarding` registration
entry below. The organization/brand/branch model remains authoritative. Shared
`hostelBasicsInputSchema` and `mainBranchDraftInputSchema` permit incomplete
private drafts without invented geography. Contacts support mobile/landline
formatting; they are not verified identity numbers. Public contact disclosure is
explicit and defaults to false on creation. Only server code chooses ownership,
main-branch status and verification state.

`hostelOnboardingSchema` describes fresh authenticated owner form reads.
`hostelOnboardingStateSchema` is the mutation replay projection: identifiers,
verification status and missing-field labels only. Arbitrary descriptions,
addresses, phone numbers and signed URLs are excluded from replay persistence.
`hostelPageSchema` bounds owner hostel lists to 100 entries. These were the contract-only checkpoint; the runtime section below supersedes its pending-route status.

## Owner onboarding & organisation (`OWNER`)

| Method     | Path                                  | Scope      | Purpose                                                                                               | SRS                         |
| ---------- | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| POST       | `/owner/onboarding`                   | AUTH       | Become an owner: `{ organizationName }` → organisation (needs a verified email + CNIC on the profile) | p.9 owner self-registration |
| GET        | `/owner/organizations`                | OWNER      | My organisations                                                                                      | BRN-001                     |
| PATCH      | `/owner/organizations/{orgId}`        | OWNER      | Rename                                                                                                |                             |
| GET / POST | `/owner/organizations/{orgId}/brands` | OWNER      | List / create brand                                                                                   | BRN-001                     |
| PATCH      | `/owner/brands/{brandId}`             | OWNER      | Edit brand (name, logo)                                                                               |                             |
| POST       | `/owner/brands/{brandId}/branches`    | OWNER      | Create a branch (starts in `draft`, private)                                                          | ONB-001                     |
| GET        | `/owner/branches`                     | OWNER      | All owned branches with verification status (branch switcher)                                         | BRN-002, PROP-003           |
| POST       | `/manage/branches/{branchId}/archive` | OWNER-ONLY | Archive the branch (history kept)                                                                     | p.11 branch archival        |

## Branch profile & settings (`BRANCH`)

| Method                      | Path                                                 | Purpose                                                                                                                                                                                                                                                                    | SRS                                 |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| GET                         | `/manage/branches/{branchId}`                        | Profile + verification status + internal completeness                                                                                                                                                                                                                      | TRUST-004                           |
| PATCH                       | `/manage/branches/{branchId}`                        | Name, description, category, address, location, contacts, `showPublicContact`, mess. **ETag.** If a major field changes on an approved listing (address, location, category, ownership) the response returns `reverificationRequired: true` and a new submission is needed | TRUST-006                           |
| GET / PUT                   | `/manage/branches/{branchId}/settings`               | Reservation expiry, upfront requirement, partial payments, due day, grace, late fee, notice period. Server-validated ranges                                                                                                                                                | BKG-006, RENT-005, FIN-002, OUT-001 |
| GET / PUT                   | `/manage/branches/{branchId}/amenities`              | Branch amenities (codes)                                                                                                                                                                                                                                                   | p.13, ROOM-005                      |
| GET / POST / PATCH / DELETE | `/manage/branches/{branchId}/rules[/{ruleId}]`       | House rules (DELETE = archive)                                                                                                                                                                                                                                             | p.14                                |
| GET / PUT                   | `/manage/branches/{branchId}/visiting-hours`         | Weekly visiting windows                                                                                                                                                                                                                                                    | p.23                                |
| GET / POST                  | `/manage/branches/{branchId}/cancellation-policies`  | List versions / publish a new version (immutable)                                                                                                                                                                                                                          | p.21–22                             |
| GET / POST                  | `/manage/branches/{branchId}/agreement-versions`     | Resident agreement versions                                                                                                                                                                                                                                                | p.25                                |
| GET / POST / PATCH          | `/manage/branches/{branchId}/payment-methods[/{id}]` | Bank / JazzCash / Easypaisa / Raast / card / cash accounts; `isActive` toggle                                                                                                                                                                                              | PAY-003, BKG-007                    |

## Property structure (`BRANCH`)

| Method                 | Path                                                          | Purpose                                                                                                                                                                                                                  | SRS                     |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| GET / POST             | `/manage/branches/{branchId}/buildings`                       |                                                                                                                                                                                                                          | PROP-001                |
| PATCH                  | `/manage/branches/{branchId}/buildings/{buildingId}`          |                                                                                                                                                                                                                          |                         |
| POST                   | `/manage/branches/{branchId}/buildings/{buildingId}/archive`  | Blocked if active rooms/seats depend on it                                                                                                                                                                               | p.17 archive dependency |
| GET / POST             | `/manage/branches/{branchId}/floors`                          | `{ buildingId, label, levelNumber }`                                                                                                                                                                                     |                         |
| PATCH / POST …/archive | `/manage/branches/{branchId}/floors/{floorId}`                |                                                                                                                                                                                                                          |                         |
| GET / POST / PATCH     | `/manage/branches/{branchId}/room-types[/{id}]`               | Configurable names                                                                                                                                                                                                       | p.18                    |
| GET                    | `/manage/branches/{branchId}/rooms?floorId=&roomTypeId=`      | Rooms with current price + seat counts                                                                                                                                                                                   | ROOM-001                |
| POST                   | `/manage/branches/{branchId}/rooms`                           | `{ floorId, roomNumber, roomTypeId, capacity, description, amenities, price: {pricingModel, monthlyRentPaisa, securityDepositPaisa, effectiveFrom}, seatLabels? }`. Seats are auto-created B1..Bn if no labels are given | ROOM-001/002            |
| PATCH                  | `/manage/branches/{branchId}/rooms/{roomId}`                  | Edit. Capacity below occupied seats → `422 CAPACITY_BELOW_OCCUPANCY`. ETag                                                                                                                                               | PROP-002                |
| POST                   | `/manage/branches/{branchId}/rooms/{roomId}/duplicate`        | `{ roomNumbers: ["204","205"] }` or `{ from: 204, to: 210 }`; collisions → `409` before anything is created                                                                                                              | p.17 duplication        |
| POST                   | `/manage/branches/{branchId}/rooms/{roomId}/archive`          | Blocked while seats are occupied/reserved                                                                                                                                                                                | PROP-001                |
| PATCH                  | `/manage/branches/{branchId}/rooms/{roomId}/expected-vacancy` | `{ date \| null }` for full room types                                                                                                                                                                                   | WAIT-001                |
| GET / POST             | `/manage/branches/{branchId}/rooms/{roomId}/prices`           | Price history / add an effective-dated price (never rewrites bookings or issued invoices)                                                                                                                                | p.18, RENT-003          |
| POST                   | `/manage/branches/{branchId}/rooms/{roomId}/seats`            | Add a seat `{ label }` (≤ capacity)                                                                                                                                                                                      | ROOM-002                |
| PATCH                  | `/manage/branches/{branchId}/seats/{seatId}`                  | `{ label?, listedPublicly? }`. Publishing without the required photos → `422 PHOTOS_REQUIRED`                                                                                                                            | ROOM-003, SEAT-002      |
| POST                   | `/manage/branches/{branchId}/seats/{seatId}/maintenance`      | `{ on: true\|false, note }`. Only from `available` (or back to it)                                                                                                                                                       | BED-001, p.19           |
| POST                   | `/manage/branches/{branchId}/seats/{seatId}/archive`          | Only if not occupied/reserved                                                                                                                                                                                            | PROP-001                |

## Photos (`BRANCH`)

| Method | Path                                                        | Purpose                                                                                          | SRS                 |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| GET    | `/manage/branches/{branchId}/photos?scope=&roomId=&seatId=` | Incl. moderation status                                                                          |                     |
| POST   | `/manage/branches/{branchId}/photos`                        | `{ scope: hostel\|room\|seat\|menu, roomId?, seatId?, fileId, caption? }` → `pending` moderation | ROOM-003, TRUST-003 |
| PATCH  | `/manage/branches/{branchId}/photos/order`                  | `{ ids: [...] }`                                                                                 |                     |
| POST   | `/manage/branches/{branchId}/photos/{photoId}/archive`      | Replace/remove (history kept for moderation)                                                     | p.19 photo history  |

## Bulk import (`BRANCH`)

Phase3 supersedes the planned `/manage` paths below with normal
`/branches/{branchId}/inventory/imports`. Current `inventory_edit` is required for
templates, preview and writes. GET `/templates/{kind}` returns `{branchId,kind,
fileName,csv}`; optional `roomTypeId` fills a rooms template after exact source
validation. POST `/` accepts `{kind: rooms|seats,fileId}` plus Idempotency-Key and
cookie CSRF. The file must be the caller's private, clean `import` text/csv,
≤5MB; storage bytes must match recorded size/SHA256. UTF-8 RFC4180 headers are
`room_type_id,room_number` or `room_number,bed_label`. Quoted delimiters/newlines
are parsed as text, never evaluated. Limits are500 CSV records/5000 new beds per
command. Blank lines are ignored; preview record numbers start2 after the header.

POST validates without creating inventory and returns201 `{id,branchId}`.
GET `/{runId}?offset=0&limit=50` returns bounded rows/errors/current status with
nextOffset (limit1..100). Failed rows block the entire import. POST `/{runId}/commit`
with `{}` and a fresh command key revalidates current branch, capacity, labels,
types and clean source, then commits all records and audit in one transaction.
New rooms receive configured capacity-sized B1..Bn beds; all imported rooms/beds
start inactive, without copied occupancy, reservations or media publication.
Bed imports retain permanent ordinal history. Same-key replays recheck authority;
same committed run/content with a new command returns409 IMPORT_ALREADY_COMMITTED.
Concurrent collisions or audit failure cannot partially commit. The private
history/source is immutable. Residents/opening balances and XLSX execution remain
outside this Phase3 CSV workflow. Templates/preview responses are no-store.

| Method | Path                                                    | Purpose                                                                            | SRS                |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| GET    | `/manage/branches/{branchId}/imports/templates/{kind}`  | CSV/XLSX template (`rooms`, `seats`, `residents`, `opening_balances`)              | p.16               |
| POST   | `/manage/branches/{branchId}/imports`                   | `{ kind, fileId }` → validation run with per-row errors (nothing written)          | p.17 import review |
| GET    | `/manage/branches/{branchId}/imports/{importId}`        | Preview + errors                                                                   |                    |
| POST   | `/manage/branches/{branchId}/imports/{importId}/commit` | All-or-nothing commit. The same file re-committed → `409 IMPORT_ALREADY_COMMITTED` | p.17 idempotency   |

## Verification submission (`BRANCH`, submit = `OWNER-ONLY`)

| Method | Path                                                 | Purpose                                                                                                             | SRS                |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| GET    | `/manage/branches/{branchId}/verification`           | Status, latest decision reason, **readiness checklist** (identity, location, pricing, deposit, rooms/seats, photos) | p.16 required data |
| POST   | `/manage/branches/{branchId}/verification/documents` | `{ fileId, docType }` (ownership/lease evidence, owner CNIC)                                                        | TRUST-002          |
| POST   | `/manage/branches/{branchId}/verification/submit`    | Snapshot the listing + submit. Incomplete → `422 LISTING_INCOMPLETE` with the missing items                         | ONB-001/002        |
| GET    | `/manage/branches/{branchId}/verification/history`   | Submissions + decisions                                                                                             | p.15               |

## Staff: manager appointment (`OWNER-ONLY`)

| Method | Path                                                                      | Purpose                                                                                                                                                                    | SRS                     |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| GET    | `/manage/branches/{branchId}/managers`                                    | Managers of this branch + status                                                                                                                                           | MGR-001                 |
| POST   | `/manage/branches/{branchId}/managers`                                    | `{ fullName, phone, temporaryCredential: { mode: "auto" } \| { mode: "manual", password } }`. **Idempotency-Key**. Returns a generated temp password **once**, never again | AUTH-M-001..003         |
| POST   | `/manage/branches/{branchId}/managers/{assignmentId}/reset-temp-password` | Only while `pending_activation` or locked                                                                                                                                  | AUTH-M-003              |
| POST   | `/manage/branches/{branchId}/managers/{assignmentId}/suspend`             | `{ reason }`. Sessions revoked immediately                                                                                                                                 | MGR-004, p.10           |
| POST   | `/manage/branches/{branchId}/managers/{assignmentId}/reinstate`           | Undo a suspension                                                                                                                                                          | p.10                    |
| POST   | `/manage/branches/{branchId}/managers/{assignmentId}/deactivate`          | `{ currentPassword }` (Owner's own, CHG-030). Fire or cancel invite. Assignment ends, sessions revoked, history kept. Wrong password → `400 VALIDATION_FAILED`             | AUTH-M-006, MGR-004/005 |

Managers calling any of these → `403`. A manager can never change their own branch (MGR-002/003).

## Previous Task 10 minimal implementation checkpoint

Task 10 implements only paginated GET /owner/organizations, GET /owner/branches,
GET /manage/branches, GET /manage/branches/{branchId}, owner-only GET
/manage/branches/{branchId}/managers and the existing suspend, reinstate and
deactivate actions. Lists use cursor/limit (20 default, 100 maximum). Branch
lookup is a foundation DTO: id, organizationId, brandId, name and
verificationStatus; internal completeness and full profile fields remain later work.
Assignment lists expose id, userId, branchId, fullName and status, never credentials.

Suspension requires a bounded reason; deactivate requires the Owner's `currentPassword`
(CHG-030); reinstate accepts an empty strict
body. Repeating a reached status is a no-op. Every actual transition atomically writes hostel audit evidence and enqueues a transactional
notice. Suspension and deactivation revoke target sessions. Reinstatement does not restore revoked credentials. Direct foreign branch
access returns 403; a mismatched assignment inside an owned branch returns 404.
See ADR 0013 for lock ordering. Onboarding, appointment, temporary-password reset,
property and settings endpoints above remain planning, outside this checkpoint.

The implemented setup policy permits saving incomplete drafts and explicit null
corrections. Submitted/review/approved/suspended branches cannot be edited via the
onboarding policy. Submission requires complete category/city/area/address/map
fields and does not require a manager. Active geography must match the selected
city and sub-area parent; existing zone/sector/area levels remain supported.
Transactional saving and submission routes remain pending at this policy checkpoint.

## Revised Phase 1 private hostel setup runtime (CHG-006)

| Method | Path                                  | Request / purpose                                                                     |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/owner/organizations/{orgId}/brands` | Owned live organization list; cursor/limit, max 100                                   |
| POST   | `/owner/organizations/{orgId}/brands` | Strict hostel basics; create brand and incomplete private main branch together        |
| GET    | `/owner/brands/{brandId}/onboarding`  | Fresh private hostel/main-branch form details and missing setup fields                |
| PUT    | `/owner/brands/{brandId}/basics`      | Save name, optional clean private logo, category, description and contact preferences |
| PUT    | `/owner/brands/{brandId}/main-branch` | Save partial branch name/category/city/area/address/map/landmark/contact progress     |
| POST   | `/owner/brands/{brandId}/submit`      | Strict empty body; submit complete foundation for Admin verification                  |

All six routes require live Owner capability. The repository additionally resolves
exact organization/brand ownership and live parents under identity-first locks;
foreign or archived resources return opaque 404. No body may set owner IDs,
approval, primary status or capabilities. Fresh reads are no-store. Legacy brands
without a primary are readable; saving basics/main setup creates their private
primary without changing secondary or archived branch history.

CHG-041 re-verification routes (Owner; approved hostel only; Idempotency-Key on writes):
`GET /owner/brands/{brandId}/revision` (live hostel + latest revision),
`PUT .../revision` `{expectedVersion, basics?, main?}`, `POST .../revision/submit` and
`POST .../revision/withdraw` `{expectedVersion}`. Verification Admin:
`GET /admin/hostel-revisions`, `GET /admin/hostel-revisions/{revisionId}` (changes beside
live values) and `POST /admin/hostel-revisions/{revisionId}/decision`
`{expectedVersion, action: approve|reject, reason?}` (reason required to reject).

All four mutations require UUID Idempotency-Key, current completed Owner identity,
verified email/permanent password and own clean private CNIC evidence. Replays
recheck the requested organization/brand scope and current evidence before cache
access. Resource writes, fixed audit evidence and safe replay response use the
same existing idempotency transaction. Replay returns IDs, lifecycle and missing
field labels, with Idempotency-Replayed; arbitrary form text, contacts and signed
URLs are not cached. Changed key/body/resource combinations conflict. Cookie
transport retains refresh-bound CSRF; bearer transport shares the same service.

Omitted fields preserve draft progress; explicit null clears optional progress.
City-only drafts are allowed. Active city and area membership must match; a
sub-area must belong to the selected primary area. Seeded sector and existing
zone/area levels are supported. PostGIS coordinates are validated and bound as
geography data. Hostel contacts support mobile/landline formatting without phone
ownership claims and are stored as E.164 (`0315…` → `+92315…`, `051-…` → `+9251…`), the
same form the listing requires; older local-format values are read as E.164 (TRUST-006). Personal identity contact is never copied into public contact.
Disclosure defaults false unless explicitly selected.

Submission requires category/city/area/nonblank address/map and current valid
geography/evidence. Incomplete setup returns 409. Owners can self-manage; Manager
appointment is optional. Submission changes only verificationStatus to submitted,
never approved or firstApprovedAt. Onboarding edits are limited to draft,
changes_requested and rejected states; submitted/review/approved/suspended edits
return 409. Unapproved drafts remain ineligible for public listing. Full later
listing snapshots, inventory/pricing readiness and Admin decisions in the planned
verification endpoints above remain outside this minimum onboarding foundation.

Runtime LOCAL PASS: API lint/typecheck/build, 691 full API unit/HTTP cases and
unchanged coverage gates; generated client checks also pass. Eleven new real
Testcontainers cases are NOT RUN LOCALLY and await CI. No integration CI PASS
is claimed at this checkpoint.

Hostel/main-branch contact input retains mobile or landline formatting but must
contain seven to fifteen digits. Formatting characters do not count as digits;
this validation does not verify ownership of the contact number (OWN-001).

## Additional branches under an existing hostel (BRN-001; 2026-10-29, focused tests only)

| Method | Path                                                     | Request / purpose                                                    |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| POST   | `/owner/brands/{brandId}/branches`                       | Strict branch draft input; create a private non-primary draft branch |
| GET    | `/owner/brands/{brandId}/branches/{branchId}/onboarding` | Fresh setup read; `mainBranch` carries the selected branch           |
| PUT    | `/owner/brands/{brandId}/branches/{branchId}`            | Save partial branch progress (same body as `main-branch`)            |
| POST   | `/owner/brands/{brandId}/branches/{branchId}/submit`     | Strict empty body; submit that branch for Admin verification         |

One main branch per hostel. Another branch can be added only after the main branch
was submitted at least once (`409` otherwise). A new branch copies the main branch's
type, tier, year, description and contact, never its address, pin or approval; it
is verified separately. Same Owner-only scope, idempotency and audit
(`hostel.setup.branch.*`) as the main-branch routes. Mobile: hostel card → Add branch
runs the same six steps with the hostel name fixed.

## Revised Phase 1 Manager invitation runtime (CHG-006, ADR 0022)

Owner-only POST managers and POST reset-temp-password now use UUID Idempotency-Key.
The existing strict temporaryCredential union selects auto or manual mode; legacy
tempPassword/generateTempPassword bodies are not a second accepted contract.
Pakistani mobile formatting is normalized without ownership verification.

New identities remain passwordless until existing one-use activation sets their
permanent password. Pending invitations expire in 24 hours and lock after five
failed attempts. Existing permanent identities keep passwords, names, capabilities
and devices; acceptance is authenticated_account through their own existing
acceptance route, with no Owner-issued hash or generated secret. Reset applies
only to pending passwordless invitations, including locked/expired ones.

Responses contain id, branchId, pending_activation status, expiresAt and acceptance
(temporary_password or authenticated_account). generatedTempPassword is present
only on the first successful auto issuance to a passwordless identity. It is never
persisted or replayed; manual credentials are not echoed. If delivery is lost, the
Owner creates a new reset request. All responses are no-store; cookie mutations
retain refresh-bound CSRF protection. Audit, mutation and safe replay commit
atomically under globally ordered participant locks and exact live branch scope.
Manual-password request fingerprints use a purpose-separated server-keyed HMAC.
Assignment history and the existing one-live-branch constraint are preserved.

## Revised Phase 1 Owner geography reads (ONB-001, SEC-001)

| Method | Path                                     | Purpose                                                            |
| ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/owner/geography/cities`                | Active city IDs and display names                                  |
| GET    | `/owner/geography/cities/{cityId}/areas` | Active same-city area choices, or direct sub-areas with `parentId` |

Both routes require live Owner capability, recheck account/session and ownership
capability inside a transaction, and return `Cache-Control: no-store`. Queries
are strict: UUID `cursor`, integer `limit` (default 20, maximum 100), plus optional
UUID `parentId` for areas. Responses contain bounded `data` and nullable
`nextCursor`; cities expose only `id`/`name`, areas additionally expose `cityId`,
`parentId` and `level`. They contain no account or occupant data.

Inactive/missing cities and inactive, foreign-city or sub-area parents return
opaque 404. Without a parent the choices include zone/area/sector levels; with a
parent only its direct active `sub_area` children are returned. This reads the
existing seeded geography tables and introduces no migration or master-data
mutation. Unit/HTTP checks and a real Testcontainers scenario are retained;
container execution awaits a compatible runtime/CI, never a mock substitute.

Owner invitation recovery (AUTH-M-003, CHG-006): named paginated pending Manager
choices use the existing private branch-scoped listing and temporary-credential
reset API. Automatic/manual replacement preserves backend passwordless-only
eligibility; permanent account passwords cannot be reset. Issuance and reset have
separate in-memory retry intents. Close/mode/selection changes and unmount discard
secrets and late responses. Generated replacement credentials are shown only for
the fresh response and can be hidden; idempotent replay cannot recover them.

## Phase 2 booking policy reads (BKG-006, CHG-007, ACC-004)

GET mirrors each existing booking-policy PUT path: `/admin/booking-policy`
(Root only), `/owner/brands/{brandId}/booking-policy` (own hostel),
`/branches/{branchId}/booking-policy` and
`/branches/{branchId}/inventory/room-types/{roomTypeId}/booking-policy`
(live assigned branch; active room type in that exact branch).

Responses are private/no-store. `configured: false` reports missing platform
configuration without guessed defaults. Configured responses expose `target`,
`canEdit`, nullable `localVersion`/`overrides`, nullable Root `inherited`,
`effective`, explicit platform `limits` and ordered immutable `lineage` references.
Managers can read their assigned scope; only an actual policy_edit grant permits
editing. A read starts no idempotent mutation and changes no policy or audit row.
The existing versioned PUT, safety validation and write authorization remain the
only configuration mutation path. New route/unit/HTTP checks are authored;
real-container verification remains pending.

### Revised Phase 2 private minor listing settings (TRUST-006, ACC-004)

Authored continuation, not acceptance evidence:

| Method | Path                              | Behavior                                                                                                                                                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/branches/{branchId}/listing` | Assigned branch/Owner scope; actual description, landmark, configured public contacts/visibility, selected active or retired amenities, edit permission and resource version; no-store and quoted ETag. |
| PUT    | `/v1/branches/{branchId}/listing` | Requires listing_edit, Idempotency-Key, cookie CSRF where applicable and quoted If-Match. Full explicit minor-field/amenity input; same-transaction audit and persisted settings response.              |

Input requires nullable description (1–4000 trimmed characters), nullable landmark
(1–1000), nullable E.164 public phone (including landlines), nullable public email,
explicit showPublicContact and at most 100 unique approved amenity codes. Blank
optional text must be explicitly represented as null. No private identity contact
is copied. Missing/malformed If-Match is a validation failure; a changed revision
returns typed 412 PRECONDITION_FAILED. Version is part of the idempotency
fingerprint; identical replay still rechecks live scope and listing_edit.

These are minor listing edits. Unknown ownership/name/category/address/location
fields fail validation and cannot bypass major-change re-verification. Retired
selected codes are retained unless explicitly removed; newly selecting inactive
or unknown codes fails. Public discovery must not match retained inactive codes.
No catalog record, branch or historical audit is hard-deleted. See ADR 0032.
Gallery publication and Manager grant editing remain separate work.

### Phase 2 controlled listing gallery (ROOM-003, SEC-003, AUD-001)

Authored continuation; verification pending. All routes are private/no-store and
branch-scoped. GET `/v1/branches/{branchId}/gallery` accepts strict UUID cursor,
limit 1–100 (default 20) and state active/archived/all (default active). It returns
bounded metadata, nextCursor and actual canEdit. No bucket, key, digest, uploader
identity or signed credentials are returned.

POST the collection with fileId, altText (trimmed 1–240) and non-negative database
integer sortOrder to attach a clean actor-owned private listing_photo as a draft.
PUT `/{mediaId}` requires full altText, sortOrder and explicit published boolean.
POST `/{mediaId}/cover` with an empty body promotes its order without publishing.
POST `/{mediaId}/archive` requires a trimmed reason (1–500); records are retained.
All writes require listing_edit, Idempotency-Key and cookie CSRF where applicable.
Existing-image commands require quoted If-Match; a changed revision returns typed
412 PRECONDITION_FAILED. Replays reauthorize live scope/permission and bind to the
original version, branch, image and body. Mutation, audit and replay persist together.

Publication enabled is not proof of current public visibility: the existing public
image stream also checks approved/visible active branch, active city, current clean
scan and exact immutable bytes before and after storage I/O. Scan revocation blocks
publication/cover but still permits unpublication or archival. See ADR 0033.

### Phase 2 Owner Manager-grants read and editor (ACC-004, CHG-008)

GET `/v1/branches/{branchId}/managers/{assignmentId}/inventory-permissions`
returns strict `{branchId, assignmentId, permissions}` with no-store. Reads require
live Owner scope and an exact assignment in that branch. Empty permissions means
no additional grants; unknown, duplicate or oversized stored permissions fail
closed. Unsupported query parameters are rejected. Read locking follows the
existing assignment-before-branch order of the audited idempotent PUT.

The Owner editor selects actual paginated named assignments from the existing
management roster. It loads current grants before editing, retains drafts on
outage, blocks writes during refresh failure, discards selection on account/branch
changes and hides stale forms after denial. Identical failed retries preserve the
same command key. Detected changed saved values require explicit reload. Existing
PUT transaction/idempotency behavior is retained; the read does not introduce a
new conditional-write guarantee. Clearing every checkbox explicitly revokes all
additional grants. Assignment status and branch authorization remain authoritative.
No inventory flag overrides Owner-only pre-confirmation booking-document access.

Contract, repository/service, SDK wire, HTTP and UI cases are authored. Real
PostgreSQL read/replace/replay/revoke/branch-denial acceptance cases are retained
under Testcontainers and NOT RUN LOCALLY. Current-source verification is pending.

Gallery capabilities: strict private pages require both canEdit and canPublish.
The latter requires listing_edit plus media_publish (implicit Owner authority).
Publication, changes/archive of published assets and any cover selection enforce
both grants before execution and stored replay. Private draft edits/archive and
attachment require listing_edit. CHG-008 remains unchanged; see ADR 0034.

### Per-room amenities (CHG-019 / SRS v2.15; focused tests only)

GET/PUT `/v1/branches/{branchId}/rooms/{roomId}/amenities` operate on one live room in an
authorized branch. GET returns strict branchId, roomId, roomTypeId, customized, version,
canEdit, effective `amenities` and the room type's `typeAmenities` (no-store, quoted ETag).
PUT body is `{ "mode": "inherit" }` or `{ "mode": "custom", "amenityCodes": [...] }`
(unique, max 100, approved codes); requires listing_edit, If-Match and Idempotency-Key.
Stale versions return 412. Replacement, the `rooms.amenities_customized` flag and the
`room.amenities.changed` audit share one transaction. Public room pages add `amenities`.

### Room-type amenities (ROOM-002 / ACC-004 / AUD-001; verification pending)

GET/PUT `/v1/branches/{branchId}/room-types/{roomTypeId}/amenities` operate on
an exact active room type in a live authorized branch. GET returns strict
branchId, roomTypeId, version, canEdit and selected amenities [{code,name,isActive}],
with no-store and quoted ETag. Assigned readers do not gain edit authority.
PUT requires listing_edit (implicit Owner), explicit unique amenityCodes (max 100),
If-Match and Idempotency-Key; cookie requests require CSRF proof. Unknown/newly
retired codes fail; already selected retired choices remain visible/removable.
Changed versions return 412. Canonical selections bind replay to actor/branch/room,
and live authority/active-child checks run before replay. Association replacement
and audit share one transaction. Pricing/fee commands do not change selections.
No schema migration is required. See ADR 0036. Current HTTP/package/container
verification and UI/public projection remain pending; no feature PASS is claimed.

### Informational hostel rules (TRUST-006 / ACC-004 / AUD-001)

The implemented Phase 2 route prefix is `/v1/branches/{branchId}/rules`:

| Method | Suffix              | Purpose                                                            |
| ------ | ------------------- | ------------------------------------------------------------------ |
| GET    | none                | Bounded private rules page; `state=active` (default) or `archived` |
| GET    | `/{ruleId}`         | Exact current scoped rule, `canEdit` and ETag                      |
| POST   | none                | Create `{body, sortOrder}`; Idempotency-Key; 201                   |
| PUT    | `/{ruleId}`         | Replace text/order; exact If-Match and Idempotency-Key             |
| POST   | `/{ruleId}/archive` | Retain history; `{reason}` plus If-Match and Idempotency-Key       |

Reads permit current branch management scope; writes require existing `listing_edit`
authority. The server rechecks current actor, branch and exact child before replay.
Private pages contain `branchId`, `state`, `canEdit`, `data`, `nextCursor`; each row
has id/branchId/body/order/version/timestamps/archive timestamp. A current single
row or mutation response additionally carries `canEdit`. All responses are no-store;
row commands emit a quoted SHA-256 ETag and Idempotency-Replayed header. Conflicting
versions return 412 before writes. Archived rules cannot be edited. Mutations and
privileged audit share a transaction; no row is hard-deleted. A revision at the
integer limit may still be archived; further edits require a replacement rule.

Rules are informational text, not executable policy or an override of booking,
pricing, CNIC, document-access or financial invariants. Web management loads rules
lazily for the selected account/branch, reads a current row before editing, retains
drafts and command keys across network retry, and requires explicit conflict reload.
No cross-scope response may restore a preceding branch editor. See ADR 0039;
current complete checks and container acceptance remain pending.

## Bounded physical inventory reads (ROOM-002 / ACC-004)

Additive authenticated GET resources beneath
`/v1/branches/:branchId/inventory/pages`:

| Suffix                           | Collection                                                   | Exact parent                         |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `/room-types`                    | Current unarchived type rows, prices and disclosed fees      | Branch                               |
| `/room-types/{roomTypeId}/rooms` | Current unarchived room rows without nested beds             | Same-branch unarchived type          |
| `/rooms/{roomId}/seats`          | Current unarchived physical beds, labels and stable ordinals | Same-branch unarchived room and type |

Strict query: optional canonical UUID `cursor`; `limit` defaults20, range1..100.
UUID ascending keysets; response contains `branchId`, current `permissions`,
`canConfigureManagers`, `data` and nullable `nextCursor`; child pages additionally
identify `roomTypeId` or `roomId`. A continuation is the last returned ID only when
an additional row exists. Empty collections are real empty pages; missing,
foreign or archived child parents return404 after current branch authorization.
Guessed branches return403. No occupant, claim, booking or document data is read.
All responses are no-store; the current actor and branch scope are revalidated in
the transaction. Read-only assigned Managers may browse without mutation grants.

Technical limits bound each transport page, not hostel inventory. Inactive and
maintenance rows remain visible to management. Bed page order is UUID; returned
ordinals remain unchanged. The SDK binds response branch/parent, request limit,
ordering and exact continuation. See ADR0041. Existing inventory endpoint and its
web/native consumers still require migration; public option paging is separate.
No acceptance of those unfinished callers is claimed.

`GET .../inventory/pages/access` accepts an empty query only and returns
`branchId`, current unique `permissions` and `canConfigureManagers`. The web and
native branch booking queues use this lightweight route with an account/branch
`inventory-access` cache; they no longer fetch all physical inventory for grants.
The physical browsers and blocking option selectors still require page migration.

Web physical-page browser wiring is authored (not yet verified): type cards page
independently; only one selected type's rooms and one selected room's beds load.
Each collection has explicit next/first controls, and active edits/pending work
block navigation. Current page authorities intersect conservatively. Missing-parent
failures hide cached physical metadata. Native browsers, block selectors and public
options still require migration; do not infer their acceptance from this wiring.

### Room and bed photo targets (ROOM-002/003, ADR 0070)

`POST /branches/{branchId}/gallery` accepts optional
`target: { kind: 'room', roomId } | { kind: 'bed', roomId, bedId }` for current
inventory of the same branch (otherwise 404). `GET /branches/{branchId}/gallery`
accepts `roomId` and `bedId` (bed requires room); without them the page is the
hostel gallery. Media responses include `roomId`/`bedId`. Targets are immutable.
Existing listing_edit/media_publish grants, scanning, idempotency and audit apply.

### Optional Owner setup metadata (CHG-018, 2026-10-29)

Hostel basics and main-branch draft inputs optionally accept propertyTier (standard,
premium, luxury or null) and establishmentYear (integer1800..current Karachi year,
or null). Omission preserves saved metadata; explicit null clears it. Owner onboarding
reads return these nullable fields on mainBranch. This is owner-declared metadata,
not certification/pricing or additional authority. Existing live Owner scope,
idempotency, audit, draft-only writes and review gates apply. Additive0060 is required;
no backfill. Native wizard uses the same APIs, not a separate setup model.
