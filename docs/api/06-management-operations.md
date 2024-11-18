# API 06: Management Operations (`/manage/branches/{branchId}`)

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Scope `BRANCH` unless marked. Rules: BED-_, BKG-_, STAY-_, RES-_, OUT-_, MGRD-_, CHG-004. Every state change writes status history + `hostel_audit_log`.

## Phase 3 authoritative admission revision (CHG-009 / SRS v2.4–v2.9)

The original admission and walk-in drafts below are retained as planning history and superseded where they conflict with this revision. Booking confirmation remains a reservation; actual check-in creates the linked Stay and assignment while atomically handing off its canonical claim. Do not invent a new booking state or overwrite the original booking quote. See ADR0045.

Manual residents are explicit branch relationships. New manual relationships have no fabricated login, credentials or implicit account link. Matching email, phone or CNIC does not authorize identity merging. Selecting an existing relationship preserves its explicit link; a changed preflight link requires a fresh attempt under ordered participant locks. See ADR0062. The old automatic lookup/unclaimed User instructions are superseded.

Owner-controlled Manager permissions remain default deny: stay_manage for admission operations, rent_manage plus finance_view for manual financial terms. Missing billing policy, disclosed timing, consent, required booking documents or configured upfront checks cannot be replaced with guessed defaults. Preserve original agreed booking prices and policy/version snapshots. The complete transaction must include required initial financial records and schedules, history, audit and outbox. Offline residents create no fake notification recipient.

The private operational target component does not require public marketplace verification merely to operate the hostel (ADR0061). It does require active branch hierarchy and exact active room/type/bed binding. Its unit/static gates pass locally; actual PostgreSQL target and resident relationship cases are NOT RUN LOCALLY. These internal components do not expose or complete an admission endpoint. Final combined application acceptance remains required.

### Guarded manual-admission HTTP source (ADR0065)

`POST /v1/branches/{branchId}/stays/manual` uses `manualAdmissionCommandSchema`: the existing explicit `manual` input plus complete `initialBilling` selections. `Idempotency-Key` is required. The201 response contains branch/Stay/resident/agreement/assignment IDs, active state and version1 only. The server derives organization, actor role and existing resident account link. Live session and all three current stay/rent/finance grants are rechecked before new work and successful24-hour replay, under ordered participant locks. Changed branch/body/key intent is rejected. Cookie authentication retains the existing CSRF pair and responses are no-store.

The controller is optional acceptance-fixture-only; the production entry point does not register it before actual container acceptance required by ADR0044. It admits a manual relationship and does not convert or waive booking evidence, consent, upfront checks or original quoted terms. Real PostgreSQL/Redis HTTP acceptance is authored, NOT RUN LOCALLY. The complete local API unit/HTTP milestone passed 1,921 tests across 180 suites; actual container acceptance and exact-source CI remain unverified. No deployment or CI success is inferred.

## Bed Board

| Method | Path                                                                            | Purpose                                                                                                | SRS                         |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| GET    | `/manage/branches/{branchId}/bed-board?buildingId=&floorId=&roomTypeId=&state=` | Floors → rooms → seats with state + occupant `{ stayId, fullName }` + live reservation `{ bookingId }` | BED-001/002, p.20 filtering |
| GET    | `/manage/branches/{branchId}/seats/{seatId}`                                    | Seat detail, current assignment, assignment history, available actions                                 | BED-002                     |
| GET    | `/manage/branches/{branchId}/occupancy-summary`                                 | Total / occupied / available / reserved / maintenance                                                  | OWN-001                     |

**Implemented (Phase 5, 2026-10-26):** `GET /v1/branches/{branchId}/occupancy?on=&cursor=&limit=` (max 50 rooms per page) supersedes the draft `bed-board` and `occupancy-summary` rows above for the first milestone. It returns branch-wide totals plus rooms → beds with state `occupied | blocked | reserved | unavailable | available` (in that precedence), computed from live inventory claims on one date (default: today in Asia/Karachi). Only an active assignment is occupancy; a booking or hold is a reservation. The occupant `{ stayId, displayName }` appears only on occupied beds, and the endpoint requires a live `stay_manage` grant (RES-004). Filters `roomTypeId`, `roomId` and `state` narrow the listed rooms and beds (totals stay branch-wide). `GET /v1/branches/{branchId}/occupancy/beds/{bedId}?on=` returns one bed with every covering claim (assignment, block, booking or hold) and implements the seat-detail row (BED-002). Phase 5 also adds `GET /v1/branches/{branchId}/residents` (one row per resident; q/status/linked/sort/cursor), `GET /v1/branches/{branchId}/residents/{residentId}`, `GET /v1/branches/{branchId}/stays/{stayId}/record` and `GET /v1/me/stays/{stayId}/record` (original agreement snapshot, labelled assignments, actor-free lifecycle history). All staff reads require a live `stay_manage` grant.

**CHG-048 (2026-11-17):** occupancy rooms carry `building {id,name} | null` and `floor {id,label,levelNumber} | null`; `rentStatus` (finance_view only, today only) is `clear | paid | due | overdue | proof_pending` from server invoice balances and submitted proofs (`due` only once an invoice reaches its due date or is part paid); `GET …/occupancy/beds/{bedId}` adds `upcoming` (≤ 20 live claims starting after the date, earliest first). `GET /v1/branches/{branchId}/payment-proofs` and `GET /v1/branches/{branchId}/transport/subscriptions` accept `stayId` to narrow to one Stay.

**Implemented (2026-11-13, RES-006):** `PUT /v1/branches/{branchId}/residents/{residentId}/contact` replaces an offline resident's `displayName`, `phone` (`+92XXXXXXXXXX` or null) and `email` (or null). It requires a live `stay_manage` grant in that branch, locks the resident row, and writes `resident.contact.updated` (before/after) to `hostel_audit_log` in the same transaction (ACC-006). A linked resident (has an account) or an archived resident returns `409 CONFLICT`; another branch returns `404`; unknown fields return `400`. No schema change.

Seat state never changes through a generic PATCH. It changes only through the actions below (check-in, walk-in, transfer, checkout, maintenance, reservation).

## Booking decisions

| Method | Path                                                            | Purpose                                                                                                                                                                        | SRS                          |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| GET    | `/manage/branches/{branchId}/bookings?status=&cursor=`          | Queue, oldest/expiring first                                                                                                                                                   | p.37 queue ordering          |
| GET    | `/manage/branches/{branchId}/bookings/{bookingId}`              | Request + snapshot + customer (**masked CNIC, no address until approved**, CHG-004) + history                                                                                  | BKG-002                      |
| POST   | `/manage/branches/{branchId}/bookings/{bookingId}/under-review` | Mark as being reviewed (also auto-set on first open); records the response time                                                                                                | p.39 response metric         |
| POST   | `/manage/branches/{branchId}/bookings/{bookingId}/approve`      | `{ offerExpiresAt? }` (default from settings). Creates the seat reservation. No upfront → `confirmed`; upfront → `payment_pending` + upfront invoice (D1). **Idempotency-Key** | BKG-006..010                 |
| POST   | `/manage/branches/{branchId}/bookings/{bookingId}/reject`       | `{ reason }` **required**                                                                                                                                                      | BKG-002                      |
| POST   | `/manage/branches/{branchId}/bookings/{bookingId}/cancel`       | `{ reason }` (e.g. no-show), releases the reservation                                                                                                                          | p.22                         |
| POST   | `/manage/branches/{branchId}/bookings/{bookingId}/check-in`     | See below. **Idempotency-Key**                                                                                                                                                 | STAY-001, p.37 check-in rule |

`POST …/check-in` request:

```json
{
  "checkedInAt": "2026-11-01T10:00:00Z",
  "agreementVersionId": "…",
  "contacts": [{ "kind": "guardian", "name": "…", "relation": "father", "phone": "+92…" }]
}
```

One transaction: lock the seat, revalidate the reservation (p.48 booking concurrency), check the customer has no other active stay (`409 ACTIVE_STAY_EXISTS`), create the stay (`active`) + bed assignment, seat → `occupied`, reservation → `converted`, booking → `checked_in`, create the security-deposit record, outbox + audit. Rent invoices begin per the billing settings.

## Residents

| Method     | Path                                                                                         | Purpose                                                                                                                           | SRS                               |
| ---------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| GET        | `/manage/branches/{branchId}/residents?status=active\|upcoming\|checkout_requested\|past&q=` | Resident list (search is scoped to the branch **before** matching)                                                                | p.37 no cross-branch search       |
| GET        | `/manage/branches/{branchId}/residents/{stayId}`                                             | Full resident record: identity (full CNIC; access logged), contacts, assignment + transfer history, financial summary, complaints | p.25, SEC-003                     |
| PATCH      | `/manage/branches/{branchId}/residents/{stayId}`                                             | `{ expectedLeaveDate?, universityOrEmployer? }`. **Identity fields not editable**                                                 | p.8, p.25                         |
| PUT        | `/manage/branches/{branchId}/residents/{stayId}/contacts`                                    | Guardian / emergency contacts                                                                                                     | p.25                              |
| GET / POST | `/manage/branches/{branchId}/residents/{stayId}/documents`                                   | `{ fileId, docType }`; downloads via signed URL (logged)                                                                          | p.25 document access              |
| POST       | `/manage/branches/{branchId}/residents/walk-in`                                              | Walk-in admission. **Idempotency-Key**                                                                                            | RES-001..003                      |
| POST       | `/manage/branches/{branchId}/residents/{stayId}/invite`                                      | Email a claim code so an unclaimed walk-in can activate the app (D2)                                                              | RES-003                           |
| POST       | `/manage/branches/{branchId}/residents/{stayId}/transfer`                                    | `{ toSeatId, reason }`. **Idempotency-Key**                                                                                       | RES-005, p.20 transfer validation |

`POST …/residents/walk-in`:

```json
{ "identity": { "cnic": "…", "fullName": "…", "phone": "+92…", "email": "…?", "gender": "male",
                "dateOfBirth": "…?", "permanentAddress": "…" },
  "seatId": "…", "checkedInAt": "…", "contacts": [ … ], "depositRequiredPaisa": 1200000 }
```

1. Look up the identity by normalised CNIC → phone → email (p.25 walk-in uniqueness).
2. If it matches an existing user, **link** to it (RES-002). If none, create an `unclaimed` user.
3. Then run the same atomic path as check-in. The response includes `identityMatch: "linked_existing" | "created_unclaimed"`.
4. The rent amount always comes from the room's current price (RENT-002). It is not typed in.

Transfer: the destination must be `available` in the **same** branch. One transaction ends the old assignment and starts the new one (old seat → `available`, new seat → `occupied`). A mid-cycle rent difference is handled by an explicit adjustment (p.26).

## Checkout (management side)

| Method | Path                                                                           | Purpose                                                                                                                                                                                                                                                     | SRS                        |
| ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| GET    | `/manage/branches/{branchId}/checkouts?status=`                                | Checkout requests + upcoming leaving dates                                                                                                                                                                                                                  | OWN-003                    |
| POST   | `/manage/branches/{branchId}/residents/{stayId}/checkout/start`                | Management-initiated checkout (if the resident didn't request)                                                                                                                                                                                              | OUT-001                    |
| GET    | `/manage/branches/{branchId}/residents/{stayId}/checkout/preview`              | Draft final statement: rent due, payments, outstanding, advance, deposit, deductions, refund, final balance + warnings                                                                                                                                      | OUT-003/005, p.34 blocking |
| POST   | `/manage/branches/{branchId}/residents/{stayId}/checkout/deductions`           | `{ amountPaisa, reason, evidenceFileId? }` (reason required)                                                                                                                                                                                                | OUT-004                    |
| POST   | `/manage/branches/{branchId}/residents/{stayId}/checkout/deductions/{id}/void` | `{ reason }`                                                                                                                                                                                                                                                | audit                      |
| POST   | `/manage/branches/{branchId}/residents/{stayId}/checkout/complete`             | `{ checkedOutAt, refund: { amountPaisa, status: pending\|completed, reference?, proofFileId? } }`. **Idempotency-Key**. Finalises the statement, ends the assignment, seat → `available` (marketplace updates), stay → `checked_out`, booking → `completed` | OUT-005/006                |
| POST   | `/manage/branches/{branchId}/residents/{stayId}/deposit/refund`                | Mark a pending refund as completed `{ reference, proofFileId? }`                                                                                                                                                                                            | p.34 refund state          |

Unresolved dues show as **warnings, not blocks**. The owner/manager keeps authority to complete (p.34).

## Visits

| Method | Path                                               | Purpose                                            | SRS                 |
| ------ | -------------------------------------------------- | -------------------------------------------------- | ------------------- |
| GET    | `/manage/branches/{branchId}/visits?date=&status=` | Today's schedule / requests                        | MGRD "Today"        |
| POST   | `…/visits/{visitId}/approve`                       |                                                    | p.23                |
| POST   | `…/visits/{visitId}/reschedule`                    | `{ proposedStart, note? }` (inside visiting hours) | p.23 visit conflict |
| POST   | `…/visits/{visitId}/reject`                        | `{ reason }`                                       |                     |
| POST   | `…/visits/{visitId}/complete` · `…/no-show`        | Outcome                                            | VISIT-001           |

## Chat (branch side) & waiting list & notices

| Method                 | Path                                                      | Purpose                                          | SRS                |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| GET                    | `/manage/branches/{branchId}/conversations?unread=true`   | Branch inbox                                     | MGRD "unread chat" |
| GET / POST             | `/manage/branches/{branchId}/conversations/{id}/messages` | Read / reply (`senderSide = branch`)             | COMM-001           |
| POST                   | `/manage/branches/{branchId}/conversations/{id}/read`     |                                                  |                    |
| GET                    | `/manage/branches/{branchId}/waitlist?roomTypeId=`        | Waiting customers (name + contact via chat only) | WAIT-001           |
| GET / POST             | `/manage/branches/{branchId}/notices`                     | Notices to active residents (D5)                 | p.24               |
| PATCH / POST …/archive | `/manage/branches/{branchId}/notices/{noticeId}`          |                                                  |                    |

## Branch search

| Method | Path                                    | Purpose                                                              | SRS         |
| ------ | --------------------------------------- | -------------------------------------------------------------------- | ----------- |
| GET    | `/manage/branches/{branchId}/search?q=` | Residents, rooms, seats, invoices, receipts, inside this branch only | p.38 search |

## Confirmation transaction participants (ACC-001, SEC-003, AUTH-C-005)

The confirmation request/response contract is unchanged. A live branch-scoped
preflight resolves the persisted Customer, then releases its transaction locks.
The idempotent mutation reuses globally ordered staff/Customer identity locks
before inventory and rechecks branch authority. Customer-binding changes reject
before private profile/evidence reads; current profile/address and immutable quote
checks remain mandatory. Replays preserve their existing key/fingerprint/clock
rules. Unit regression recheck passed 26 assertions; filtered aggregate coverage
remains a failed diagnostic command. The deterministic PostgreSQL identity-wait
scenario is authored and NOT RUN LOCALLY. See ADR 0029.

### Booking check-in boundary preparation (2026-10-21)

BKG-004 / STAY-001: `bookingAdmissionCommandSchema` accepts `policyVersionId` and distinct `initialBilling` selections with exactly one periodic rent. Original booking identity, customer, target, quote, consent, document decisions and configured upfront verification are loaded and checked by the server. Disclosed-fee completeness, exact period validity and amounts require transactional validation against the original agreed terms. `bookingAdmissionResultSchema` returns only the safe active-Stay identifiers plus `bookingId`; the booking reservation state and quote remain historical facts. These boundary schemas do not implement or enable check-in. Atomic claim handoff, real transaction/HTTP acceptance and production activation remain pending (ADR0044/0045).

AUD-009 / BKG-004: GET /branches/:branchId/bookings additionally accepts optional queue=pending_requests. It applies persisted pending_request state before cursor/limit, matching dashboard counts. Existing branch authorization, pagination, expiry projection and default history are unchanged; unsupported queue values return 400. No migration or stored-state rewrite.
