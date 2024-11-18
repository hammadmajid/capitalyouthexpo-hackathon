# Notification worker

BullMQ dispatches durable PostgreSQL outbox messages through the SMTP EmailProvider.
OTP envelopes are authenticated before rendering React Email HTML and plain text.
Expired/invalid messages are dead-lettered; temporary delivery failures retry up to
five attempts. See [ADR 0007](../../docs/adr/0007-durable-email-delivery.md).

Run `pnpm turbo run build`, then `pnpm turbo run dev --filter=@hsm/worker`.
The worker loads the ignored root `.env.worker`, independently of the API's `.env`.
Copy `.env.worker.example` and provision database, Redis, SMTP and email-key values.
Use the existing `envelopeKey(master, 'email')` export from
`@hsm/security/envelope` during secret provisioning, where master is the API's
32-byte CNIC_ENCRYPTION_KEY decoded from hex. Encode the derived result as hex for
EMAIL_ENVELOPE_KEY. Never copy either CNIC key into the worker environment.
Do not place secrets in source, queue payloads, logs or client applications.

Mailpit uses local SMTP without credentials. Staging/production require explicit
APP_ENV, paired credentials and TLS (SMTP_SECURE or SMTP_REQUIRE_TLS), with verified
certificates. SMTP_FROM is a mailbox address. SMTP delivery occurs outside database
transactions. Delivery is at-least-once across process failure; stable Message-ID
does not guarantee provider deduplication.

`pnpm turbo run lint typecheck test build` runs without containers.
`pnpm turbo run test:integration` requires a compatible runtime and exercises real
PostgreSQL/PostGIS, Redis and Mailpit. GitHub Actions is the authoritative environment
when a developer machine lacks that runtime. File scanning and push delivery are
separate foundation work, not implemented by this email checkpoint.

Terminal billing jobs require explicit maintenance recovery after the dependency
is repaired. Restarting the dispatcher does not requeue dead work. See the
[restricted recovery runbook](../../docs/billing-recovery-runbook.md) and
[ADR0081](../../docs/adr/0081-explicit-terminal-billing-recovery.md). Normal startup
with no arguments is unchanged; recovery mode queues one audited budget and exits.
