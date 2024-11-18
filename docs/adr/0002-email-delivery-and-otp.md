# ADR 0002: Email Delivery & OTP Channel

- **Status:** Accepted
- **Date:** 2026-10-06
- **Related:** CHG-002 in `docs/srs/CHANGES.md`

## Context

- The SRS asks for mobile + email OTP at signup (AUTH-C-002).
- The user decided to launch with **password login + email OTP only**, sending email through **Hostinger SMTP** with custom branded templates.
- SMS OTP is deferred.

## Decision

- **Transport:** SMTP via Nodemailer to the Hostinger mailbox, e.g. `no-reply@<domain>`. Credentials come from env vars only.
- **Templates:** React Email components in `packages/emails`, rendered to HTML + plain text. Shared layout and brand header/footer.
- **Sending:** always from the worker via the notification **outbox** (BullMQ), with retries and backoff. Never sent inline in an API request.
- **Abstraction:** an `EmailProvider` interface. Hostinger SMTP is the first implementation; SES/Resend can replace it with no domain changes.
- **OTP rules:**
  - 6-digit code, hashed at rest.
  - Expires in 10 minutes. Max 5 attempts.
  - Resend cooldown of 60 s, plus per-email and per-IP rate limits.
  - Used for signup verification, password reset and email change.
- **Deliverability:** SPF, DKIM and DMARC records configured on the domain before launch.
- **Mobile number:** collected and normalised (`+92…`), unique-checked, but **not** OTP-verified in the MVP. A `phone_verified_at` column is kept for when SMS OTP is added.

## Consequences

- No SMS cost at launch. A simpler auth flow.
- Hostinger mailboxes have daily sending limits; **check the plan's limit**. If OTP, reminder or notification volume grows past it, switch the provider through the adapter.
- Manager login (mobile + password, AUTH-M) is unaffected. The temp password is shared by the Owner directly, so no SMS is needed.
