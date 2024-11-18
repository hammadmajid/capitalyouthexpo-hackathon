# Phase 1 authorization foundation

Refs: SEC-001, ACC-002, MGR-004; permission matrix in 01-roles-and-permissions.md.

Every Nest controller route requires an explicit, valid scope at startup. PUBLIC
bypasses authentication; all other scopes authenticate the access credential against
live database account/session state and return non-cacheable responses. Cookie
authentication retains the existing CSRF requirement for unsafe methods.

Capabilities are simultaneous and resolved from active persisted records. OWNER
requires an unarchived owned organization, optionally a concrete organization ID.
BRANCH requires either ownership or an active manager assignment for the actual
route branch. OWNER-ONLY never falls back to manager membership. Archived branches,
brands or organizations do not grant branch access. Root and normal admins have no
automatic hostel operational bypass. ADMIN scopes require an active admin account
and a current role grant, or Root; Billing remains denied under CHG-003.
CUSTOMER requires its persisted profile and active identity. StayGuard denies
resident scope until the later ResidentStay model is implemented.

ObjectScope resolves manager assignments through the authorized branch query before
returning a result. Unknown, inaccessible and route/child branch mismatches return 404. Direct foreign branch requests return 403. IDs in query strings or headers
cannot substitute for route scope or database membership.

Scoped guards are admission checks. Privileged services must recheck the live scope
under the transaction locks protecting the business mutation and audit, particularly
manager suspension/deactivation. No Task 10 mutation is implemented by this checkpoint.
Sensitive CNIC/document access must additionally satisfy CHG-004 and need-based audit;
ordinary branch/admin scope alone does not authorize full sensitive disclosure.
No new sensitive-data endpoint is exposed here.

Q15: production RLS is explicitly deferred under ADR 0008 after a real PostgreSQL
spike. Application guards and scoped queries remain mandatory. No partial production
RLS or claimed RLS protection.

Tests include a table-driven real Nest/Fastify HTTP scope matrix, default-deny startup
checks, actor binding, typed identifier validation and compiled repository predicates.
Real Testcontainers authorization tests verify branch/object denial, live assignment
changes, parent archival, simultaneous capabilities and admin-grant revocation.
These container tests run through pnpm turbo run test:integration on a compatible
local runtime or Ubuntu CI. They are NOT RUN LOCALLY on the current Windows host.

Task 8 COMPLETE: CI PASS 37692147621 at 8f35f22; all four jobs, 55 real integrations, zero skipped. LOCAL PASS: 413 tests, authorization 100% lines/branches/functions. Containers NOT RUN LOCALLY.

Sensitive admission policy now validates trusted server facts: active self identity; current owner/manager scope plus approved-booking/walk-in relationship (CHG-004); or active Root plus an authorized safety case and meaningful justification. General branch membership and normal-admin capability do not grant sensitive disclosure. The policy exposes no data or HTTP endpoint. Transactional audited disclosure remains a Task 9 dependency.
