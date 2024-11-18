# 07: API Contract (overview & conventions)

## Combined transport invoice details (2026-11-22 / CHG-061)

Private invoice balances add optional `lineItems` (kind, description, amountPaisa),
`securityDuePaisa` and `securityPendingPaisa`. Live branch/Stay finance authorization
still precedes every read. Staff default invoice selection includes transport;
`category=transport` includes a mixed invoice containing transport. Security remains
a separate refundable component; the ledger invoice face value is rent/services.

CHG-054 (2026-11-18): new-resident `profile.cnic` on `POST /v1/branches/{branchId}/stays/manual`
and optional `cnic` on booking check-in; the terms preview returns `cnicOnFile`. Resident profile
reads return `cnicLast4` only. The mobile app requires a CNIC for new residents.

CHG-053 / RENT-003 (2026-11-18): Owner-only `POST /v1/branches/{branchId}/stays/{stayId}/invoices/{invoiceId}/reissue`
(`{ dueDate, reason }`, Idempotency-Key) voids a wholly unpaid bill and reissues its charges with the new
due date; returns `{ voidedInvoiceId, invoiceId }`.

CHG-051 / RES-001 (2026-11-18): `PUT /v1/me/customer-profile` matches one active
offline manual resident. Verified email links directly; phone alone creates a
hostel confirmation request without granting private access. New private endpoints:

- `GET /v1/me/resident-link-status` → `{ pending: boolean }`, own account only.
- `GET /v1/branches/{branchId}/residents/account-link-requests?cursor=` → up to 50
  pending current-active requests (`id`, `residentId`, `residentName`, `customerName`,
  `phone`, `createdAt`) and `nextCursor`; live `stay_manage` required.
- `PUT /v1/branches/{branchId}/residents/account-link-requests/{requestId}` with
  `{ action: 'approve' | 'reject' }` → `{ success: true }`. Live branch authorization,
  CSRF for cookies, global rate limit and strict validation apply. A stale/closed
  request returns 409; a foreign request in an authorized branch returns 404.

See [SRS v2.35](srs/SRS-v2.35-resident-account-linking.md). Repeat decisions are
idempotent for the same final outcome, and every new outcome is audited atomically.

- **Status:** Draft v1 baseline. Foundation/auth are implemented; later module tables remain planning. See STATUS.md for verified scope.
- **Last updated:** 2026-10-19
- **Inputs:** SRS v2.0, `docs/srs/CHANGES.md`, `docs/01-roles-and-permissions.md`, `docs/06-database-schema.md`

This file holds the **rules every endpoint follows**. The endpoints themselves are listed per module in `docs/api/`:

| File                                                                               | Surface                                 | Covers                                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`api/00-foundation.md`](api/00-foundation.md)                                     | `/health`, `/docs`                      | Implemented runtime health, security and documentation                                                              |
| [`api/01-auth-identity.md`](api/01-auth-identity.md)                               | `/auth`, `/me`                          | Register, email OTP, login, sessions, manager activation, walk-in claim, profile, files                             |
| [`api/02-public-marketplace.md`](api/02-public-marketplace.md)                     | `/public`                               | Geography, search, hostel detail, rooms/seats, reviews, compare, parent share                                       |
| [`api/03-customer.md`](api/03-customer.md)                                         | `/me`                                   | Favourites, bookings, visits, waiting list, chat, stays list, reports, support, notifications                       |
| [`api/04-resident-portal.md`](api/04-resident-portal.md)                           | `/me/stays/{stayId}`                    | Active Hostel: invoices, Pay Rent proofs, receipts, deposit, menu, transport, complaints, checkout, review, notices |
| [`api/05-management-setup.md`](api/05-management-setup.md)                         | `/owner`, `/manage/branches/{branchId}` | Organisations, brands, branches, settings, property, pricing, photos, payment methods, imports, staff, verification |
| [`api/06-management-operations.md`](api/06-management-operations.md)               | `/manage/branches/{branchId}`           | Bed Board, booking decisions, check-in, residents, walk-ins, transfers, checkout, visits, chat, notices             |
| [`api/07-management-finance.md`](api/07-management-finance.md)                     | `/manage/branches/{branchId}`, `/owner` | Rent Board, invoices, proof approval, payments, receipts, deposits, discounts, reminders, collection                |
| [`api/08-management-services-reports.md`](api/08-management-services-reports.md)   | `/manage/…`, `/owner`                   | Menu, transport, complaints, reviews, dashboards, reports, exports, audit                                           |
| [`api/09-platform-admin.md`](api/09-platform-admin.md)                             | `/admin`                                | Admins, verification, moderation, geography master data, users, reports, support, announcements, metrics            |
| [`api/09-property-report-prerequisite.md`](api/09-property-report-prerequisite.md) | `/branches/{branchId}/property`         | AUD-010 additive property hierarchy, bounded named reads, audited/versioned management; Web pending                 |
| [`api/10-realtime-and-jobs.md`](api/10-realtime-and-jobs.md)                       | WebSocket, queues                       | Socket events, background jobs, domain events → notifications                                                       |

---

Phase3 Owner billing-policy endpoints also accept the optional explicit disclosed-
fee timing in [API07](api/07-management-finance.md), CHG-011 / SRS v2.6. Strict
contracts preserve original fee cadence/rates; this adds no new financial mutation
endpoint or authorization. Current calculation/runtime acceptance is in STATUS.md.

## 1. Basics

| Item       | Rule                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL   | `https://api.<domain>/v1` (local `http://localhost:4000/v1`)                                                                                                                                                            |
| Style      | REST, JSON, **camelCase** fields. Nouns for resources; state changes that aren't simple edits are **action sub-resources**: `POST /bookings/{id}/approve`                                                               |
| Spec       | OpenAPI 3.1 generated from NestJS + Zod (`packages/contracts`). Served at `/v1/docs` in non-production only. The typed client is generated into `packages/api-client`                                                   |
| Versioning | URL major version (`/v1`). Additive changes are allowed; breaking changes need `/v2` + an ADR. Mobile apps in the field must keep working: **never remove a v1 field while any supported app version uses it**          |
| IDs        | UUID strings. Display codes (`invoiceNo`, `receiptNo`) are separate read-only fields                                                                                                                                    |
| Money      | Integer **paisa** as a JSON number, field suffix `Paisa` (`monthlyRentPaisa: 1200000` = PKR 12,000). Zod: `int().min(0).max(Number.MAX_SAFE_INTEGER)`. Converted to `bigint` at the repository boundary. Never decimals |
| Dates      | `YYYY-MM-DD` for calendar dates. ISO-8601 UTC timestamps (`2026-10-06T09:30:00Z`) for instants. Clients display in `Asia/Karachi`                                                                                       |
| Month      | `YYYY-MM` (billing month query params)                                                                                                                                                                                  |
| Language   | English strings. Error `code`s are stable and machine-readable, so clients can localise later (SCOPE-003)                                                                                                               |

## 2. API surfaces & route scoping

| Prefix                          | Who                                             | Guard                                                                                                                 |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/public/*`                     | Anyone (guest)                                  | None; rate-limited; **public DTOs only** (no occupant/rent data, BR-05)                                               |
| `/auth/*`                       | Anyone                                          | Rate-limited per IP + identifier                                                                                      |
| `/me/*`                         | Logged-in user, **own data only**               | `AuthGuard`; queries always filter by `userId` from the token                                                         |
| `/me/stays/{stayId}/*`          | Resident                                        | `StayGuard`: the stay belongs to the user. Operational writes need `status ∈ {active, checkout_requested}` (STAY-004) |
| `/owner/*`                      | Owner                                           | `OwnerGuard`: acts only on organisations where `owner_user_id = me`                                                   |
| `/manage/branches/{branchId}/*` | Owner of branch **or** active Manager of branch | `BranchScopeGuard` (below)                                                                                            |
| `/admin/*`                      | Platform admins                                 | `AdminGuard` + required admin role(s) per endpoint                                                                    |

### BranchScopeGuard (SEC-001, ACC-002)

1. Load the caller's live authority: owned branch IDs + an **active** manager assignment, re-checked per request (not trusted from the JWT).
2. If `{branchId}` is not in that set → **403 `BRANCH_FORBIDDEN`**.
3. Every repository query filters by **both** `branchId` and the child id (`WHERE branch_id = $1 AND id = $2`). A child of another branch therefore returns **404** and can't be enumerated.
4. Endpoints marked **OWNER-ONLY** additionally require that the caller owns the branch (e.g. manager appointment, voiding payments, audit log).

## 3. Scope legend used in `docs/api/*`

| Tag            | Meaning                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `PUBLIC`       | No login                                                                                       |
| `AUTH`         | Any logged-in user                                                                             |
| `SELF`         | Logged-in user, own resources                                                                  |
| `RESIDENT`     | Own stay; writes only while active                                                             |
| `OWNER`        | Owner, own organisations                                                                       |
| `BRANCH`       | Owner of the branch or its active Manager                                                      |
| `OWNER-ONLY`   | Owner of the branch only                                                                       |
| `ADMIN:<role>` | Admin holding that role (`verification`, `support`, `moderator`). Root passes all admin checks |
| `ROOT`         | Root admin only                                                                                |

## 4. Authentication transport

- **Mobile:** `Authorization: Bearer <accessToken>`. The refresh token lives in `expo-secure-store` and is sent to `POST /auth/refresh` in the body.
- **Web:** access + refresh in `HttpOnly; Secure; SameSite=Lax` cookies. Every non-GET request carries `X-CSRF-Token` (double-submit).
- Access token TTL ~10 min. Refresh tokens rotate on every use, and reuse of an old one revokes the session family.
- `401 TOKEN_EXPIRED` → the client refreshes once and retries. `401 SESSION_REVOKED` → the client logs out.

## 5. Requests & responses

- Single resource: `200 { ...resource }`. Creation: `201` + body + `Location` header.
- Lists: `200 { "data": [...], "nextCursor": "opaque" | null }`. **Cursor pagination** `?cursor=&limit=` (default 20, max 100). Every list is paginated.
- Filters are plain query params. Sorting via `?sort=field` / `?sort=-field` from an allow-list.
- Input objects are `.strict()`: unknown fields → `400`.
- Actions that only change state return the updated resource.

## 6. Errors: RFC 9457 `application/problem+json`

```json
{
  "type": "https://api.<domain>/errors/seat-unavailable",
  "title": "Seat is no longer available",
  "status": 409,
  "code": "SEAT_UNAVAILABLE",
  "detail": "Seat B2 in Room 203 was reserved by another booking.",
  "traceId": "01J…",
  "errors": [{ "path": "moveInDate", "code": "too_small", "message": "…" }]
}
```

| Status                                                                         | Used for                                                                                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400 `VALIDATION_FAILED`                                                        | Schema/validation errors (`errors[]` filled)                                                                                                                           |
| 401 `UNAUTHENTICATED` / `TOKEN_EXPIRED` / `SESSION_REVOKED`                    | Auth problems                                                                                                                                                          |
| 403 `FORBIDDEN` / `BRANCH_FORBIDDEN` / `STAY_NOT_ACTIVE` / `ACCOUNT_SUSPENDED` | Authenticated but not allowed                                                                                                                                          |
| 404 `NOT_FOUND`                                                                | Missing **or outside the caller's scope**                                                                                                                              |
| 409 `CONFLICT` + specific code                                                 | State conflicts: `SEAT_UNAVAILABLE`, `BOOKING_LIMIT_REACHED`, `ACTIVE_STAY_EXISTS`, `INVALID_STATE_TRANSITION`, `IDENTITY_EXISTS_CLAIM_REQUIRED`, `ROOT_ADMIN_LIMIT` … |
| 412 `PRECONDITION_FAILED`                                                      | `If-Match` ETag mismatch                                                                                                                                               |
| 422 `BUSINESS_RULE_VIOLATION` + code                                           | Valid input that breaks a rule: `PHOTOS_REQUIRED`, `CAPACITY_BELOW_OCCUPANCY`, `REVIEW_NOT_ELIGIBLE`, `CATEGORY_MISMATCH` …                                            |
| 429 `RATE_LIMITED`                                                             | With a `Retry-After` header                                                                                                                                            |
| 500 `INTERNAL`                                                                 | Never leaks internals; includes `traceId`                                                                                                                              |

## 7. Idempotency & concurrency

- **`Idempotency-Key: <uuid>` header is REQUIRED** on: booking create, proof submit, proof approve/reject, payment record, check-in, walk-in, transfer, checkout complete, deposit refund, invoice generate, manager appoint. The server stores key + request hash + response for 24 h. A replay returns the original response. The same key with a different body → `409 IDEMPOTENCY_KEY_REUSED` (PAY-008, p.27–28).
- Seat/invoice mutations use DB row locks server-side. A losing concurrent request gets `409 SEAT_UNAVAILABLE` / `INVALID_STATE_TRANSITION` (ACC-001).
- Editable config resources (branch profile, settings, menu, room) return an `ETag`. `PATCH`/`PUT` may send `If-Match`, and a mismatch gives `412`.

## 8. Files (uploads & downloads)

1. `POST /v1/files/uploads` `{ purpose, fileName, mimeType, sizeBytes }` → `{ fileId, uploadUrl, headers, expiresAt }` (presigned PUT, ~5 min).
2. The client uploads directly to storage.
3. `POST /v1/files/{fileId}/complete` with `{}` → 202 `{ fileId, scanStatus, mimeType, sizeBytes }`. The server checks actual magic bytes/size and persists a scan job. The worker establishes `clean | rejected`; status is available through uploader-only `GET /v1/files/{fileId}`.
4. Other endpoints reference `fileId`. A file can only be attached by its uploader, and only to a resource of the matching `purpose`.
5. Private downloads: endpoints return **short-lived signed URLs** (`url`, `expiresAt`) only after an authorisation check. Sensitive access is logged.

## 9. Security headers & limits

- Helmet (CSP, HSTS, nosniff, frame-ancestors none), a CORS allow-list per environment, body limit 1 MB (files go direct to storage).
- Rate-limit headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- Default limits (tunable): login 5/min per identifier + 20/min per IP; OTP send 1/60 s, 5/h; proof submit 10/h per user; chat 30/min; public search 60/min per IP.

## 10. Design decisions made in this contract (pending review)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                     | Why                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D1  | If a branch requires **no upfront payment**, approving a booking makes it **Confirmed** straight away and the seat stays **Reserved** until check-in or cancellation. If upfront payment is required: approve → `payment_pending` (with a `booking_upfront` invoice) → proof approved → `confirmed`. **Offer expiry** (BKG-010) applies only to `approved`/`payment_pending` | Matches the SRS lifecycle (p.21–22) without an extra manual "confirm" click          |
| D2  | **Walk-in claim:** registering with a CNIC/phone/email that matches an `unclaimed` identity returns `409 IDENTITY_EXISTS_CLAIM_REQUIRED`. Management sends a claim code to the resident's email (`POST …/residents/{stayId}/invite`). The resident completes `POST /auth/claim`                                                                                              | Stops someone who only knows a CNIC from taking over a resident's stay (RES-002/003) |
| D3  | Public seat status has three values: `available`, `occupied`, `unavailable` (reserved/maintenance/unpublished)                                                                                                                                                                                                                                                               | SRS p.19: occupied is shown, the reason for unavailability is hidden                 |
| D4  | Cross-branch child IDs return **404**, a foreign `branchId` returns **403**                                                                                                                                                                                                                                                                                                  | Clear denial (SEC-001) without letting IDs be enumerated                             |
| D5  | **Branch notices** to residents (the Active Hostel "Notices" module, p.24) need a new `branch_notices` table, now added to the schema doc                                                                                                                                                                                                                                    | It was missing from the logical model                                                |

## Phase 1 authorization implementation

SEC-001 / ACC-002: declared scopes are validated at startup. Authenticated routes resolve live capabilities from the database, and branch/object admission uses scoped repository queries. Inaccessible direct branch requests return 403; inaccessible or mismatched protected child resources return 404. Root has no automatic hostel operational bypass; Billing remains deferred (CHG-003). StayGuard denies resident access until its later domain model exists. Sensitive admission additionally follows CHG-004 and need-based access; full disclosure requires transactional audit and is not exposed by this checkpoint. See phase-1-authorization.md for current implementation and evidence; later endpoint tables remain planning.

### Phase 1 idempotency implementation

PAY-008: the reusable interceptor is opt-in on declared mutating handlers. Its actor-bound cache includes endpoint, actual route scope, canonical payload/query fingerprint and the original validated status/body for 24 hours. Scope and session admission are rechecked inside the identity-locked business transaction before replay. Failed mutations/audits do not produce cached responses. Credential responses and signed URLs cannot be cached. Existing auth routes are not opted in; the contract-required later endpoints use this foundation when implemented. See phase-1-cross-cutting.md for the transaction boundary and current verification evidence.

### Phase 1 upload metadata constraints (SEC-003)

Shared upload contracts reject unknown fields, executable or macro file extensions,
path/control characters, a MIME/extension mismatch and an invalid purpose/type pair.
Images for avatar/listing-photo purposes are limited to 8,000,000 bytes; imports to
5,000,000 bytes (CSV/XLSX); other private JPEG/PNG/PDF attachments to 10,000,000 bytes.
Receipt PDFs and exports are server generated and cannot use client upload purposes.
Actual content length and MIME are verified server side; client declarations do not
establish clean status. See ADR 0009 and docs/phase-1-cross-cutting.md. The earlier adapter checkpoint alone did not establish workflow completion. The
subsequent HTTP implementation adds uploader-only status/complete and audited
`GET /v1/files/{fileId}/download`, returning a 60-second URL only for a clean private
snapshot with server SHA-256. Current verification evidence is recorded in STATUS.

## Shared generated client (Phase 1)

`@hsm/api-client` generates its committed TypeScript schema from the implemented
Nest controllers' OpenAPI 3.1 metadata. Regenerate with
`pnpm turbo run client:generate --filter=@hsm/api-client`; no container is needed
for this source operation. CI regenerates and checks for drift (ADR 0014).
Unimplemented planning endpoints are not generated. Nullable pagination cursors
use the OpenAPI 3.1 null union. Web uses cookie credentials plus CSRF; mobile uses
bearer credentials and body-only refresh tokens. Validate successful responses
with shared Zod schemas through `readApi`; RFC 9457 status must match HTTP status.
Transport/invalid-response failures use safe client error codes. This generation
step does not replace real API/database or browser/native integration checks.

AUTH-C CHG-006: "GET /v1/me/profile-details" adds a private SELF-only edit projection
with masked CNIC and no-store responses; see API 01 for fields and lock/privacy rules.
This read does not grant Customer/Owner capabilities or bypass protected uploads.

ONB-001 SEC-001 CHG-006: private Owner geography reads now support named hostel
setup choices at `/v1/owner/geography/cities` and
`/v1/owner/geography/cities/{cityId}/areas`; see API 05 for pagination, active
parent/city restrictions and live authorization. These read existing master data
and do not introduce a public geography or master-data management endpoint.

Phone-only Manager email association (CHG-006, ADR 0025) uses authenticated SELF
`POST /v1/auth/email/associate` and `/verify`, with current-password reauthentication,
persisted purpose-bound proof and existing cookie CSRF/bearer transport. Details
are in API 01. It does not merge identities or issue a session.

## Revised Phase 2 implementation in progress (CHG-007)

New runtime routes use the same /v1 transport, strict Zod boundaries, default-deny
scopes, cookie CSRF, actor/session checks and transaction-bound idempotency. Public
/marketplace reads expose approved listings only; quote is a read-only POST. Customer
holds/bookings and lifecycle commands require Idempotency-Key. Management inventory,
policy and booking paths bind exact branch IDs; foreign child IDs return 404. Manager
permissions further restrict live assignment scope and are rechecked before replay.

Platform booking defaults/limits are Root-only. Owner hostel, branch and room-type
versions inherit and are validated together. Money is exact integer paisa. Quotes
include immutable resolved terms and their policy lineage; client values cannot
change server pricing or allocation. Required private evidence must be owned, clean
and of an approved purpose. Summary DTOs expose evidence state, never file IDs, raw
CNIC, uploader identity, storage keys or URLs. Published listing media has a separate
public projection route with digest/scan/publication rechecks. Full contracts,
generated-client drift and HTTP/container acceptance remain pending.

Phase 2 NTF-002 / SEC-003: `GET /v1/me/notifications` returns only the live account's
persisted inbox, chronological cursor page and actual unread count. Raw notification
`data`, recipient IDs and deep links are omitted. `PUT /v1/me/notifications/:id/read`
requires self scope and an idempotency key; server read time is monotonic and foreign
IDs return 404. These routes are under implementation and integration acceptance
remains NOT RUN LOCALLY.

### CHG-008 private booking evidence

`GET /branches/:branchId/booking-documents/:documentId/download` is Owner-only,
requires live session/ownership and matching private clean customer evidence,
and audits access before returning a 60-second signed download with no-store.
Before confirmation, Manager permissions never grant document-content access;
Managers receive verification states through scoped booking summaries only.
Other sensitive resources retain existing access rules. Real HTTP/storage
verification is authored, NOT RUN LOCALLY.

### Phase 2 booking document review continuation (CHG-008 / BKG-001)

- `GET /me/booking-documents/:branchId`: live self-scoped evidence history,
  bounded `cursor`/`limit`; own private file reference and consumption state only.
- `POST /me/booking-documents/:branchId`: verified, completed Customer explicitly
  submits `{kind,fileId,shareWithOwner:true}` for an approved published branch.
  File must belong to that Customer, reside in the private bucket, have purpose
  `resident_document` and be clean. UUID Idempotency-Key; 201; cookie CSRF applies.
- `GET /branches/:branchId/booking-documents`: owning Owner only; pending,
  unconsumed standalone or unexpired pending-request evidence queue. Metadata
  excludes file IDs, customer IDs and raw identity. Managers receive denial.
- `POST /branches/:branchId/booking-documents/:documentId/review`: owning Owner
  only; `{state:"accepted"}` or `{state:"rejected",rejectionCode}` where code is
  `unreadable`, `wrong_document`, `details_mismatch` or `other`. UUID idempotency,
  cookie CSRF, 200. Final review is immutable; resubmission creates new history.
- Existing Owner-only download route remains short-lived, audited and no-store.
  Consumed standalone sources cannot bypass their booking's access boundary.

All routes use no-store. Authorization runs before replay. Booking creation copies
review provenance and conditionally consumes the standalone source in its existing
transaction; failures roll back booking, claims, evidence and audit together.
A fresh accepted submission can be used once when reuse is disabled. Historical
approval reuse requires policy permission. Latest rejection blocks confirmation.

These new routes and real infrastructure tests are in implementation; this API
amendment does not certify CI, PostgreSQL execution or Phase 2 completion.

### Booking-history pagination and private caching (BKG-001 / SEC-003)

Customer `GET /me/bookings` and scoped hostel `GET /branches/:branchId/bookings`
use UUID `cursor` and integer `limit` (1–100, default 20), now declared in OpenAPI
as well as the existing strict runtime page schema. Both explicitly send
`Cache-Control: no-store`. They return validated snapshots and document states,
excluding private file references and customer identity fields. The generated
client accepts pagination directly. Actual PostgreSQL/HTTP header and scope checks
are authored and NOT RUN LOCALLY; implementation verification is in progress.

### Booking validation timing and eligibility (BKG-001/003 / SRS p21)

Holds and booking creation recheck live actor/profile and the existing hostel
category/gender rule. Boys/working-male categories require a male profile;
girls/working-female categories require a female profile. Incompatible values fail
closed. Anonymous discovery/quotes remain public. Quote and hold timing uses a
fresh post-lock clock; creation rechecks hold expiry after evidence validation.

Request confirmation uses the same active online inventory validation, rechecks
the current Customer profile/category and required evidence in the configured
private bucket, and refreshes the request deadline after blocking validation.
Human approval cannot override a revoked scan; rejected/missing evidence cannot
confirm. Snapshotted policy still determines whether human review is required.
Cancellation/rejection retain scoped history and release claims transactionally.
These are existing requirement corrections; real infrastructure acceptance remains
NOT RUN LOCALLY and current full API verification is pending.

### Phase 2 physical inventory lifecycle (PROP-002 / ACC-001 / ACC-004)

| Method | Path                                                              | Input                |
| ------ | ----------------------------------------------------------------- | -------------------- |
| PUT    | `/v1/branches/:branchId/inventory/rooms/:roomId/status`           | `{ status, reason }` |
| PUT    | `/v1/branches/:branchId/inventory/seats/:seatId/status`           | `{ status, reason }` |
| POST   | `/v1/branches/:branchId/inventory/room-types/:roomTypeId/archive` | `{ reason }`         |
| POST   | `/v1/branches/:branchId/inventory/rooms/:roomId/archive`          | `{ reason }`         |
| POST   | `/v1/branches/:branchId/inventory/seats/:seatId/archive`          | `{ reason }`         |

Status is active/inactive/maintenance. Inputs are strict; schema failures and
unknown force flags return 400 VALIDATION_FAILED under the existing error contract.
Successful responses are the existing inventory mutation envelope, 200/no-store,
with Idempotency-Replayed. Cookie mutations require bound CSRF; every mutation
requires an actor-bound idempotency key and live exact-branch authorization.
Room/bed lifecycle needs inventory_edit; room-type archival additionally needs
pricing_edit. Root status alone does not grant hostel operational access.

Transactions lock the branch hierarchy and target children, expire obsolete
reservations, and reject taking stock offline or archiving it while a current/
future unreleased claim remains (including manual occupancy blocks). Resolve the
booking/hold/block first; these operations never silently cancel or release it.
Reactivation never overrides claims. The current actor/session is rechecked after
blocking validation before writes. Successful actions and reasons are audited in
the same transaction with before/after state.

Room-type archival archives its unarchived rooms and beds; room archival archives
its unarchived beds. Bed archival affects that record only. IDs, durable ordinals,
booking quotes and historical references are retained. No hard-delete/unarchive
escape route or payment state is introduced. API/client generation and current
full-source verification are pending for this additive surface.

### AUTH-C-005: booking-time permanent address

Customer booking creation accepts optional `permanentAddress` (trimmed, 5–500
characters) only for the authenticated Customer. A valid supplied or saved address
is required before a request/instant booking is created; otherwise 422
VALIDATION_FAILED. Supplied identity updates commit or roll back with the booking.
Confirmation revalidates the saved address. Holds/history remain available without
collecting an address. Checkout collects it privately and clears it after success;
booking summaries/public listings/policy snapshots never include it. Existing
sensitive-access restrictions remain unchanged. No new migration is required.

### ACC-004: scoped inventory block history

`GET /v1/branches/:branchId/inventory/blocks` is authenticated, branch-scoped and
no-store. Owners and live assigned Managers may read inventory metadata; creating
or releasing a block still requires `block_manage`. Query fields are strict:
`limit` 1–100 (default 20), optional UUID `cursor`, and `state` = `unreleased`
(default), `released`, or `all`. Unreleased describes the explicit release state,
not an assertion that a past date range currently affects availability.

The closed page returns `data` and nullable `nextCursor`, ordered by block ID.
Each entry contains the existing block state plus retained `roomLabel`, nullable
`bedLabel` (null for whole-room blocks), and `createdAt`. Archived physical target
labels remain available while branch scope is authorized. Free-text audit reasons,
actor/customer identities, file IDs and private URLs are excluded. Unknown query
fields, invalid filters or bounds return 400 VALIDATION_FAILED. Read scope and
session state are revalidated before fetching the page. No migration is required.

Phase3 private staff/Customer Stay read contracts are recorded in
[API17](api/17-stay-operational-reads.md). Scope is limited to implemented operational
reads; later financial/lifecycle endpoint tables remain plans until STATUS verifies them.

Phase3 approved charge catalogue routes, permissions and immutable price semantics
are defined in [API18](api/18-approved-charge-catalog.md). Runtime, offline OpenAPI,
SDK source and real Testcontainers fixture wiring are implemented; verification
is recorded in STATUS.md. No financial posting route is enabled.

Private Stay invoice balances: [API19](api/19-private-stay-invoices.md), source implementation2026-10-20. Exact staff finance_view and explicit own-account scope, immutable grace and receipt-backed projection; runtime verification pending.

AUD-009 action-queue runtime and Owner dashboard pagination are specified in [API08](api/08-management-services-reports.md#aud-009-runtime-action-queues-2026-10-28). These additive read contracts preserve existing finance, Stay, complaint and booking authorities and projections; no database migration or historical rewrite.

### HMA-015 profile-review feature negotiation (2026-10-31)

Current SDK clients send `x-hsm-profile-reviews: 1`; the Web proxy forwards it.
Enabled profile feature metadata is included only for this exact opt-in. Missing or
unsupported values retain the legacy strict profile/login response shape. This is
response-shape compatibility, grants no authority and bypasses no authentication,
CSRF or role checks. The default-off backend flag and schema readiness still apply.

### Bed assignment history (BED-002 / RES-005; 2026-11-02)

`GET /v1/branches/:branchId/occupancy/beds/:bedId/history` requires live `stay_manage`
in the exact branch and returns `Cache-Control: no-store`. Query: `limit` 1–50
(default 20), optional `cursor` from `nextCursor` (ISO instant + assignment UUID).
Rows are newest first by assignment start, then ID, and preserve original `stayId`,
assignment dates, resident display name and explicit `wholeRoom` attribution.
Whole-room entries describe the room assignment, rather than an individual bed claim.
Ended assignments and archived beds remain readable; no identity documents or financial
facts are included. Existing stay-detail and finance permissions apply to drill-downs.

Current occupancy responses may include `rentStatus: clear | overdue | null` on each
bed (BED-001 / RENT-004). Only current occupied beds with live finance_view receive
financial facts. All earlier due issued invoices are checked with their agreed grace
and receipt-backed allocations; other beds, historical reads and unauthorized financial
readers receive null. Clear describes absence of overdue debt and does not assert Paid.

Custom amenities (CHG-023): GET /v1/branches/:branchId/listing/custom-amenities pages
organization-scoped records with limit/cursor and canEdit. POST on the same route accepts
strict create/edit/archive commands with Idempotency-Key; edit/archive require current version.
Writes require branch ownership and listing_edit, audit organization changes and preserve
associations. Listing/room-type/room assignment writers reject foreign organization codes.
The public global amenities catalog excludes organization-defined entries.

CHG-024 / STAY-002: PUT /v1/me/stays/:stayId/agreements/:agreementId/acceptance requires
an authenticated account linked to the exact stay, Idempotency-Key and strict body
{version, termsDigest, acknowledged:true}. The canonical digest comes from the original
stay record. Stale/tampered evidence returns 412, foreign stays 404. Replay reauthorizes
access and preserves original evidence. Existing private stay records include per-version
digest/acknowledgements; session identifiers are never returned. Staff cannot acknowledge
on behalf of residents. This is authenticated acknowledgement, not a digital signature.

STAY-002 / CHG-025: PUT /v1/branches/:branchId/agreement-template requires Owner, Idempotency-Key and {policyVersionId, template:{title,text,fileId}|null}; 412 on stale policy. Existing policy versions are reused. Own (/me/stays/:stayId) and scoped staff (/branches/:branchId/stays/:stayId) expose GET/POST /agreements/:agreementId/files and GET /agreements/:agreementId/files/:fileId/download. Reads are no-store, paginated limit20/max50; writes are idempotent and append-only. Downloads require the exact association or original template snapshot, private clean correct-purpose file, live scope and sensitive audit. No broad own-file permissions are changed.

BED-002 / CHG-026: GET bed occupancy adds optional real location:{hostel,branch,building|null,floor|null}; missing physical associations remain explicit. GET /v1/branches/:branchId/stays/:stayId/resident-photo requires stay_manage, or GET /v1/me/stays/:stayId/resident-photo requires exact linked account. Returns {url,expiresAt} or both null; private clean approved profile pointer only, sensitive-audited, no-store. Settlement DTO adds optional lastApprovedPayment (non-reversed/receipted) and nextInvoiceDueDate (unpaid issued invoices on/after server date); no forecast or historical statement rewrite.

STAY-002: own/staff GET original Stay record accepts optional beforeAgreementVersion (positive int32). Responses retain at most50 agreement versions per page and expose optional nextAgreementBeforeVersion equal to the last returned version when more exist. Descending strict continuation and exact acknowledgement scope are checked by the typed client. Existing branch/self authorization is rechecked on every page.

## Combined payments (CHG-055, PAY-008 / BKG-007 / SERV-002)

`GET /v1/me/stays/{stayId}/payment-summary` returns linked-account security amounts:
agreed, received, remaining and pending. Proof input accepts `depositPaisa` and
optional `invoiceId` for security-only evidence. Revalidate at approval under Stay
lock. New external collections reject positive advance credit. Booking quote input
accepts `transportRequested`; selected separate monthly transport is captured and
added to upfront. Included routes have no extra charge. OpenAPI/client regenerated.
See [SRS v2.36](srs/SRS-v2.36-combined-security-payments.md).

## CHG-056: independent physical-bed rent

`GET /v1/branches/{branchId}/inventory/beds/{bedId}/prices` returns the current
effective bed rent (including legacy fallback), `canEdit`, and retained versions
with cursor/limit pagination. `POST` accepts `{effectiveFrom, monthlyRentPaisa}`
and an Idempotency-Key; both inventory_edit and pricing_edit are required under
current branch/object scope, including replays. Creation of a seat optionally
accepts monthlyRentPaisa and writes its initial dated rate in the same transaction.
Quotes resolve the actual allocated bed; discovery price filters and public bed
choices use the same effective rate. Existing booking snapshots remain immutable.

`POST /v1/branches/{branchId}/inventory/metadata/{kind}/{targetId}/rename`
accepts `{name, expectedName}` plus Idempotency-Key for building/floor/room/seat.
Inventory editors only; exact branch/object locks, stale-name rejection, audit and
retained identities. Room/bed labels are limited to 80 characters; other names 120.
Building/floor versions increment so concurrent archive forms must refresh.

## Empty setup rooms (CHG-057 / ROOM-002)

POST /v1/branches/{branchId}/inventory/setup-rooms accepts only {label, floorId}, with Idempotency-Key, authenticated branch inventory_edit permission, active scoped floor/building checks, audited creation and 201 InventoryMutation response. Capacity and deposit fields are rejected. Each added bed requires explicit monthlyRentPaisa plus pricing_edit. Room responses add capacity (actual non-archived beds); type summaries report the largest physical room and optionally setupManaged. Empty rooms are not publicly selectable. Managed containers cannot use shared price editing or legacy batch duplication/import.

## Bed rent and security (CHG-058 / BED-001 / BKG-003)

Bed creation and dated bed-price requests accept optional depositPaisa, integer paisa. Creation requires monthlyRentPaisa when security is supplied. Price version responses retain explicit overrides; current/private/public bed rows add resolved depositPaisa. Existing price grants, branch guards, audit and idempotency apply to both amounts. Future bed quotes and maximum-deposit filters use the selected bed security. Old rent-only request bodies remain accepted; strict clients consume the additive response fields.

## Explicit self-profile avatar removal (CHG-059)

PUT /me/customer-profile and PUT /me/owner-profile accept profilePhotoFileId as
an optional nullable UUID: omission preserves, null unlinks, UUID replaces after
existing uploader/private-bucket/scan checks. Verified self scope, account locks,
identity restrictions and audited saves apply to every case. Files/history are
retained; no delete-object endpoint or database migration is introduced.

## Manual admission CNIC photo (CHG-060 / SEC-003)

POST /branches/:branchId/stays/manual accepts optional top-level cnicPhotoFileId
(UUID), only for manual.resident.kind=new. Require current uploader ownership,
configured private bucket, resident_document purpose, JPEG/PNG, canonical key,
clean scan/checksum. Reuse existing scoped/locked/idempotent admission, attach in
its transaction and audit; reject before creating records on invalid evidence.
No new field is exposed in admission/public outputs. See SRS v2.41.

### Owner Dashboard presentation (OWN-001..004, 2026-11-22)

The existing scoped dashboard response adds optional `details` on branch rows and
totals: receipt-backed rent/transport/other collection attribution, overdue paisa,
issued salary dues, pending transport requests, actor-specific unread chat messages
and six month buckets. All branch totals cover the authorized population, independent
of display pagination. Collections/trend retain existing invoice-due-month semantics,
exclude security, and use canonical adjusted invoice balances. Mixed-invoice receipts
are attributed proportionally to charge face values for analytics only; integer
rounding stays in rent (or other when no rent exists). This is not line-earmarked
payment evidence. Salary dues include issued obligations net of reversals and unissued current
full-month terms that are already due; partial/future terms are not invented.
GET never issues salary obligations. No migration or financial writer change.

### Existing Operations financial filters (OWN-004 / RES-004 / FIN-001)

Resident directory accepts optional `billing=due|overdue` and `month=YYYY-MM`.
Due matches positive canonical invoice balances in the selected invoice month;
overdue matches canonical overdue balances across all months, including grace.
Require `finance_view` as well as existing `stay_manage`, before evaluating filters.
Filter candidates before the visible resident-page limit; retain search, status,
name/newest order and cursor semantics. No new endpoint or financial writer.

Staff directory accepts `salary=due`, requiring payroll access. Its pre-pagination
predicate matches unpaid issued obligations due by today plus current full-month
terms already due, using existing salary/reversal rules. Default staff queries keep
their behavior. A salary filter spans employment statuses unless explicitly narrowed.
