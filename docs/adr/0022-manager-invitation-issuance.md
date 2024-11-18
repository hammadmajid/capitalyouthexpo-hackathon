# ADR 0022: Manager invitations preserve identity consent and one-time issuance

- **Status:** Accepted
- **Date:** 2026-10-11
- **Requirements:** AUTH-M-001..006, MGR-004, CHG-006, SEC-001, ACC-006

## Context

Revised Phase 1 requires Owner-issued auto/manual invitations while preserving
existing permanent accounts and additive capabilities. An ordinary idempotency
response cache cannot store a generated password. Dual-capability identities can
also deadlock if the actor is locked before a lower-ordered target identity.

## Decision

Reuse the existing explicit temporaryCredential auto/manual input contract,
manager_assignments, Argon2id activation, 24-hour expiry and five-attempt lock.
Resolve the target phone mapping, then lock actor and target identities in global
UUID order before live Owner branch scope, assignment, mutation, audit and replay
persistence. The idempotency repository accepts a server-selected locking strategy;
existing routes retain their original identity/session lock.

Create passwordless identities only when absent. Never replace existing names,
permanent passwords, other capabilities or devices. Permanent identities receive
pending invitations with no temporary credential hash and must accept through
the existing authenticated acceptance endpoint. Temporary reset is restricted to
pending passwordless identities, including locked/expired invitations. Assignment
history is retained; the existing one-live-assignment constraint still applies.

Only stable assignment IDs, lifecycle, expiry and acceptance mode enter replay
storage. The initial successful auto-generated issuance adds its plaintext secret
after the transaction commits; replay never exposes it. Manual passwords are not
echoed. Request fingerprinting binds manual credentials with a server-keyed,
purpose-separated HMAC before the generic fingerprint, avoiding an additional
fast offline password verifier. Logs and audits exclude identity and credential
values. Losing an initial generated response requires a new Owner reset request.

## Consequences

Resource, credential hash, fixed privileged audit and replay state commit or roll
back together. Fresh scope and persisted session are rechecked before replay.
No new schema or historical migration changes are required. Unit/HTTP gates and
real PostgreSQL Testcontainers race, consent, expiry, activation, revocation and
actual audit-failure rollback tests remain blocking. Container tests are verified
in CI; local Docker availability is not assumed.
