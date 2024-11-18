# ADR 0014: Shared client generated from offline API metadata

- Status: Accepted
- Date: 2026-10-08
- Requirements: SEC-001, SEC-003, AUTH-C, CHG-005

## Context

Web and mobile need the same typed API contract with different credential
transports. Local Windows development must support source checks without a
container runtime while real infrastructure tests remain mandatory in CI.

## Decision

Generate OpenAPI 3.1 from the actual Nest controller metadata and real provider
constructors without connecting to PostgreSQL, Redis or S3. Generate and commit
the shared TypeScript client schema using openapi-typescript. Turbo orders API
build, document generation, client generation and client build. CI regenerates
and rejects drift. Generated schemas alone are exempt from file-size limits.

Use openapi-fetch with explicit cookie or bearer transport. Cookie mutations
attach the caller's CSRF token. Mobile public authentication and refresh omit
bearer tokens. Validate response bodies against shared strict Zod contracts and
decode RFC 9457 problems without putting server details in error messages.

Share approved typed visual tokens through @hsm/ui and generate web CSS from
that source. Contrast tests enforce readable normal text in approved pairings.

## Consequences

Metadata generation is a non-container source check; it cannot establish
infrastructure correctness or an integration PASS. Existing Testcontainers
tests, coverage and security gates remain mandatory. Browser and native
authentication restoration and capability routing need their own verification.
