# ADR 0041: Scoped management inventory pages

- Status: Implementation in progress; verification pending
- Date: 2026-10-17
- Refs: ROOM-002, ACC-001/004, SEC-003, PERF, revised Phase 2

## Context

The existing private inventory read materializes every type, room and bed for a
branch. Transport bounds must not become a business limit on physical inventory.
Loading unrelated children also makes capability-only checks unnecessarily costly.

## Decision

Add independent authenticated page resources beneath
`/v1/branches/:branchId/inventory/pages`: `room-types`,
`room-types/:roomTypeId/rooms`, and `rooms/:roomId/seats`. Each uses UUID keyset
ordering, default limit20 and maximum100, with a limit-plus-one continuation probe.
Bed ordinals remain unchanged data; this page order does not renumber beds.
Every collection can be traversed completely. A separate `access` GET accepts an
empty query and returns current branch authority without physical collection
reads. Web/native booking queues use it with a separate account/branch cache. No hidden type, room or bed cap.

Responses identify the actual branch, exact parent for child pages, current
permissions and canConfigureManagers, rows and nullable nextCursor. Read-only
Managers retain existing branch access. Existing session, active assignment and
organization/brand/branch checks run inside the transaction; identity is checked
again before return. Child reads require an unarchived same-branch parent and,
for beds, an unarchived room-type ancestor. Inactive/maintenance rows remain
visible to authorized management; archived rows remain excluded as before.

Types include exact integer paisa and one bounded, branch-scoped fee batch over
only the current type page and its probe. Each response validates scope, current
archive state, ordering, duplicates, metadata and the entire probe before slicing.
The SDK also binds even empty responses to the requested branch/parent, enforces
requested limits, and rejects cursor repetition or short-page continuation.
Responses are no-store. No mutation, authorization grant, business policy, pricing,
booking concurrency, public disclosure or database migration changes.

## Consequences and acceptance

These additive routes allow web/mobile migration without pretending that existing
unbounded readers are repaired already. Migrate their callers and add explicit
navigation, draft/pending guards and current-scope error handling. Public detail
option pages and availability queries remain separate mandatory work. Remove or
retire unbounded transport only after compatibility consumers and tests migrate.

Unit/HTTP/contract/client gates and real PostgreSQL tests remain mandatory. Four
Testcontainers cases cover102 types,102 rooms,103 beds, exact fee/prices, complete
ordered traversal, read-only/revoked Manager access, foreign/archived parents and
real empty results. They are NOT RUN LOCALLY. No PostgreSQL/CI/whole-phase PASS is
implied by source construction or SQL unit tests.

## Client migration checkpoint

Web and native physical browsers now request only selected parents, with explicit
next/first pages and scope-bound caches. Web navigation respects independent
settings drafts; unavailable reads retain drafts and disable saves. Booking queues
use the access endpoint. Web static/build and selected native tests pass locally;
complete native gates and real database acceptance remain pending in STATUS.

Manual block history/release now use capability-only access. The creation picker
is authored with type, room and bed pages. Explicit room/type navigation clears
only the physical target, retaining the independent dates, category and reason;
bed paging clears only the bed choice. Existing inactive/maintenance inventory
remains selectable as before, and server transaction/conflict checks are unchanged.
Picker authority intersects every loaded page; it never supplies a new grant.
Regression tests are authored; this checkpoint does not claim their execution.
