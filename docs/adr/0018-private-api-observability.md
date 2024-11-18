# ADR 0018: Private API observability

- **Status:** Accepted
- **Date:** 2026-10-09
- **Requirements:** SEC-003; Phase 1 Task 13

## Context

Redaction by field name does not protect credentials embedded in request paths,
exception messages, formatting arguments or client-controlled correlation IDs.
Real Fastify/Pino regression tests exposed these paths before the correction.
Observability must remain useful without disclosing identity or credentials.

## Decision

Generate request UUIDs on the server and ignore incoming correlation IDs. Retain
only registered route patterns, method/status/timing, generated IDs and shared
typed error codes. Apply an allowlist to structured fields and fixed messages;
discard raw exception text, stack/cause, arbitrary metadata and format arguments.
Serialize errors to a fixed unexpected-error marker. Preserve existing response
trace IDs and the problem contract. Test the actual Fastify/Pino pipeline with
synthetic private values, including unmatched routes and child request IDs.

## Consequences

Logs provide route-level diagnostics and correlation without request contents.
Debugging loses raw stack traces and arbitrary messages; trusted typed error codes
remain available. Existing privacy assertions remain mandatory. This decision
covers API logging only: Sentry adapters, transport privacy, outage behavior and
client error boundaries remain separate unfinished Task 13 work.
