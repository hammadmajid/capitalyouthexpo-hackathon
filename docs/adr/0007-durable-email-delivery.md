# ADR 0007: Durable email delivery and purpose-scoped worker keys

- **Status:** Accepted
- **Date:** 2026-10-08
- **Related:** ADR 0002, AUTH-C-002, AUTH-M-003, NTF-002

## Context

Authentication commits hashed OTPs and encrypted email envelopes in the same database
transaction. Delivery needs a separate worker, crash recovery and real SMTP verification.

## Decision

Reuse the existing version-one AES-GCM envelope and HKDF derivation from
`packages/security`; preserve the API format and authentication primitives.
Provision the worker with only the derived email key (`EMAIL_ENVELOPE_KEY`), never the
CNIC master encryption or hashing key. The worker rejects CNIC keys in its environment
and loads a separate ignored `.env.worker` file for local development.

BullMQ dispatches durable outbox IDs through Redis. PostgreSQL owns attempt counts,
due times and sixty-second leases. Claims lock the row, increment the attempt and
commit before SMTP. Completion/failure writes require the matching lease token.
Expired leases are recoverable. Five failed attempts become dead letters; temporary
failures use exponential backoff. Invalid or expired OTP payloads become dead without
SMTP. Queue jobs contain IDs only; provider failures and logs contain safe error codes.

SMTP runs outside database transactions through EmailProvider with Nodemailer.
Production/staging require authenticated TLS and certificate verification.
React Email renders HTML and plain text in `packages/emails`. Manager welcome mail
contains no temporary password, which the owner shares directly (ADR 0002).

## Consequences

Delivery is at-least-once: a crash after SMTP acceptance and before acknowledgement
can cause a duplicate. A stable Message-ID assists provider deduplication but does
not guarantee exactly-once delivery. Lease ownership prevents stale workers
acknowledging another attempt. Additive generated migrations preserve baseline history.

Testcontainers exercises PostgreSQL leases, Redis/BullMQ and Mailpit SMTP.
A separate test starts compiled production API and worker processes and verifies
registration and password recovery through delivered email. These checks must pass
in CI before Task 7 closes. Local Windows without a compatible runtime reports them
NOT RUN LOCALLY. The final Phase 1 stack gate also requires web/mobile foundations.
