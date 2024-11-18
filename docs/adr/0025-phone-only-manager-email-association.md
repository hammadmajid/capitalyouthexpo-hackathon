# ADR 0025: Verified email on the existing phone-only Manager identity

- **Status:** Accepted
- **Date:** 2026-10-12
- **Source:** CHG-006; SRS v2.1 supplement; AUTH-M, AUTH-C, SEC-001, SEC-003, AUD-001

## Context

An activated phone-only Manager already has a permanent password and live branch
capability. Revised Customer and Owner profiles require verified email on that
same identity. Creating another account or merging by a typed email would defeat
the approved additive-capability model. A valid phone format is not ownership proof.

## Decision

Use two SELF-scoped mutations under the existing cookie/CSRF or bearer transport.
Request requires the current permanent password, a live active account/session,
no associated email and a live active Manager assignment with unarchived parents.
A claimed email receives the same 202 acknowledgement and no challenge. Never
alter another identity or disclose which identity owns the target email.

Reuse the existing `email_change` database enum, actor-bound OTP HMAC, encrypted
outbox, ten-minute expiry, five attempts and persisted one-minute resend cooldown.
Do not attach or verify the email when requesting. Verification binds the latest
challenge to actor, purpose and exact normalized target email. Failed attempts
commit before returning an error. Valid proof consumes the challenge, binds and
verifies email, queues the existing security notice and appends a value-free audit
in one identity-locked transaction. The unique email constraint is the final
arbiter for concurrent claims; conflicts roll back and return an opaque failure.

Return a fresh strict self projection. Do not mint tokens, replace passwords,
modify phone verification, merge identities or change branch assignments. The
client checks both identity and verified target email before accepting success.
Lost responses can reconcile with authenticated `GET /me`; no proof replay or
local credential storage is required. Forms retain only ephemeral step state and
clear password input when moving to proof. Existing verified-email recovery then
applies; no SMS recovery is introduced.

## Consequences

No schema migration is needed: reuse the existing email_change purpose and unique
email constraint. Preserve migrations 0000-0006. There is no backfill, automatic
association or conversion of phone verification. Existing identities with email
remain on their existing verification/recovery path; this is not a general email
replacement feature. Authorization and eligibility are rechecked on each request.
Unit, HTTP/CSRF, encrypted worker delivery and real Testcontainers transactional,
collision, revocation and rollback cases are required. Current verification
results and remaining acceptance work are recorded in STATUS.
