# Authentication email templates

React Email renders HTML and plain-text OTP verification, password reset and manager
welcome messages. Zod validates inputs; React escapes identity text. Welcome mail
contains no temporary password (ADR 0002). The worker delivers messages through the
SMTP EmailProvider; templates perform no network requests.

Run the repository's Turbo lint, typecheck, test and build commands. Template tests
run without containers. Actual encrypted outbox/SMTP delivery requires the real
Testcontainers/Mailpit integration task; see docs/ci-verification.md and STATUS for
observed evidence. File and push adapters remain separate Phase 1 work.
