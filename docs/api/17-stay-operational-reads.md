# API 17: Private Stay operational reads

Refs CHG-009/010, RES-001/002/003, STAY-001/002, SEC-003, ACC-004.
Implementation checkpoint: 2026-10-19. Runtime acceptance remains pending.

| Method | Path                                | Authorization                                             |
| ------ | ----------------------------------- | --------------------------------------------------------- |
| GET    | /branches/{branchId}/stays          | Owning Owner or active assigned Manager with stay_manage  |
| GET    | /branches/{branchId}/stays/{stayId} | Same live branch permission; exact branch/Stay            |
| GET    | /me/stays                           | Authenticated account; explicit stays.userId equals actor |
| GET    | /me/stays/{stayId}                  | Exact linked own Stay; another identifier returns 404     |

These are private, Cache-Control: no-store reads. They reuse live account/session,
branch and canonical Manager grant checks; there is no Resident login role and no
contact-based matching. A manual resident without an explicitly linked account is
never exposed through a Customer's matching name/phone/email. An unrelated branch
or Stay identifier cannot change the authorized relationship.

Collections return data and nextCursor. UUID keyset pagination is ordered by Stay
ID, default20, maximum100, with at most limit+1 rows queried. Both collections accept
cursor, limit and a controlled lifecycle state. Staff additionally accept a literal
resident-name q (maximum100), current roomId/bedId and inclusive moveInFrom/To and
expectedLeaveFrom/To date ranges. Null expected departure does not match a bounded
expected-departure filter. Phone/CNIC/account override searches are rejected. An
omitted filter does not guess dates, occupancy or financial status.

Summary: id, branchId, residentId, displayName, source, state, version, planned
moveInDate/expectedLeaveDate, actual checkedInAt/closedAt, and nullable exact current
assignment (id, roomTypeId, roomId, bedId, startedAt). A reservation or a prepared
Stay alone is never presented as actual occupied accommodation. Historical and
unlinked manual relationships remain retained; they are never silently merged.

Detail adds immutable bookingId origin and branch-local phone/email contact. Neither
response contains login identifiers, CNIC, private files, document contents, ledger,
receipt, rent status, financial totals, internal reasons or actor metadata. Financial
staff resources require live finance_view/object checks; own financial resources
require separate exact account/Stay ownership checks. Operational reads
must not reuse public marketplace cache/projections. No public route exposes these
DTOs. Invalid internal scope or projection data fails closed with a typed error.

Web and Android expose lazy resident/stay views from the selected staff branch and
My stays from the authenticated account area, independently of a separate Customer profile or selected staff space. Query keys include actor/branch, cursor and filters;
private cache retention is zero. Pending refresh, failed refresh, access loss and
actor/branch changes hide stale data; denied detail hides its stale directory too.
This read slice does not enable check-in, checkout, transfer, payment, invoice or
schedule mutations. Those remain separate Phase3 work and acceptance gates.

Unit/HTTP/privacy tests and six real PostgreSQL/PostGIS/Redis HTTP cases are retained.
The real cases are NOT RUN LOCALLY on this Docker-less Windows machine. Local source,
SDK generation, component and coverage results must be recorded in STATUS before a
verified runtime claim. Existing container suites and CI gates are unchanged.

Canonical-route-only request logging is reused; private name-search query strings
are not included in request logs. The existing real Fastify/Pino redaction tests
pass in the complete1551-test API checkpoint. Web uses the existing cookie proxy
with no-store transport/response policy; Android uses the existing bound actor
client. No new proxy/authentication mechanism or public cache is introduced.

Database-backed date filters accept AD years0001..9999, rejecting ISO year0000
before SQL. Shared calendar/rent arithmetic remains unchanged. This is grounded in
[PostgreSQL17 date conventions](https://www.postgresql.org/docs/17/functions-datetime.html);
real SQL execution is still unverified. The complete pre-fix contract regression
run reproduced4 failures with580 existing tests passing; the current shared date-boundary gate passes624 tests/43 suites at100% reported
coverage and static5/5. Real SQL remains unverified.

### Own-read capability clarification (CHG-012; activation pending)

SRS v2.7/ADR0050 records self-read authority from the explicit stays.userId link,
including an Owner/Manager who lacks a Customer profile. The two controller reads
now use existing Self metadata after a RED run reproduced2 failures/20 passes.
The fixed focused HTTP/repository assertions pass39/2 suites; that selected command
still fails unchanged package-wide coverage with other producers excluded. The
actual Owner/no-Customer-profile PG case remains NOT RUN LOCALLY. Preserve exact self ownership,
foreign/unlinked404, live sessions and unrelated Customer booking eligibility.
Paths, DTOs and operation IDs remain stable. See STATUS.md before a runtime claim.
