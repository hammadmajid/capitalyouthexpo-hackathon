# Approved charge catalogue configuration

FIN-004 / RENT-003 / AUD-004 / ACC-004; CHG-014, SRS v2.9, ADR0052.

| Method | Route                                                      | Scope                                     | Result                      |
| ------ | ---------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| GET    | /v1/branches/{branchId}/charge-catalog                     | Owner or active Manager with finance_view | 200 bounded page            |
| POST   | /v1/branches/{branchId}/charge-catalog                     | Owning Owner                              | 201 immutable entry         |
| POST   | /v1/branches/{branchId}/charge-catalog/{catalogId}/archive | Owning Owner                              | 200 retained archived entry |

Reads accept strict limit (default20, maximum100), UUID cursor and optional
includeArchived=true/false (defaultfalse). Pages contain branchId, canEdit,
includeArchived, data and nullable exact last-row nextCursor, ordered by UUID.
A Manager grant never permits mutation. Anonymous requests are denied; foreign
parent scope is403, an inaccessible/mismatched child is404. Responses are no-store.

Creation accepts only code (lowercase controlled identifier, maximum64), name
(trimmed1–120), unitLabel (trimmed1–40) and unitAmountPaisa (positive safe integer).
IDs, creator identity and timestamps are server controlled. Returned entries contain
those four facts plus id, branchId, createdAt and nullable archivedAt. No private
resident data is exposed. Archive accepts only a trimmed reason (1–500); the reason
is recorded in mandatory audit and excluded from the public response shape.

Both commands require UUID Idempotency-Key and refresh-session-bound CSRF for cookie
authentication. Idempotency-Replayed identifies replay; live actor/branch/Owner and
archive child scope are revalidated before serving a cached response. A changed
command under the same key conflicts. A different archive command on an already
archived entry conflicts. The same branch/code cannot be reused after archive.

Prices cannot be edited or deleted: new pricing needs a distinct code/record and
an explicit agreement amendment. Archive only sets archivedAt, retaining original
facts and history. Catalogue mutation, mandatory hostel audit and successful
idempotency response share a transaction. Failure rolls back all three. There is
no charge posting, payment approval, fund transfer or generic ledger write endpoint.

Main runtime, offline OpenAPI builder, real-infrastructure fixture and SDK source
are wired. SDK types must be generated from actual OpenAPI; generated files are not
hand edited. Seven real PostgreSQL/Redis HTTP scenarios are authored for the existing
Testcontainers integration gate and are NOT RUN LOCALLY. Static/unit/HTTP validation
and exact-source CI results are recorded in STATUS.md; this document claims no PASS.
