# ADR 0082: Serialize Root commands before authority locks

- **Status:** Accepted remediation; focused real verification passed; final acceptance pending
- **Date:** 2026-10-28
- **Requirements:** ADM-001, SEC-003, ACC-004; AUD-015

## Context

The initial real concurrent promotion/self-demotion tests passed. A further real
HTTP test with two Roots demoting each other returned200/500 instead of200/403.
Each command had already locked its actor identity and shared admin account;
membership serialization happened later inside the mutation. A waiting command
could therefore retain authority locks needed by the command holding the
membership lock. The public denial must reflect the resulting live authority,
rather than exposing an avoidable database failure.

## Decision

Use the existing IdempotencyService.withStore capability and repository lock hook
for Root account-management commands. Acquire the existing Root membership advisory
transaction lock first, then the unchanged live actor/session lock, followed by
live Root authorization before replay or mutation. Other idempotent commands keep
their existing repository/lock order. Acceptance of a normal admin invitation is
unchanged. Keep all database cap guards, audits and replay fingerprints.

## Consequences

Root account-management commands serialize across actors, including invitations,
role/status changes and replays. These low-frequency privileged operations trade
parallelism for a single authority/membership order. A losing cross-demotion
request rechecks authority after waiting and receives403. No permission, Root
cap, business policy, schema, endpoint, timeout or error assertion is weakened.
The real test retains promotion, self-demotion, cross-demotion and revocation
checks. Final coordinated regression remains required.
