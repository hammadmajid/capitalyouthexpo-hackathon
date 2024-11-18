# ADR 0008: Defer production RLS after the Phase 1 isolation spike

- **Status:** Accepted
- **Date:** 2026-10-08
- **Requirements:** SEC-001, ACC-002; Q15

## Context

Phase 1 needs complete application authorization for simultaneous capabilities, live
manager assignments, owner organization scope and restricted platform administration.
RLS can add defense in depth, but enabling policies on selected tables would create an
incomplete second authorization system. The current Drizzle pool has ten connections;
API requests, authentication transactions and asynchronous workers share infrastructure.

## Decision

Choose Q15 option B: explicitly defer production PostgreSQL RLS. No application table
has RLS partially enabled. Default-deny API guards, scoped repository queries,
object resolution, live session checks and transaction-time authorization remain mandatory.

The isolated Testcontainers spike uses PostgreSQL 17/PostGIS, Drizzle SQL expressions,
a non-superuser/non-bypass reader role and a one-connection pool. It verifies branch
restriction through transaction-local `set_config`, denial without context, foreign
row filtering, context cleanup after commit/rollback on the same backend, and ordinary
table-owner/superuser bypass. It changes only an ephemeral scratch schema and roles.
CI must pass the spike before Task 8 can close; local containers are NOT RUN LOCALLY.

## Evaluation

| Concern          | Finding and consequence                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drizzle          | Supports policies and transaction-local context, so compatibility is not a blocker.                                                                                 |
| Pooling          | Context must be transaction-local and every relevant query must use that transaction. Session-level settings can leak between unrelated requests.                   |
| Transactions     | Authorization and audit mutations already need transactions; wrapping every scoped read adds a separate enforcement contract that must be comprehensive.            |
| Workers          | Cross-recipient dispatch needs an explicit restricted service role/policy, rather than an application-wide bypass connection.                                       |
| Variables        | GUC values supplied by an application are not identity proof against a compromised application role. The role/context trust boundary needs documentation and tests. |
| Admins           | Root is not unrestricted hostel operational access. Need-based sensitive access and audited cases require explicit policies distinct from owner/manager membership. |
| Tests            | Each table, capability, revoked grant, worker path and pooled context needs real positive/negative/concurrency coverage; API tests remain necessary.                |
| Bypass           | Owners, superusers and BYPASSRLS roles bypass ordinary policies. FORCE RLS and separate migration/runtime ownership must be considered together.                    |
| Operations       | Least-privilege role provisioning, policy migrations, backups, diagnostic access and connection-pool deployment require a complete runbook.                         |
| Defense in depth | Valuable against missed query predicates once complete; partial coverage can falsely imply protection of child tables and sensitive records.                        |

## Revisit conditions

Before introducing RLS, inventory every scoped table and query path, separate migration
ownership from runtime roles, forbid runtime superuser/BYPASSRLS, define API/worker/admin
policies, ensure all scoped reads and writes carry transaction-local context, and test
pool reuse, rollback, revoked memberships, owner bypass and performance. Enable the
complete reviewed policy set in an additive migration with application authorization
still enforced. Record a new ADR superseding this deferral.

## Consequences

Phase 1 branch isolation is enforced and tested in the backend application. RLS provides
no claimed production protection in this phase. This decision does not relax the SRS
permission matrix, private disclosure boundaries, audit requirements or release gates.

## References

- [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [PostgreSQL transaction-local settings](https://www.postgresql.org/docs/17/sql-set.html)
- [Drizzle RLS support](https://orm.drizzle.team/docs/rls)
