# ADR 0066: Guarded own-Stay departure notice HTTP

- Status: source implementation in progress; local and real PostgreSQL acceptance pending
- Date: 2026-10-21
- Refs: OUT-001/002/006, RES-001, SEC-003, ACC-002/004; ADR0060

## Context

The existing notice coordinator already preserves original agreed notice timing,
actual occupancy, history and audit. Its required authorizer/publisher callbacks
must be connected to real authenticated transactions before a client can use it.

## Decision

Author an optional acceptance-fixture-only POST
/v1/me/stays/{stayId}/checkout-request. Production main does not register it.
Use the actual account-linked own Stay, current account/session locks and active
hierarchy before the protected Stay lock. Do not infer identity from contacts or
require a separate Customer profile for an already linked resident identity.
No staff notice permission or new Manager grant is introduced in this slice.

Reuse actor/command-bound transactional idempotency, including live own authority
before a successful replay. The coordinator alone validates active state/version,
original effective agreement and server Karachi submission date. New-operation
state requirements must not reject the original successful replay merely because
that operation already advanced the Stay to notice_given.

Supply mandatory authorization and notification callbacks bound to the exact
transaction, actor, Stay, branch and operation time. Enqueue the existing linked
resident.notice_submitted event in that same transaction. A failed required enqueue
must roll back notice state/history/audit/idempotency together. Offline resident
staff notice handling remains a separate future workflow.

Strict request/result schemas disclose timing and actual shortfall. They do not
introduce a fee, settle money, waive policy, alter expected departure, close an
assignment or release its canonical inventory claim. Replay returns the original
operation result; clients still refresh the current Stay independently.

## Consequences

The DB coordinator export is internal application infrastructure, not an enabled
production route. Preserve existing migrations; this connection changes no schema,
pricing, money attribution or retention rule. Real PostgreSQL HTTP/session/replay,
rollback, occupancy and outbox acceptance remains mandatory before activation.
Existing Testcontainers suites are retained and NOT RUN LOCALLY on this machine.
