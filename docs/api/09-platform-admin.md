# API 09: Platform Administration (`/admin`)

2026-10-30 governed extensions (HMA-015): institution POST/PUT require changeReason
(8–500 characters); PUT requires expectedRevision. Material approved name/alias/location
edits require reapprove=true or publicApproved=false; conflicts return 409 and require
reloading details. Root-only GET /admin/institutions/:placeId/history returns bounded,
allowlisted before/after fields, revisions, reason, actor and timestamp; legacy missing
history remains explicitly unavailable. Existing audit storage provides durable history.
GET /admin/customers and POST /admin/customers/:userId/decisions require content_moderator
or Root. Decisions require action, reason, expectedStatus and expectedUpdatedAt; writes
are idempotent and audited. Admin-linked, Owner and active Manager targets are excluded.
Suspend/ban revoke sessions; reinstatement never restores old sessions. No private contact,
identity documents or raw audit payload is returned. Identity/photo review endpoints below
remain design baseline, not implemented acceptance; durable review schema needs approval.

## Completion addendum (2026-10-30; CHG020)

Verification GET /verifications/:branchId exposes masked current dossier; /history,
/pricing and /photos are bounded. /submissions compares persisted latest/last-approved
evidence with explicit legacy absence; /submissions/:submissionId/items pages typed
price/photo records. POST /evidence/:fileId/access requires purpose, exact current
attachment, clean private file and transactional sensitive audit. Existing decision
POST optionally binds expectedStatus/expectedUpdatedAt; Owner notice/event commit
atomically. History sorts decision time then UUID. Moderation GET /moderation/reports
filters status; /reviews discovers hidden/removed items, /reviews/:id and /history
return safe metadata. Staff/participant support-ticket /:id/messages page all messages;
participant notes excluded before pagination. Staff queue adds literal q/priority.
Legacy detail.messages is a preview, not complete history. Migration0062 is not applied
to development pending separate approval.

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Rules: ADM-_, TRUST-_, GEO-002/003, AUD-001, p.41–42. Every write goes to `platform_audit_log` with reason, actor and timestamps.

**Boundaries:**

- Admins never edit hostel rooms, rent or deposits (ADM-008).
- No impersonation (ADM-005).
- No resident rent approval (p.49).
- Private chat is accessible only through an authorised report flow (COMM-002).
- Subscriptions/billing endpoints are **deferred** (CHG-003).

## Admin accounts (`ROOT`)

| Method | Path                                                             | Purpose                                                                                                               | SRS                         |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| GET    | `/admin/admins`                                                  | Admins, roles, status                                                                                                 | ADM-004                     |
| POST   | `/admin/admins`                                                  | Invite `{ email, fullName, roles: [verification\|support\|moderator], isRoot? }`. A 4th root → `409 ROOT_ADMIN_LIMIT` | ADM-001..003, p.41 root cap |
| PUT    | `/admin/admins/{userId}/roles`                                   | Replace roles (no "all access" role exists)                                                                           | ADM-003                     |
| POST   | `/admin/admins/{userId}/suspend` · `/reactivate` · `/deactivate` | `{ reason }`. Removing the last root → `409 LAST_ROOT_ADMIN`                                                          | ADM-004, p.41               |

Normal admins calling these → `403` (ADM-001). Root authority comes only from an authenticated account + role. A phone number never grants it (ADM-002).

## Listing verification (`ADMIN:verification`)

| Method | Path                                                                             | Purpose                                                                                                                                                                  | SRS                            |
| ------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| GET    | `/admin/verifications?status=submitted\|under_review\|changes_requested&cityId=` | Review queue                                                                                                                                                             | ONB, TRUST-001                 |
| GET    | `/admin/verifications/{verificationId}`                                          | Submitted snapshot, **diff vs the last approved version**, owner identity (CNIC access logged), documents (signed URLs), photos, pricing, deposit, internal completeness | TRUST-002/004, p.15 reapproval |
| POST   | `…/{verificationId}/start-review`                                                | → `under_review`                                                                                                                                                         |                                |
| POST   | `…/{verificationId}/approve`                                                     | → branch `approved` + Verified badge + public                                                                                                                            | TRUST-001                      |
| POST   | `…/{verificationId}/request-changes`                                             | `{ reasons: [ { field, message } ] }`                                                                                                                                    | ONB-002                        |
| POST   | `…/{verificationId}/reject`                                                      | `{ reason }`                                                                                                                                                             | ONB-002                        |
| POST   | `/admin/branches/{branchId}/suspend-listing`                                     | `{ reason, reportId? }`. Listing private; internal data untouched                                                                                                        | p.15 suspension, ADM-007       |
| POST   | `/admin/branches/{branchId}/hide` · `/restore`                                   | Temporary safety hide / restore                                                                                                                                          | ADM-007                        |
| GET    | `/admin/branches?q=&status=`                                                     | Branch directory (aggregate data only; no resident identities)                                                                                                           | p.45                           |

## Content moderation (`ADMIN:moderator`)

| Method | Path                                                      | Purpose                                                                      | SRS       |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| GET    | `/admin/photos?status=pending`                            | Photo moderation queue                                                       | TRUST-003 |
| POST   | `/admin/photos/{photoId}/approve` · `/reject`             | `{ reason }` on reject (request a replacement)                               | TRUST-003 |
| GET    | `/admin/reviews?reported=true`                            | Reported reviews                                                             | REV-006   |
| POST   | `/admin/reviews/{reviewId}/hide` · `/remove` · `/restore` | `{ reason }`: **policy violations only**, never because a review is negative | REV-006   |

## Reports & safety (`ADMIN:moderator` or `ADMIN:support`)

Phase3 implemented chat safety (COMM-002 / AUD-002, 2026-10-24): active Root,
support or content_moderator accounts may page chat case metadata through
`GET /admin/reports?targetType=chat_message&status=&cursor=&limit=`. Normal private
conversation routes still deny admin access. `POST /admin/reports/{reportId}/chat-context`
requires a nonblank justification up to1000 characters and returns only the
reported message plus at most two immediate neighbors on each side. Deleted
neighbors are suppressed without widening the window. The reported immutable
source is retained as case evidence even after participant removal. File IDs,
signed URLs, participant account IDs and contact details are absent from context.

Each context request rechecks current account/session/role and locks the case,
then writes sensitive_access_log for every disclosed sender plus a platform audit
containing case/message references. Audit failure rolls back the entire read and
returns no context. Context reads have no replay cache or automatic client retry;
every explicit access is audited. Verification-only accounts cannot enter the
case browser. Case queue/read are mounted in the management Web Admin space;
the assignment/resolution routes below remain baseline targets, not implemented
by this chat safety milestone.

| Method | Path                                     | Purpose                                                                                                | SRS                           |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- |
| GET    | `/admin/reports?status=&targetType=`     | User reports queue                                                                                     | p.42                          |
| GET    | `/admin/reports/{reportId}`              | Report + target summary                                                                                |                               |
| POST   | `/admin/reports/{reportId}/assign`       | `{ adminUserId }`                                                                                      |                               |
| POST   | `/admin/reports/{reportId}/chat-context` | `{ justification }` → only the **reported message ± a small window**, logged in `sensitive_access_log` | COMM-002, p.23 report linkage |
| POST   | `/admin/reports/{reportId}/resolve`      | `{ outcome: actioned\|dismissed, resolution, actions?: [...] }`                                        | p.42 moderation evidence      |

## Users (`ADMIN:support`, actions `ADMIN:moderator`)

| Method | Path                                                                 | Purpose                                                     | SRS                    |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| GET    | `/admin/users?q=`                                                    | Search (masked CNIC; full only for root with justification) | p.45 privacy           |
| GET    | `/admin/users/{userId}`                                              | Account status, roles, reports, tickets (no rent data)      |                        |
| POST   | `/admin/users/{userId}/warn` · `/suspend` · `/ban` · `/reinstate`    | `{ reason, reportId? }`. Suspension revokes sessions        | p.42 customer accounts |
| GET    | `/admin/identity-change-requests` · POST `/{id}/approve` · `/reject` | Controlled CNIC/name corrections                            | p.8 profile correction |

## Support (`ADMIN:support`)

| Method | Path                                       | Purpose                                        | SRS     |
| ------ | ------------------------------------------ | ---------------------------------------------- | ------- |
| GET    | `/admin/support-tickets?status=&priority=` | Queue                                          | ADM-009 |
| GET    | `/admin/support-tickets/{id}`              | Thread                                         |         |
| POST   | `/admin/support-tickets/{id}/messages`     | `{ body, isInternalNote }`                     |         |
| PATCH  | `/admin/support-tickets/{id}`              | `{ status?, priority?, assignedAdminUserId? }` | ADM-009 |

## Geography & reference data (`ROOT` or `ADMIN:verification`)

| Method              | Path                      | Purpose                                          | SRS     |
| ------------------- | ------------------------- | ------------------------------------------------ | ------- |
| GET / POST / PATCH  | `/admin/cities[/{id}]`    |                                                  | GEO-001 |
| GET / POST / PATCH  | `/admin/areas[/{id}]`     | Parent must be in the same city (p.12 hierarchy) | GEO-002 |
| GET / POST / PATCH  | `/admin/places[/{id}]`    | Universities / offices / hubs with coordinates   | GEO-003 |
| GET / POST / DELETE | `/admin/aliases[/{id}]`   | Search aliases                                   | p.12    |
| GET / POST / PATCH  | `/admin/amenities[/{id}]` | Amenity master list                              | ROOT    |

## Announcements (`ROOT` or `ADMIN:support`)

| Method                | Path                        | Purpose                                                                                                     | SRS     |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| GET / POST            | `/admin/announcements`      | `{ audience: all_managers\|selected_branches\|customers\|city, audienceFilter, title, body, scheduledAt? }` | ADM-010 |
| PATCH / POST …/cancel | `/admin/announcements/{id}` | Before it is sent                                                                                           |         |

## Metrics & audit

| Method | Path                                                            | Scope              | Purpose                                                                                    | SRS         |
| ------ | --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ----------- |
| GET    | `/admin/metrics/marketplace?from=&to=`                          | ROOT               | Funnel: searches → views → chat/visit → booking → approval → confirmed → check-in          | RPT-003     |
| GET    | `/admin/metrics/operations?from=&to=`                           | ROOT               | Response times, expired requests, setup completion, rent-tracking use, occupancy freshness | RPT-003/004 |
| GET    | `/admin/owner-performance?flag=slow_response\|expired_requests` | ROOT, verification | Owner performance warnings                                                                 | RPT-004     |
| GET    | `/admin/audit-log?actor=&action=&from=&to=`                     | ROOT               | Platform audit log (append-only)                                                           | AUD-001     |

ADM-010 / AUD-008 runtime: delivery resolves the complete live eligible audience in distinct user UUID pages of500 under a repeatable-read transaction. Notice inserts, recipientCount and outbox acknowledgement commit atomically; an interruption rolls back every batch and normal retry restarts safely. Existing cancellation, audience scope, administrative authority and in-app-only behavior remain. Sent means internal notice dispatch, not external provider delivery. No schema migration or automatic replay of previously sent announcements. See ADR0080.

## Native Admin Phase 1/2 runtime (2026-10-29; ADM-001..004 / SEC-001/003)

GET /v1/admin/admins is Root-only on every page. Query: cursor = canonical Admin user UUID,
limit = 1..100 (default50); ascending unique userId keyset order with a limit+1 sentinel.
Response retains data and adds nextCursor (null at end), totalCount and activeRootCount.
Summaries cover the full Admin set rather than only a loaded page. Concurrent insertions behind
a cursor require Refresh; this is keyset traversal, not a historical snapshot.
GET /v1/admin/admins/{userId} is a Root-only detail read with the same minimal account DTO.
No credentials or phone identity values are returned by these readers.

Existing POST /v1/admin/admins remains email-based invitation of an existing active identity;
roles are verification/support/content_moderator, self-acceptance required.
Phone-based invitations are not added: an unverified contact identifier is insufficient ownership evidence.
POST /v1/admin/admins/{userId}/changes retains its original Root locking, cap, idempotency and audit.
No schema migration or new authorization policy; CHG-005 parity and ADM rules are unchanged.
Native app and current Web consumer use bounded continuation; regenerate/reload clients together
because older strict response parsers may reject additive response fields.

### HMA-015 controlled profile reviews — 2026-10-31

Default-off PROFILE_REVIEWS_ENABLED gates /v1/admin/profile-reviews/{kind} and /v1/me/profile-reviews/{kind}. Metadata queues and version-paged history; POST access/file-access requires audited justification; reasoned versioned decisions/cancel are idempotent. Root-only identity; Root/content_moderator photo; Admin-linked/self-review denied. Legacy current-photo subject discovery/intake is metadata-only until private access. See docs/srs/SRS-v2.18-profile-reviews.md (CHG-022).

### HMA-017 Root explorer — CHG-023 / SRS v2.19

GET /admin/explorer/summary supplies real directory counts. GET
/admin/explorer/{kind} supports q, status, period(month/quarter/year/lifetime),
sort(newest/oldest/name_asc/name_desc), parentId/ownerId/managerId where applicable,
cursor and limit(max50). Returns bounded metadata rows, filter-aware cohorts, status
facets, totalCount and aggregate quantities/integer-paisa strings where applicable.
GET /admin/explorer/{kind}/{id} audits the profile read and returns restricted facts,
relationship links and existing permitted-action identifiers. Kinds: users, owners,
managers, hostels(brands), branches, bookings, complaints, occupancy, payments.
Every endpoint rechecks live Root authority transactionally; no public/private row
reuse. Detailed privacy and aggregate semantics: SRS-v2.19-admin-explorer.md.
Existing /admin/customers additionally accepts an optional exact userId filter,
retaining the original customer-enforcement eligibility and state checks.

HMA-017: Root explorer branches status=pending combines submitted, under_review
and changes_requested before statistics, keyset pagination and counting. Other
status filters remain exact. No new mutation or permission grant.
