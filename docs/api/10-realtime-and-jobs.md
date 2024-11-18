# API 10: Realtime Events, Background Jobs & Notifications

Phase3 visit activation (2026-10-24; VISIT-001 / NTF-002): the API and worker now
default visits enabled, with an explicit `VISITS_ENABLED=false` disable switch.
The existing daily follow-up scheduler and bounded continuation drain completed,
unanswered visits once. Real Redis/PostgreSQL restart/retry delivers one prompt
to the source Customer; an answer after fanout suppresses final inbox publication.
These checks pass2/2 in `.tools/phase3-visits-worker-integration.log`. Earlier
default-false/Phase10 notes below are historical and superseded by this activation.

## Phase 3 waiting-list delivery (2026-10-24; WAIT-001 / NTF-002)

VISIT-001 reminder correction: final `notification.create` publication of
`visit.follow_up` resolves the immutable completion history again, takes the same
inventory hierarchy lock as the explicit response writer, and rechecks whether
the customer has answered. A response after fanout suppresses the still-queued
prompt. Only the source customer can receive it. A missing source fails closed;
processed stale prompts are acknowledged without an inbox insert. This supplements
the existing before-fanout suppression and retains the one-shot marker/history.

The normal worker registers a separate `waitlist-reconcile` BullMQ job every60s,
draining bounded100-preference batches from the existing authoritative inventory
sweep. It cannot block ordinary outbox dispatch. A false-to-true observation
produces an immutable vacancy event/page and recipient-free `waitlist.lifecycle`
outbox record. Joining a list never creates a claim or payment.

The notification service validates the current lease and immutable page/event,
locks the inventory hierarchy and refreshes operational availability. Each page
fans out at most100 eligible entries and atomically schedules its next page with
lease acknowledgement. Match the exact branch/room preference, active account,
unleft entry and original event cutoff. Event/customer deduplication prevents
multiple alerts when a customer has overlapping preferences. Late joins do not
receive historical events. Current observations suppress superseded events.

Final inbox publication independently repeats source/subscription/availability
checks, so leaving or losing availability after fanout suppresses queued alerts.
Lease expiry during hierarchy waits or inserts aborts publication. Recoverable
failures retain normal outbox retry; source errors remain sanitized. Notices
contain no private contact/identity data and explicitly promise no reservation,
guaranteed availability or payment. No external email/SMS delivery is claimed.

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Rules: NTF-*, BKG-010, RENT-001, COLL-002, SEC-001, p.48 failure behaviour.

## 1. WebSocket (Socket.IO)

- Phase 3 chat runtime: Socket.IO path `/v1/rt`, native access token in handshake
  `auth.token`; browser authentication uses the exact environment's HttpOnly access
  cookie. Duplicate cookies or simultaneous cookie/token credentials fail closed.
  Browser polling uses the same-origin `/api/v1/rt` proxy; native clients use
  WebSocket. Credentials never enter query strings. Allowlisted Origin checks and
  a fail-closed, Redis-backed HMAC connection counter protect the handshake.
- `conversation.join` takes `{conversationId, branchId?}`; branch staff must supply
  their current branch. Each join, event delivery and five-second session/scope
  probe rechecks the live session and exact participant authority. Unauthorized
  sockets disconnect. Token-expiry fallback detection is bounded by the probe interval.
- Additive migration0045 emits committed PostgreSQL authority notifications for
  session revocation/expiry changes, account status, Manager status/branch changes
  and hierarchy archival/ownership changes. Each replica keeps one dedicated
  Drizzle LISTEN connection. User/session events immediately disconnect matching
  sockets; hierarchy events conservatively disconnect active staff selections.
  Rollback emits no event. Listener loss immediately disconnects all sockets and
  denies handshakes until LISTEN recovers. Events contain only scope identifiers.
  REST and before-emit authorization remain mandatory. See ADR0067 for connection
  requirements and the source-validated Redis distribution decision.
- Source-bound `chat.lifecycle` fanout atomically enqueues one deduplicated
  `chat.realtime` internal job. The worker publishes persisted undeleted message
  IDs/timestamps through Redis before acknowledging its lease. Failure rolls back
  acknowledgement; retries may repeat an invalidation, never append a second
  message. Every API replica verifies source and recipient scope before emitting.
- Implemented event: `chat.message.created` with exactly
  `{conversationId, messageId, createdAt}`. Clients refetch authorized REST history.
  `chat.refresh` carries no payload and requests reconciliation after Redis recovery.
  Reconnect joins again and refetches durable history; signed file access stays REST.
- The following broader room/event matrix is the v1 target; unlisted event paths
  below are not established as operational by this chat milestone.
- **Rooms** (the server joins the client after an authorisation check; the client cannot join arbitrary rooms):

| Room                            | Joined when                                                                    | Re-checked                          |
| ------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `user:{userId}`                 | On connect                                                                     | n/a                                 |
| `conversation:{conversationId}` | Client emits `conversation.join`; the server verifies participant/branch scope | On every join                       |
| `branch:{branchId}`             | Client emits `branch.join`; the server verifies owner or active manager        | Every 60 s and on assignment change |

- Manager suspended or fired, or a session revoked → the server **force-disconnects** that user's sockets immediately (MGR-004, p.37).
- Events carry **ids and minimal data**. Clients refetch details over REST, which re-runs authorisation. Payloads never contain another branch's data (NTF-003).

| Event (server → client)  | Room                     | Payload                                                           |
| ------------------------ | ------------------------ | ----------------------------------------------------------------- |
| `chat.message.created`   | conversation             | `{ conversationId, messageId, senderSide, createdAt }`            |
| `chat.read`              | conversation             | `{ conversationId, userId, lastReadAt }`                          |
| `bedboard.seat.updated`  | branch                   | `{ seatId, state }`                                               |
| `queue.counts.updated`   | branch                   | `{ pendingBookings, pendingProofs, openComplaints, unreadChats }` |
| `booking.status.changed` | user (customer) + branch | `{ bookingId, status }`                                           |
| `proof.status.changed`   | user (resident) + branch | `{ proofId, invoiceId, status }`                                  |
| `notification.created`   | user                     | `{ notificationId, type }`                                        |
| `session.revoked`        | user                     | `{ reason }`, then disconnect                                     |

Client → server: `conversation.join`, `conversation.leave`, `branch.join`, `branch.leave`, `typing` (throttled). Messages are **sent via REST**, not the socket, so they get validation, rate limits and idempotency.

## 2. Background jobs (BullMQ, `apps/worker`)

| Queue / job              | Schedule                                | Does                                                                                                                                                                                                 | SRS                  |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `reservation-expiry`     | Every minute                            | Expire `approved`/`payment_pending` offers past `offerExpiresAt`: reservation released, seat → available, history row with the rule used, notifications                                              | BKG-010, p.22        |
| `invoice-generation`     | Daily 00:30 PKT                         | For each branch whose cycle starts, create monthly invoices for every active stay (unique per stay+month, so re-runs are safe). Adds transport items and active discounts                            | RENT-001, p.26       |
| `rent-status`            | Daily 00:45 PKT                         | Apply automatic late fees after grace (if configured), mark overdue for the Rent Board, notify                                                                                                       | FIN-002, RB-002      |
| `rent-reminders`         | Daily 10:00 PKT                         | Upcoming due (3 days before), due today, grace ending: **unpaid only**                                                                                                                               | COLL-001/002         |
| `notification-delivery`  | Continuous                              | Drain `notification_outbox` → in-app / email (Hostinger SMTP) / push. Retries with backoff; `dead` after N tries; stores the provider response. Never reports delivery without provider confirmation | NTF-001, p.31        |
| `pdf-render`             | On demand                               | Receipts, checkout statements, report exports → private files                                                                                                                                        | p.28, RPT-001        |
| `file-scan`              | On upload complete                      | Magic-byte/type check, image re-encode + EXIF strip for public photos, malware scan hook                                                                                                             | p.23, SEC            |
| `waitlist-alerts`        | On `seat.became_available`              | Notify active waitlist entries for that branch/room type (no auto-booking)                                                                                                                           | p.23                 |
| `visit-follow-up`        | Daily                                   | One "still interested?" prompt after completed visits                                                                                                                                                | VISIT-001            |
| `review-eligibility`     | Daily                                   | Notify residents reaching 30 days                                                                                                                                                                    | REV-002              |
| `rating-aggregation`     | On review change                        | Recompute the branch rating (excluding hidden/removed)                                                                                                                                               | p.35                 |
| `marketplace-refresh`    | On seat/price/photo/verification change | Refresh the marketplace read model if materialised                                                                                                                                                   | SEAT-003             |
| `announcement-dispatch`  | Every minute                            | Send due scheduled announcements                                                                                                                                                                     | ADM-010              |
| `seat-consistency-check` | Nightly                                 | Report seats whose `state` disagrees with assignments/reservations (alert; never auto-fix silently)                                                                                                  | p.19 occupancy truth |
| `cleanup`                | Nightly                                 | Purge expired OTPs, idempotency keys > 24 h, expired export files, revoked sessions > 30 d                                                                                                           | SEC                  |

All jobs are **idempotent** and safe to retry. Domain state is committed before notifications are queued (outbox), so a failed email never rolls back a booking or payment (p.48).

## 3. Domain events → notifications (NTF)

| Domain event                                                           | Customer / Resident gets               | Owner / Manager gets                                     |
| ---------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `booking.submitted`                                                    | Confirmation                           | New booking request                                      |
| `booking.approved` / `rejected` / `expired` / `confirmed`              | Status + reason / payment instructions | —                                                        |
| `booking.offer_expiring`                                               | Expiry warning                         | —                                                        |
| `visit.requested` / `approved` / `rescheduled` / `rejected`            | Visit status                           | New visit request                                        |
| `chat.message.created`                                                 | New message (if offline)               | New chat (if offline)                                    |
| `waitlist.seat_available`                                              | Availability alert                     | —                                                        |
| `invoice.issued` / `rent.due_soon` / `rent.due_today` / `rent.overdue` | Rent reminders                         | —                                                        |
| `proof.submitted`                                                      | "Pending verification"                 | Payment proof to review                                  |
| `proof.approved` + `receipt.issued` / `proof.rejected`                 | Receipt / reason                       | —                                                        |
| `complaint.created` / `reopened`                                       | —                                      | New / reopened complaint                                 |
| `complaint.status_changed`                                             | Complaint update                       | —                                                        |
| `checkout.requested`                                                   | Confirmation                           | Checkout request                                         |
| `checkout.completed` / `deposit.refunded`                              | Final statement / refund               | —                                                        |
| `review.created`                                                       | —                                      | New review                                               |
| `verification.decided`                                                 | —                                      | Approved / changes requested / rejected + reason (owner) |
| `manager.appointed`                                                    | —                                      | — (credential shared by the owner directly)              |
| `support.replied`                                                      | Support reply                          | Support reply                                            |
| `announcement.sent`                                                    | If in the audience                     | If in the audience                                       |

Channels: **in-app always**; **email** for account/security, booking decisions, rent, receipts, verification; **push** for time-sensitive items (mobile). Transactional categories cannot be disabled (NTF-002). Deep links point only to resources the recipient may access (p.43).

## In-app notification foundation continuation (verification pending)

NTF-002/003: @hsm/notifications adds a transaction-only producer, fixed security
notices, strict ID/event jobs and atomic in-app publication (ADR 0012). The existing
BullMQ dispatcher, leases, retries and dead letters are reused. Publication rechecks
recipient/payload and refreshes expiry after row locking; notification insert and
acknowledgement commit together. Email verification and password reset/change enqueue
notices in their existing identity transactions. Notice content contains no identity
or credentials, and has no arbitrary/dead resource links. Transactional notices are
not subject to promotional preferences. No later domain schedules are added.

Shared-package LOCAL PASS: nine focused Turbo tasks, 36 tests, 100% business code
line/branch/function coverage. Full LOCAL PASS: 35 Turbo tasks, 599 tests; API 100% lines / 99.49% branches,
worker and notification business code 100% lines/branches/functions.
Frozen install, formatting, production audit and migration generation drift pass.
Five new mandatory PostgreSQL Testcontainers tests and added compiled API/worker
in-app assertions are NOT RUN LOCALLY. CI PASS: 3a72d4c, run 37806675279,
all four jobs; 85 real integrations, zero skipped. All five new notification
transactions and compiled account/worker in-app assertions passed. Task 9 COMPLETE. Existing
email/file/auth integration assertions remain. Inbox HTTP/client screens are later
work and are not claimed by this producer/delivery foundation.

### Phase 2 booking lifecycle (ADR-0030)

BKG-001/BKG-009/NTF-002: booking creation, confirmation, rejection, cancellation
and expiry enqueue a private lifecycle event in the same database transaction as
the state/history change. The existing worker validates the persisted event and
history, resolves recipients, then atomically queues ordinary inbox deliveries.
Customers receive their own lifecycle updates; Owners receive a generic
new-booking notice. Source events contain only the booking identifier and closed
event name. Rendered notices omit document contents, cancellation reasons,
payment claims and occupant identity. Duplicate consumption is idempotent.

A lifecycle event marked sent means recipient deliveries were queued; unread
counts change only when inbox rows are actually persisted. Lease expiry during
recipient FK waiting rolls back fanout and acknowledgement together. See
[ADR-0030](../adr/0030-booking-lifecycle-outbox.md). No new queue platform,
transactional email channel or authorization bypass is introduced.

### Phase 3 scheduled billing foundation (ADR0048; not enabled)

The private resident.billing.period envelope is strict scheduleId/version/periodIndex
only. Canonical deduplication binds that persisted identity; amounts, actors,
receipts, due dates, Paid and leases cannot be injected through the body.
Scoped schedule/execution metadata and custom history/live-lease/completion guards
are authored in additive0029/0030. Completion binds system audit, acknowledgement
and schedule progress atomically; advancing a cursor also requires its exact
completed execution. Human resume/stop/supersession cannot skip an unbilled period.
No production producer enqueues this event and no billing handler is registered.
Mandatory human charge/invoice actors remain unchanged. Actual system source
provenance, shared posting extension, authorized scheduling and registered worker
processing remain pending. Complete DB units208/8 and local static/drift gates
pass at the preceding checkpoint; the progress-proof extension needs its static
follow-on. Three actual PostgreSQL suites (52 cases) are authored, NOT RUN LOCALLY.
This is not billing delivery, migration SQL execution or CI PASS. Existing
notification/file/booking delivery registrations retain their prior behavior.

2026-10-20 final52-case follow-on: normal dependency-aware DB lint/strict source
and test typecheck/build LOCAL PASS8/8,1m52s, baseline28 DB warnings and no new
warning. Complete DB units208/8 retain100% coverage across seven configured
production modules. Canonical0029/0030 table snapshots match and chain correctly;
JSON property order alone differs. Real SQL,52 Testcontainers cases, replay/seed
and actual worker delivery remain NOT RUN LOCALLY / NOT VERIFIED. No system
financial origin or billing worker is enabled, and no Phase3 or CI PASS is claimed.

2026-10-20 guard-first follow-on verification: initial static FAILED5/8 at
lint because a SQL constraint-name string triggered the entropy scanner and
a scope callback gained a size warning. Normal SQL parameters and a separate
scope-definition helper resolve both without suppressions. Retry LOCAL PASS8/8,
5m55s, baseline28 warnings/no new warning. Complete DB units LOCAL PASS208/8,
100% across seven configured modules,1m47s. Drizzle drift reports no schema
changes (10.4s);33 entries and both new snapshots preserve mandatory human
actors. New eight real cases/current60 total remain NOT RUN LOCALLY.
A separate guarded source transition proposal awaits explicit user approval;
no nullability change, scheduled posting, deployment or CI PASS is claimed.

### 2026-10-20 approved guarded source transition (AUD-004 / FIN-002)

User explicitly approved source implementation with no deployment. Generated0033 follows0031/0032 proof guards and changes only charge/invoice human actor nullability, preserving their foreign keys and all adjustment/fund actor requirements. Shared persistence validates exclusive human/system scope and records exact immutable origins for new system sources only; recovery/zero cannot invent provenance. Human rent/fee commands still require the real actor. Eleven new units and eight additional real PostgreSQL cases are authored; verification is pending. Current real billing foundation68 cases/five suites is NOT RUN LOCALLY. No migration application, registered worker, enabled admission/financial route, infrastructure acceptance or CI PASS is claimed. Earlier pending-approval statements are historical and superseded by the explicit approval, not by inferred verification.

Guarded transition verification: first static FAILED7/8 at three Money fixture types; corrected through the existing money(bigint) constructor. Final normal DB static LOCAL PASS8/8,1m35s,28 baseline warnings/no new warning. Complete DB units LOCAL PASS219/9,100% L/S/F/B across seven configured modules,1m08s. Drizzle drift LOCAL PASS (no schema changes),10.2s,34 sequential migrations; exact snapshot comparison changes only the two approved notNull flags and retains mandatory adjustment/fund actors. All68 real billing foundation cases/five suites and migration SQL execution/replay remain NOT RUN LOCALLY; exact-source CI NOT VERIFIED. Unit coverage is not SQL/runtime proof.

2026-10-20 item-binding review follow-on: a ninth real system-origin regression is authored for a rent schedule attempting to prove a mess charge. Custom Drizzle0034_billing_origin_item_guard preserves prior completion proof and additionally requires charge kind to equal the scoped authorized schedule item. No schema fields change; prior migrations remain intact. The preceding0033 source checks remain recorded; final0034 static/unit/drift verification is running. All69 real billing-foundation cases/five suites remain NOT RUN LOCALLY. No PostgreSQL reproduction or SQL PASS, producer, deployment or CI PASS is inferred. Complete unchanged API1710/165 now passes all configured coverage gates.

Final0034 source verification LOCAL PASS: normal DB static8/8,1m54s,28 baseline DB warnings/no new warning; complete DB units219/9,100% L/S/F/B across seven configured modules,1m12s; no schema drift10.9s,35 sequential migrations and unchanged custom-migration schema snapshot. Current complete API1710/165 and Web763/89 pass configured local gates. All69 real billing-foundation cases/five suites, SQL execution/replay/seed and exact-source CI remain NOT RUN LOCALLY / NOT VERIFIED. No deployment, applied migration, registered billing worker or admission/financial route is enabled.

### Revised Phase 1 visit lifecycle source (2026-10-22)

VISIT-001 / NTF-002: visit.lifecycle is a recipient-free in_app outbox event with
strict { event: visit.changed, visitId, historyId }. It is written atomically with
visit history. Existing worker delivery dispatches in_app events to the shared
notification service. Visit fanout validates the exact immutable history/visit
relationship, resolves its customer, owning Owner and current assigned Managers,
deduplicates/sorts recipients, checks the actual delivery lease after waits, and
acknowledges with recipient jobs in one transaction. No inventory locks are taken
by fanout. Unknown/malformed jobs fail closed. Generic notices disclose no visit
identity or message contents. Full worker/restart/redelivery acceptance is deferred
to Phase10; no actual delivery PASS is claimed from authored source.

Historical visit follow-up source checkpoint (superseded by the Phase3 acceptance
entries above; retained for planning history): enabled worker adds
one daily visit-follow-up scheduler and immediate continuation for full100 batches.
The completed/unprompted selection excludes existing answers and rechecks under
hierarchy/visit locks. Completion history proves each event; marker/event commit
together. Fanout sends visit.follow_up only to the visit customer and suppresses
an already-recorded answer before publication. Source lease event type must match
the actual stored payload. No repeat prompt, auto-booking, recipient identity in
the source outbox payload, or booking/Stay/financial mutation. Default worker/API
VISITS_ENABLED=false; real delivery/lease/restart/concurrency verification Phase10.
