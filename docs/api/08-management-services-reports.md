# API 08: Services, Complaints, Reviews, Dashboards & Reports

Conventions: [`../07-api-contract.md`](../07-api-contract.md). Scope `BRANCH` unless marked. Rules: SERV-_, CMP-_, REV-_, OWN-_, MGRD-_, RPT-_, AUD-*.

## Mess / menu

| Method | Path                                                        | Purpose                                                                                         | SRS      |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| GET    | `/manage/branches/{branchId}/menu`                          | Weekly menu (7 days × breakfast/lunch/dinner)                                                   | SERV-001 |
| PUT    | `/manage/branches/{branchId}/menu`                          | Replace the whole week `{ days: [ { dayOfWeek, meals: { breakfast, lunch, dinner } } ] }`. ETag | p.32     |
| PUT    | `/manage/branches/{branchId}/menu/{dayOfWeek}/{meal}/photo` | `{ fileId \| null }` optional dish photo                                                        | p.32     |

## Transport

| Method     | Path                                                                             | Purpose                                                                                        |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET / POST | `/v1/branches/{branchId}/transport/routes`                                       | List branch routes or create a private draft or active route.                                  |
| PUT        | `/v1/branches/{branchId}/transport/routes/{routeId}`                             | Version-checked edit, publish or inactivate. Live riders protect against incompatible changes. |
| GET        | `/v1/branches/{branchId}/transport/overview`                                     | Live branch counts. Monthly subscription amounts require finance access.                       |
| GET        | `/v1/branches/{branchId}/transport/subscriptions`                                | Finance-authorized, paged rider queue with optional status filter.                             |
| POST       | `/v1/branches/{branchId}/transport/subscriptions/{subscriptionId}/decision`      | Approve, reject or end with the applicable effective date and version.                         |
| GET        | `/v1/public/branches/{branchId}/transport/routes`                                | Complete active routes on an eligible public branch.                                           |
| GET        | `/v1/me/stays/{stayId}/transport/routes`                                         | Own operational Stay routes with captured inclusion status.                                    |
| GET / POST | `/v1/me/stays/{stayId}/transport/subscriptions`                                  | Page own subscriptions or request a separate-fee route at the disclosed amount.                |
| POST       | `/v1/me/stays/{stayId}/transport/subscriptions/{subscriptionId}/{withdraw\|end}` | Withdraw a pending request or ask to stop.                                                     |

The route contract supports typed destinations, pickup/drop-off stops and weekly trips with effective dates. Public and resident route lists include the single branch offer. The resident confirms only `monthlyChargePaisa` when requesting a subscription. A legacy `routeId` is accepted as a scoped reference. It cannot select a separate fee or create another subscription. Paid writes use the existing fee lifecycle and require idempotency keys. Accepted booking quotes can carry the included routes. See [SRS v2.30](../srs/SRS-v2.30-transport-operations.md).

## Complaints

| Method | Path                                                       | Purpose                                                              | SRS     |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| GET    | `/manage/branches/{branchId}/complaints?status=&category=` | Open / in progress / resolved / reopened                             | CMP-005 |
| GET    | `/manage/branches/{branchId}/complaints/{complaintId}`     | Detail + history + attachments                                       | p.33    |
| POST   | `…/complaints/{id}/assign`                                 | `{ assigneeUserId }` (a manager of this branch or the owner)         | p.33    |
| POST   | `…/complaints/{id}/start`                                  | → `in_progress`                                                      |         |
| POST   | `…/complaints/{id}/resolve`                                | `{ note }` → `resolved` (closure needs resident acceptance, CMP-004) | CMP-004 |
| POST   | `…/complaints/{id}/notes`                                  | Internal note (history)                                              |         |
| GET    | `/manage/branches/{branchId}/complaints/stats?from=&to=`   | Counts + average resolution time                                     | CMP-005 |

## Reviews

| Method | Path                                          | Purpose                                                                            | SRS         |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| GET    | `/manage/branches/{branchId}/reviews?cursor=` | All published reviews + ratings                                                    | p.38        |
| POST   | `…/reviews/{reviewId}/reply`                  | `{ body }` public reply (one per review)                                           | REV-005     |
| PATCH  | `…/reviews/{reviewId}/reply`                  | Edit own reply                                                                     |             |
| POST   | `…/reviews/{reviewId}/report`                 | `{ reason, details }` → moderator queue. Management **cannot** edit/delete reviews | REV-005/006 |

## Dashboards

| Method | Path                                    | Scope  | Purpose                                                                                                                                                                                                                            | SRS               |
| ------ | --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| GET    | `/manage/branches/{branchId}/dashboard` | BRANCH | **Today** (check-ins, checkouts, visits) · **Action queue** (pending bookings, proofs, unresolved complaints, expiring offers, oldest first) · **Live ops** (vacant seats, overdue rent, unread chat). No owner-wide data          | MGRD-001, p.37    |
| GET    | `/owner/dashboard?branchId=all\|{id}`   | OWNER  | Seats by state, occupancy %, active residents, expected/collected/outstanding, pending bookings, proofs, complaints, upcoming checkouts. Per-branch rows with drill-down ids. Branch status flags (archived; future: subscription) | OWN-001/002, p.36 |
| GET    | `/owner/action-required`                | OWNER  | Unverified payments, overdue rent, pending bookings, unresolved complaints, checkouts across branches, each linking to its branch                                                                                                  | OWN-003           |

Counts are actionable: every item carries `{ branchId, resourceType, resourceId }` for navigation (p.36 action counts).

## Reports & exports

AUD-010 backend implementation: `buildingId`, `floorId`, `roomId`, `residentId`
and `status` now use actual branch-scoped predicates. Family applicability is
defined in [the filter matrix](../audit-report-filters-20261028.md). Invalid or
inapplicable selections reject explicitly; unknown/foreign identities and
incompatible parents return 404. Archived identities remain usable for historical
reports. Apply AND semantics before row ceilings, eligibility and aggregate sums.
Canonical invoice status is evaluated after the shared balance projection, before
matching invoice counts or money totals. Owners retain their authorized branch
selection; no selector expands that authority. Web controls and coordinated
acceptance are pending. See [property management prerequisite](09-property-report-prerequisite.md).

ADR0079 timing: snapshot location uses the assignment immediately before the
midnight following the selected Karachi end date (today if omitted). Checkout
uses the assignment immediately before statement creation, retaining a departing
assignment whose end equals that instant. A date-only payment uses the assignment
at the end of its Karachi `paidOn` day; all payments on that date follow the same
rule, without inventing a time. Later-day transfers do not move those events.
Complaints use their recorded room and bookings their booked room. Building/floor
classification uses the room's maintained metadata; it does not invent historical
parent names. A legacy room with no floor cannot match a selected floor/building.
Status remains the existing authoritative domain state, not reconstructed state
history. The report's financial projection remains the canonical operational one.

Transport preserves active/ended defaults; an explicit supported status may select
requests/rejections/withdrawals. Records with no effective start use creation time
for the selected calendar range; effective subscriptions retain overlap semantics.
Typed SDK JSON and CSV/PDF paths validate and serialize the same selections.
An empty explicit owner branch list cannot be encoded as a GET selection and is
rejected by the SDK rather than silently becoming all branches.

Named selector API: `GET /v1/branches/{branchId}/reports/{type}/options` uses the
same live grant as that branch report (`finance_view` for financial families,
otherwise `stay_manage`), with no resident-directory permission expansion.
Query `field=building|floor|room|resident` is required; optional `search` (literal,
max 80), UUID `cursor` and `limit` 1..100 (default 20) produce bounded ID pages.
Floor choices require `buildingId`; room choices optionally narrow by building
and/or floor. Other fields reject location parents; inapplicable resident choices
reject with 400. Foreign/incompatible parents return 404. No-store responses use
strict `reportOptionPageSchema`: exact branch/report/field and nullable parent
IDs, `data: [{ id, name, detail, archived }]`, nullable `nextCursor`. Archived
identities remain available for historical selections; unclassified rooms have
null detail. Resident options require a permitted report source fact, including
approved receipt provenance for payment/deposit choices. They offer an identity,
not a claim of current balance or eligibility. No contact, linked-account or
current-assignment directory fields are returned. SDK validation rejects wrong
scope, parent, duplicate/nonadvancing pages and invalid sentinels.

Owner report scope (AUD-010): enumerate all authorized live branches with bounded
100-row keyset pages instead of using the dashboard's first-100 display. An
explicit selection is checked directly in that authority query, including branches
beyond the display ceiling. Deduplicate repeated branch IDs before report work.
A selected location/resident identity narrows aggregate branch groups to its
resolved authorized branch; unrelated zero-total groups do not consume row limits.
Dashboard display limits remain unchanged and do not define report authorization.

RPT-002 / AUD-007: successful JSON, CSV and PDF responses include
`X-HSM-Report-Truncated: true|false`, matching the shared report's `truncated`
field. `true` means only the first 5000 matching rows are included. CSV keeps
its existing columns, quoting and formula protection; no warning rows are added.
The authenticated Web download reads this metadata from the same response and
shows a visible warning for partial results. Missing/invalid metadata produces
an explicit completeness warning. Filenames and branch authorization still apply.

RPT-001/002 / ADR0077: outstanding-dues and security-deposits ceilings count
eligible canonical balance rows. Candidate scans continue in stable bounded
pages until exhaustion or the 5001st matching row. The shared report result
contains at most 5000 rows; only an extra match sets `truncated: true`. Paid or
zero-deposit candidates do not consume that result ceiling. Existing branch,
as-of and historical Stay scope remains applicable to every output format.

`GET /manage/branches/{branchId}/reports/{type}`: BRANCH. `GET /owner/reports/{type}?branchIds=`: OWNER (cross-branch).

| `type`                  | Content                                         | Common filters                        |
| ----------------------- | ----------------------------------------------- | ------------------------------------- |
| `occupancy`             | Seats by state over time, occupancy %           | from, to, buildingId, floorId, roomId |
| `residents`             | Active / past residents                         | status                                |
| `bookings`              | Requests, conversions, expiries, response times | from, to, status                      |
| `rent-collection`       | Expected vs collected vs outstanding per month  | month range                           |
| `outstanding-dues`      | Residents with balances                         | asOf                                  |
| `payment-history`       | Approved payments                               | from, to, method                      |
| `security-deposits`     | Held, deducted, refunded                        | refundStatus                          |
| `checkout-history`      | Checkouts + final statements                    | from, to                              |
| `complaints`            | By category / status / resolution time          | from, to                              |
| `transport-subscribers` | Per route                                       | routeId                               |

| Method | Path                                             | Purpose                                                                                                                                      | SRS                   |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| POST   | `/manage/branches/{branchId}/exports`            | `{ reportType, format: csv\|pdf, filters }` → job `{ exportId }`                                                                             | RPT-001               |
| GET    | `/manage/branches/{branchId}/exports/{exportId}` | `{ status, url?, expiresAt? }`: signed, short-lived URL                                                                                      | p.39 PDF/CSV security |
| POST   | `/owner/exports`                                 | OWNER: full data export of owned organisations (residents, bookings, payments, invoices, assignments, deposits). No platform moderation data | OWN-004, p.36         |

Reports read the same authoritative tables as the operational screens, with no separate counters (p.39). Historical reports reproduce that period's amounts (p.31 exports).

Runtime date semantics (RPT-001, AUD-004): `from` and `to` are inclusive Karachi
calendar dates. Timestamp reports use `>=` the From midnight and `<` the midnight
following To; timestamp date cells use the Karachi calendar. Payment `paidOn` and
other date-only fields keep inclusive calendar comparisons. JSON metadata retains
the requested dates for JSON, CSV and PDF generation. Current runtime GET paths are
`/v1/branches/{branchId}/reports/{type}` and `/v1/owner/reports/{type}`.

Rent-collection reports support at most 24 inclusive calendar months per request;
larger windows return `VALIDATION_FAILED` (400), without returning a shortened
history. Financial metrics include all applicable invoices, including old unpaid
debt; display row limits do not cap metric totals (FIN-001, OWN-003, AUD-005).

## Audit log

| Method | Path                                                                   | Scope      | Purpose                                                                                                           | SRS         |
| ------ | ---------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------- |
| GET    | `/manage/branches/{branchId}/audit-log?action=&actorUserId=&from=&to=` | OWNER-ONLY | Hostel audit trail (payment approvals, rent changes, booking decisions, transfers, check-in/out, manager changes) | AUD-002/003 |

## AUD-009 runtime action queues (2026-10-28)

Supersedes the planned `/owner/action-required` resource-count payload above.
Dashboard counts remain numbers. The Web resolves their destinations through a
named authorized branch and a queue family; exact record IDs come from that
branch's authorized queue response.

`GET /v1/branches/{branchId}/dashboard/queues/{queue}` accepts `queue` of
`overdue`, `complaints`, or `checkouts`; `limit` 1..100 (default20) and optional
UUID `cursor`. Returns strict `{ queue, branchId, asOf, data, nextCursor }`.
`asOf` is the Karachi business date. Empty authorized scopes return an empty
page; unknown families/invalid bounds reject400. Every request rechecks actor,
branch and live grant; foreign scope is denied, including on direct navigation.

- `overdue`: finance_view; all months, actual canonical overdue balances after
  immutable grace and receipt-backed allocations. Eligibility precedes the visible
  page sentinel; candidate reads are bounded100, without a history scan ceiling.
  Rows contain Stay ID, resident display name and canonical invoice balance.
- `complaints`: stay_manage; excludes resolved/closed before paging. Rows use the
  existing complaint DTO and exact scoped complaint controls.
- `checkouts`: stay_manage; notice_given/checkout_pending regardless of expected
  date, plus active Stays expected to depart from today through today+14 inclusive.
  Rows use the existing Stay summary and lifecycle controls.

Bookings/proofs retain their existing APIs and pending/submitted filters.
`GET /v1/owner/dashboard` additionally accepts `cursor`, `limit`1..100 (default100)
and returns `nextCursor`. Totals cover the entire owned nonarchived scope,
independently of the displayed page. Selected branch and cursor cannot combine.
A missing or revoked cursor identity returns404. No schema migration, financial
posting, grant backfill, retained-data change or stored-state rewrite is required.
