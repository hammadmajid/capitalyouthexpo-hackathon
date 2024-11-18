# Private observability policy

Phase 1 Task 13 / SEC-003. Platform SDK adapters consume this package; it does not
initialize a provider or send network requests itself.

- Validate development, test, staging and production with an optional public DSN.
- Permit HTTP only for loopback development/test collectors; deployed DSNs use HTTPS.
- Rebuild error events using fixed markers and newly generated event IDs.
- Guard the final envelope, including internal SDK events and post-processing attachments.
- Retain no raw event fields, stack frames, identity, credentials, request data or SDK metadata.

Run `pnpm turbo run lint typecheck test build --filter=@hsm/observability --concurrency=1`.
Unit coverage includes the public package entry point. Actual SDK transport/outage
verification is additional mandatory work; these tests do not replace it.
See ADR 0019 for the disclosure boundary and its diagnostic limitations.
