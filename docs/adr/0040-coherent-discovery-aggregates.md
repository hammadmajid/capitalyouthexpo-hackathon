# ADR 0040: Coherent bounded public discovery aggregates

- Status: Implementation in progress; verification pending
- Date: 2026-10-17
- Refs: ACC-001/002, BKG-004/006, TRUST-006, PERF, revised Phase 2

## Context

Discovery currently materializes physical inventory separately for every selected
hostel and discards the room arrays. The 20-hostel unit regression reproduced
101 executed queries without dates and 121 with dates. A second regression using
real Drizzle SQL generation and driver callback counting reproduced both figures.
Neither unit driver is a PostgreSQL integration environment.

## Decision

Use one bounded public parent page with correlated Drizzle LATERAL aggregate
subqueries. PostgreSQL computes integer minimum prices and matching available bed/
whole-room counts. Physical room, bed and claim arrays never leave this query.
Retain existing per-mode price filtering, half-open ranges, released/expired claim
handling, whole-room/bed conflicts, inactive/archive handling and null undated
availability. Parent visibility, selected approved amenities and one currently
eligible cover share the SQL snapshot. Reuse gallery file eligibility, including
purpose/bucket/visibility/scan/digest/MIME/size requirements. No new business policy,
authorization, pricing default, migration or public DTO field is introduced.

Validate exact decimal aggregate text before integer conversion; reject malformed,
unsafe, duplicate, disordered, cross-cursor/requested-ID or oversized results.
The existing 100-code listing amenity configuration bound uses an extra row probe,
so corrupted metadata fails instead of silently truncating. Shared SQL-derived
parent names have unique aliases; the correlation UUID remains a qualified table
column. Do not use an unqualified SQL alias in branch predicates.

## Acceptance still required

SQL construction and strict projection units, real PostgreSQL comparisons against
existing inventory semantics, multiple branches, price/mode/range/expiry/claim
cases, public withdrawal and eligible-cover/privacy tests, and real query budgets/
plans. Existing Testcontainers tests remain. Renew full local/core and real CI/
security/combined business gates; do not infer PostgreSQL acceptance from units.
Physical-option paging remains separate outstanding work.
