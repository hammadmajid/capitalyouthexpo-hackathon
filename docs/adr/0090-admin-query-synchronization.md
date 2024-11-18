# ADR0090: Preserve scoped Admin queries and synchronize visible workflows

Date: 2026-10-31. Status: accepted by user-directed automatic-update work.
Requirements: HMA-017, ADM-001, SEC-003.

## Context

Routine refresh controls were duplicated throughout Admin. Clearing the entire
staff cache on each nested blur remounted screens and lost local navigation state;
background reads also hid already-loaded records. There is no Admin-wide event stream.

## Decision

Reuse existing actor/role query keys and command invalidation. Pause inactive
route observers; re-enable stale reads on return and use existing app focus events.
Retain safe loaded content during background reads and settle dashboard response
pairs together. Keep original draft/decision revisions through metadata updates.

Retain initial fresh permission gating and repeat checks on focus. Scope changes,
authority failure, sign-out, mode exit and the outer Admin boundary exit purge
staff cache. Purpose-bound private evidence remains an explicit mutation/read,
cleared on sensitive focus loss; it is never automatically reopened.

Use one60-second foreground-only scoped reconciliation for external-session
changes. Skip disabled, fetching and unsuccessful queries and active scoped
commands; do not add subscriptions, dependencies or backend APIs.

## Consequences

Local command results and navigation synchronize without refresh controls or
routine skeleton flicker. Search/filter state and mounted scroll containers remain.
Remote updates are bounded eventual reads, not instant push. Error recovery Retry
remains available. Focused67 Native tests and strict Mobile typecheck pass; global
lint retains18 recorded issues. UI checking stopped at the user's request.
