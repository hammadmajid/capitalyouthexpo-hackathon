# ADR 0019: Telemetry envelope privacy

- **Status:** Accepted
- **Date:** 2026-10-09
- **Requirements:** SEC-003; Phase 1 Task 13

## Context

Sentry error events may include identity, request data, exception text and source
context. Attachments and internal SDK error events can bypass event-level
sanitization. SDK versions also expose different privacy configuration options.
All three applications need one platform-neutral disclosure policy.

## Decision

Use the shared observability package to validate four environments and optional
public DSNs. Require HTTPS outside development/test and allow local HTTP collectors
only on loopback. Reject passwords, queries, fragments and unexpected DSN paths.

Reconstruct error telemetry from fixed service/environment/error markers and a
fresh generated event ID. Never copy original event fields, raw exception text,
stack frames, identity, breadcrumbs, request data or formatting arguments. At the
final envelope, replace headers and error payloads; omit attachments, sessions,
traces, logs, metrics, replay and SDK metadata. Platform SDK adapters must register
this envelope guard during initialization and keep automatic data collection,
source uploads and native crash payloads disabled.

## Consequences

The foundation provides private error counts grouped by service and environment;
raw stacks and user context are intentionally unavailable. API request correlation
remains in the sanitized API logs and response trace IDs. SDK wire tests must prove
that private inputs do not reach the collector, including paths bypassing
beforeSend. SDK outages must not alter authorization or core application behavior.
The shared policy is verified independently; its existence does not establish
SDK transport, hosted collection, client boundary or full-stack verification.

The browser fetch transport explicitly omits credentials and referrers. Envelope
filtering alone cannot prevent automatic same-origin cookies; wire verification
must also verify transport controls. Manual browser clients register only the
privacy guard, and server/client errors report fixed markers through safe callbacks.

The React Native adapter likewise uses a manually initialized client with only
the privacy guard and JavaScript fetch transport, with credentials/referrers
omitted. Initialization is lazy when the optional public DSN is enabled. Native
crash/session/performance collection, screenshots, logs and source uploads remain
disabled. Component and font failures report fixed markers without original
errors. SDK HTTP fixtures restore Node stream/performance classes before loading
real Undici in Jest; they do not replace infrastructure-dependent integration tests.

Invalid optional mobile telemetry configuration disables reporting before SDK
loading, preserving application startup. Real HTTP tests also cover direct event
submission and require exact closed envelope headers and payloads. Component
coverage gates measure the SDK and root boundary separately from policy/runtime
coverage; these scoped reports do not establish whole-application coverage.
