# API 03: Customer (`/me`)

## Phase 3 connected waiting-list lifecycle (2026-10-24)

WAIT-001 / ACC-001..003: current normal API routes are listed below. All reads
return `Cache-Control: no-store`; mutations require `Idempotency-Key` and cookie
CSRF when applicable. Every replay rechecks the live account/Customer context;
leave additionally rechecks exact ownership. Pagination uses ascending entry UUID,
`limit` 1..100 (default20), optional `cursor` and `roomTypeId`.

| Method | Route                                   | Result                                                               |
| ------ | --------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/me/waitlist`                          | Own active and historical entries, never another customer's identity |
| POST   | `/me/waitlist`                          | `{branchId, roomTypeId?}`;200 get-or-create active preference        |
| GET    | `/marketplace/{branchId}/waitlist-open` | Public: `{open, roomTypeIds}` — ids only, 404 unless listed          |

CHG-040: `POST /me/waitlist` returns 409 unless a current resident of that room type (or
branch, without `roomTypeId`) has given departure notice. `expectedVacancyDate` everywhere is
the earliest such notice's requested checkout date, computed on read.
| DELETE | `/me/waitlist/{entryId}` | 200 historical entry with immutable `leftAt`; no hard deletion |
| GET | `/branches/{branchId}/waitlist` | Current authorized Owner/assigned Manager list with customer name only |

Join locks the inventory hierarchy, rechecks public eligibility and exact active
room type, and serializes duplicate preferences. Leave is available for own entries
after listing withdrawal. The existing original join key replays its original
acknowledgement; a deliberate rejoin after leaving uses a new key. No booking,
reservation, fee or payment is created. Customer and staff DTOs are strict and
separate; email/phone/CNIC/address/account identifiers are not exposed.

The shared SDK validates exact result identity/preference and bounded ordered
pages. Web/mobile mount join on hostel details, own list/leave in Customer space,
and the scoped list in branch management. Uncertain commands retain their original
body/key through list refresh. Vacancy fanout and worker delivery are connected
with real PostgreSQL/Redis acceptance recorded in STATUS.md. Both clients expose
actual paginated room-type preferences and versioned estimate editing. An uncertain
join keeps its exact selected preference; metadata refresh cannot replace an
uncertain estimate's date/version/key. This does not establish phase or production
acceptance; final navigation/browser and phase gates remain required.

WAIT-001 estimate routes: `GET` and `PUT`
`/branches/{branchId}/room-types/{roomTypeId}/expected-vacancy`. The strict result is
`{branchId, roomTypeId, expectedVacancyDate: date|null, version: instant|null}`;
PUT requires `{expectedVersion: instant|null, expectedVacancyDate: date|null}` and
an idempotency key. Current assigned staff can read the exact branch/type; writing
requires the existing `listing_edit` grant (owning Owner implicitly has it).
CHG-040: PUT with a date is refused (409); only `null` (clear) is accepted, and GET returns
the notice-derived date, not a typed one.
Publishing a date rejects currently available inventory; clearing an estimate is
explicitly allowed. Stale versions fail412, foreign types404, missing grant403.
The estimate and privileged audit commit together. Replay rechecks current grants
and exact active scope. The SDK rejects foreign results and unadvanced versions.

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Every endpoint is `SELF`: it acts only on the caller's own records. Rules: BKG-_, VISIT-_, COMM-_, WAIT-_, NTF-*.

## Favourites

| Method | Path                       | Purpose                           |
| ------ | -------------------------- | --------------------------------- |
| GET    | `/me/favorites`            | Saved hostels (public card shape) |
| PUT    | `/me/favorites/{branchId}` | Save (idempotent)                 |
| DELETE | `/me/favorites/{branchId}` | Remove                            |

## Bookings

| Method | Path                                          | Purpose                                                                      | SRS           |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| POST   | `/me/bookings`                                | Request to Book a seat. **Idempotency-Key**                                  | BKG-001..005  |
| GET    | `/me/bookings?status=`                        | My booking requests                                                          |               |
| GET    | `/me/bookings/{bookingId}`                    | Detail incl. price snapshot, policy, status history, offer expiry            | p.21          |
| POST   | `/me/bookings/{bookingId}/withdraw`           | Withdraw an unconfirmed request; releases the reservation                    | p.21 withdraw |
| POST   | `/me/bookings/{bookingId}/acknowledge-policy` | Accept the cancellation policy (required before a payment-dependent confirm) | p.22          |
| GET    | `/me/bookings/{bookingId}/invoice`            | Upfront invoice + branch payment methods (when `payment_pending`)            | BKG-007       |

Upfront proof upload uses the same endpoint as rent: `POST /me/invoices/{invoiceId}/proofs` (see 04).

`POST /me/bookings` request / checks:

```json
{ "seatId": "…", "moveInDate": "2026-11-01", "expectedLeaveDate": null, "acknowledgePolicy": true }
```

Server checks, in one transaction:

1. Email verified and permanent address present (AUTH-C-005) → else `422 PROFILE_INCOMPLETE`.
2. Seat is publicly selectable → else `409 SEAT_UNAVAILABLE`.
3. Gender/category eligibility → else `422 CATEGORY_MISMATCH`.
4. Fewer than 3 active requests (locks the user row) → else `409 BOOKING_LIMIT_REACHED` (BKG-001).
5. No active stay that conflicts. A customer with an Active Hostel **may** request a future stay; check-in later enforces one active stay (STAY-003).

Then it snapshots rent/deposit/upfront/policy version (BKG-004) and creates the booking in `submitted`.

The booking response always shows `monthlyRentPaisa`, `securityDepositPaisa`, `upfrontAmountPaisa`, `cancellationPolicy` **before** commitment (p.22 pricing transparency). There is no booking fee field, because none exists (BKG-005).

## Stays (entry to resident portal)

| Method | Path                                     | Purpose                                  | SRS           |
| ------ | ---------------------------------------- | ---------------------------------------- | ------------- |
| GET    | `/me/stays?group=upcoming\|active\|past` | Upcoming Stay, Active Hostel, Past Stays | STAY-001..004 |

## Visits

Phase3 runtime activation (2026-10-24; VISIT-001 / NTF-002): normal API and worker
configuration now defaults `VISITS_ENABLED=true`; an explicit false remains an
operational disable switch. The current lifecycle uses versioned `/actions`
commands, paginated private history and versioned post-visit interest responses
as detailed in the operational section below. The original cancel/accept-reschedule
shortcut paths in the v1 table are superseded by the combined actions route.
Real lifecycle/history, follow-up rollback and worker restart/retry checks are
recorded in STATUS.md. Follow-up notices navigate to the own Customer visit space;
management change notices return to current authorized account spaces.

| Method | Path                                       | Purpose                                                                | SRS                 |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------- | ------------------- |
| GET    | `/public/hostels/{slug}/visit-slots?date=` | Slots inside the visiting hours (PUBLIC)                               | p.23                |
| POST   | `/me/visits`                               | `{ branchId, requestedStart }`                                         | p.23                |
| GET    | `/me/visits`                               | My visits                                                              |                     |
| POST   | `/me/visits/{visitId}/cancel`              | Cancel                                                                 |                     |
| POST   | `/me/visits/{visitId}/accept-reschedule`   | Accept the time proposed by the hostel                                 | p.23 visit conflict |
| POST   | `/me/visits/{visitId}/interest`            | `{ stillInterested: bool }` post-visit prompt (one prompt, no nagging) | VISIT-001           |

## Waiting list

| Method | Path                     | Purpose                                                                        | SRS                   |
| ------ | ------------------------ | ------------------------------------------------------------------------------ | --------------------- |
| POST   | `/me/waitlist`           | `{ branchId, roomTypeId? }`. A duplicate active entry returns the existing one | WAIT-001, p.23 dedupe |
| GET    | `/me/waitlist`           | My entries + expected vacancy dates                                            |                       |
| DELETE | `/me/waitlist/{entryId}` | Leave the list                                                                 |                       |

Availability triggers a **notification only**. It never auto-books (p.23).

## Chat (customer side)

Phase3 operational REST source (2026-10-24; COMM-001/002): normal runtime and
OpenAPI register customer and exact-branch conversation list/history/send/read
paths. Management routes use `/branches/{branchId}/conversations` and the same
message/read suffixes. They require current ownership or active assignment;
customer paths require own Customer context. There is no Platform Admin bypass.
Conversation creation returns200 get-or-create for the exact customer/branch.
All lists use bounded UUID cursors; conversations ascend and messages descend.

Sends use a required idempotency key, trusted server sender identity/side, up to
4000 text characters and five distinct clean own private attachment IDs. Text or
an attachment is mandatory. The message, attachment links, latest timestamp,
required source outbox and staff audit commit together. Replay rechecks current
scope, including Manager suspension. Read markers are per account; later sends
advance beyond existing markers even when application clocks have equal values.

`GET .../{conversationId}/attachments/{fileId}/download` rechecks conversation
participation, active exact scope, file purpose/bucket/key, MIME/size, clean digest
and current scan state, then issues an audited60s signed private download. No
public file URL or raw storage key enters message DTOs. History retains file IDs
after scan revocation, but every new download is denied unless currently clean.
Referential history is never hard-deleted.

Chat create/send requests additionally use Redis-backed per-IP HMAC counters,
configured by `CHAT_SEND_RATE_LIMIT` (default30/minute), fail closed on Redis
failure, and preserve the global limit. Message text never enters notification
payloads. Source-based fanout targets only the current other participants;
final inbox publication rechecks current authority. Realtime, client mounting
and report/safety escalation still require completion and acceptance.

| Method | Path                                                  | Purpose                                                       | SRS      |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------- | -------- |
| GET    | `/me/conversations`                                   | My threads with hostels                                       |          |
| POST   | `/me/conversations`                                   | `{ branchId }` → get-or-create thread                         | COMM-001 |
| GET    | `/me/conversations/{conversationId}/messages?cursor=` | Messages, newest first                                        |          |
| POST   | `/me/conversations/{conversationId}/messages`         | `{ body?, attachmentFileIds? }` (attachments must be `clean`) | p.23     |
| POST   | `/me/conversations/{conversationId}/read`             | Mark read                                                     |          |

Real-time delivery is over WebSocket (see API 10).

## Reports, support, notifications

Phase3 chat-report runtime (COMM-002 / SEC-003, 2026-10-24):
`POST /me/reports` accepts only the approved `chat_message` target in this
milestone. A current Customer can report a message from their own conversation.
Current Owner/Manager participants use
`POST /branches/{branchId}/conversations/{conversationId}/reports`; the message
must belong to that exact thread and branch. Both require UUID Idempotency-Key,
return201 with the original case on replay, and reauthorize before replay.
Staff reports audit transactionally. Removed messages reject new submissions;
existing case evidence is retained. Body fields are strict: `{targetType:
chat_message,targetId,reason,details?}`, with the baseline reason enum and optional
nonblank details up to4000 characters. Report mutations share the fail-closed
Redis-backed chat send limiter. Other target types below remain baseline targets.

| Method | Path                                               | Purpose                                                                          | SRS                      |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| POST   | `/me/reports`                                      | `{ targetType: branch\|review\|chat_message\|user, targetId, reason, details? }` | ADM, p.23 report linkage |
| POST   | `/me/support-tickets`                              | `{ subject, category, body, branchId? }`                                         | ADM-009                  |
| GET    | `/me/support-tickets` · `/me/support-tickets/{id}` | My tickets + messages                                                            |                          |
| POST   | `/me/support-tickets/{id}/messages`                | Reply                                                                            |                          |
| GET    | `/me/notifications?cursor=`                        | In-app inbox (`unreadCount` in the response meta)                                | NTF                      |
| POST   | `/me/notifications/read`                           | `{ ids? }` or all                                                                |                          |

### Web checkout integration (Phase 2 continuation, verification pending)

The web detail quote now composes the existing Customer hold/booking and private
evidence APIs. Explicit Owner-sharing consent precedes document submission;
clean upload alone does not mark human verification accepted. Client response
binding requires matching branch and the complete agreed quote except refreshed
quotedAt, and the expected initial booking mode/state. Exact normalized commands
retain retry keys. The backend remains authoritative for scope, eligibility,
current inventory, document provenance/reuse, quote matching and transaction commit.

The auth gate reuses canonical hostel returns for Login and Customer-profile
completion. Transient identity/evidence refresh failures disable writes and retain
drafts; account/branch/quote changes remount private state. Permanent address and
policy-required CNIC stay in component memory and clear after success. No browser
storage or telemetry receives these fields. Current full web verification and real
browser/API-database acceptance remain pending; unit mocks are not integration proof.

### Revised Phase 1 visit domain implementation (2026-10-22)

VISIT-001 / SRS p.23: shared strict request/action/window contracts and a temporal
transition planner are in packages/contracts/src/visits.ts and visit-policy.ts.
Weekly windows use Asia/Karachi, opening-inclusive/closing-exclusive boundaries.
No configured window means no available start; no default slot duration is invented.
Rescheduling retains the requested time until the customer explicitly accepts;
acceptance rechecks the current schedule. Closed states cannot reopen.
This pure planner does not authorize callers. Transactional original-value history,
live actor/object/branch checks, idempotency, persistence, APIs, SDK, clients and
outbox wiring remain required. No visit endpoint is activated by these contracts.

### Revised Phase 1 operational visit source (VISIT-001, 2026-10-22)

Canonical source paths (older unimplemented per-action paths above remain planning
history): GET /public/hostels/{slug}/visit-slots?date=YYYY-MM-DD returns configured
Asia/Karachi windows for that date, without an invented slot duration. POST/GET
/me/visits request/list own visits. POST /me/visits/{visitId}/actions accepts a strict
{ expectedUpdatedAt, command } for cancel or accept-reschedule. Branch equivalents
use /branches/{branchId}/visits and /branches/{branchId}/visits/{visitId}/actions;
assigned Managers/owning Owner may approve, propose reschedule, reject, complete or
mark no-show. Customer action cannot approve itself; management cannot silently
accept the customer's proposed-time decision. All mutations require Idempotency-Key.

GET/PUT /branches/{branchId}/visiting-hours uses content-version preconditions and
explicit non-overlapping weekly windows. No configuration means unavailable.
Current live actor/account/session, Customer or exact branch/child access is checked
inside transactions and before replay. Required history/audit/recipient-free outbox
commit together. Accepted reschedules preserve original times in immutable history;
expectedUpdatedAt prevents accepting a replaced proposal. Read DTOs expose no user
IDs or contacts; public DTOs contain only branch/date/windows.

Production factory registration is explicitly guarded by VISITS_ENABLED=false by
default. Enable only after Phase10 infrastructure acceptance. Offline OpenAPI and
real acceptance fixtures register source for generation/testing, not deployment.
Web/Mobile request, own/branch list/actions and hours editor entry points are
mounted; current-source/final verification remains pending.

### Visit history and post-visit response source (VISIT-001)

GET /me/visits/{visitId}/history and its branch equivalent return bounded immutable
snapshots, readable branch/customer names and no account/actor IDs or contacts.
Exact live customer or branch/child checks precede reads. Both clients mount a lazy
history view; failed access revalidation hides cached private facts.

GET /me/visits/{visitId}/interest and its branch equivalent expose only a completed
visit's current explicit response. Only POST /me/visits/{visitId}/interest writes:
{ expectedUpdatedAt, stillInterested }. It requires an idempotency key, own Customer
scope, completed status and a fresh reviewed version. Each response is historical;
a monotonic visit version orders it independently of process clocks. Staff can
read, not impersonate the Customer. Both clients mount this on completed visits.

The enabled worker schedules a daily bounded follow-up sweep. A recipient-free
source event and one-shot marker commit together. Already answered visits receive
no prompt; fanout suppresses an answer received before delivery. At most one prompt
per completed visit; no auto-booking or booking-state change. VISITS_ENABLED is false
by default in both API and worker until Phase10 acceptance. Generated0037/0038 are
source only; migration execution and all real scenarios are deferred to Phase10.
Current-source verification is pending; no production acceptance is claimed.

### Private visit list labels and reschedule conflicts (VISIT-001)

Own and authorized branch list entries add required branchName/customerName to
the existing minimal visit summary. They are sourced in the scoped paged query;
account IDs, contact details and decision actor IDs remain excluded. Public
slots and mutation responses do not include names. Accepting a proposal that
collides with another active own visit returns409 without state/history/outbox
writes; the database active-time uniqueness constraint remains authoritative.

## Upfront payment verification (BKG-005..010, SRS v2.11, ADR 0071)

| Method   | Path                                                            | Purpose                                                                                                    |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST     | `/branches/{b}/bookings/{id}/approve`                           | booking_manage: approve an upfront request; payment is requested (not confirmed)                           |
| GET      | `/me/bookings/{id}/payment-instructions`                        | Own approved upfront booking only: where to pay the hostel directly                                        |
| POST     | `/me/bookings/{id}/payment-proofs`                              | Own clean `payment_proof`, exact captured amount, paid date, optional reference (Idempotency-Key)          |
| POST     | `/branches/{b}/bookings/{id}/payment-proofs/{proofId}/review`   | Owner or Manager with booking_manage+payment_record+finance_view: approve (confirms) or reject with reason |
| GET      | `/branches/{b}/bookings/{id}/payment-proofs/{proofId}/download` | Same reviewers; short-lived link, sensitive-access audited                                                 |
| GET/POST | `/branches/{b}/payment-instructions`, `…/{id}/archive`          | Read with booking_manage; Owner adds/archives                                                              |
| GET/PUT  | `/branches/{b}/upfront-settings`                                | Owner sets `requirement` and `proofRetryAllowed` for future requests                                       |

Booking responses carry `upfront: null | {requirement, amountPaisa, status, approvedAt, proof}`
with status `awaiting_approval → awaiting_payment → verification_pending → verified`.
State stays `pending_request` until the approving review confirms it.
