# ADR 0013: Staff revocation transactions

- **Status:** Accepted
- **Date:** 2026-10-08
- **Source:** SEC-001, MGR-004/005, AUTH-M-006, ACC-002/003/006; CHG-005

## Context

One identity may own an organization and manage another branch. Concurrent owners
revoking each other's manager assignments must not acquire identity locks in
opposite orders. Existing authentication mutations serialize on the identity row.

## Decision

Resolve the assignment's immutable identity under the requested branch, then lock
the distinct actor and target user rows in ascending database UUID order. Recheck
the actor's account, persisted session and live ownership inside that transaction.
Lock the scoped assignment only after identity locks.

The owner-only suspend, reinstate and deactivate endpoints use existing status
rules. Deactivation preserves assignment history and cannot be undone. Suspension and deactivation revoke every existing target session. Each actual
transition writes hostel audit evidence and
enqueues its fixed transactional notification in the same database transaction.
Previously revoked sessions require new authentication; reinstatement never restores them.

Repeated requests for an already reached state return the current status without
another mutation, audit or notification. These actions do not opt into persisted
HTTP idempotency, which acquires a single actor lock before the handler. Manager
appointment and temporary-password reset are not part of this minimal checkpoint.

Management lists use bounded UUID cursor pagination and private foundation DTOs.
Organization/branch creation, settings, property setup and other Phase 2 workflows
are excluded. Foundation branch lookup intentionally exposes only identity, name,
organization/brand IDs and verification status.

## Consequences

Unit, HTTP and real PostgreSQL/Redis tests cover default denial, foreign branch
403, foreign child 404, immediate all-device revocation, retained history,
transaction rollback and ordered concurrent revocation. Container checks are
authoritative only after their GitHub Actions run succeeds. The current guard
architecture and RLS deferral in ADR 0008 remain applicable.
