# ADR 0004: Authoritative container verification in CI

- **Status:** Accepted
- **Date:** 2026-10-07
- **Source:** User instruction; Phase 1 roadmap; ACC-002, ACC-006, ADM-001/002

## Context

The Windows developer machine has no container runtime. Foundation integration tests
require real PostgreSQL/PostGIS, Redis, migrations, constraints and transactions.
Local runtime availability must not alter their assertions or release gates.

## Decision

GitHub Actions on an Ubuntu runner is the authoritative container integration environment.
Keep Testcontainers and use the same `pnpm turbo run test:integration` command in CI and
on compatible developer machines. Separate source/unit quality checks from container jobs.
Do not mock databases, skip integration suites or report configuration as CI PASS.

The complete containerized stack must be successfully verified in a compatible container
environment. This may be a developer machine or the project's CI environment. No specific
desktop container product is required. Infrastructure smoke tests are a subset of complete
stack verification; API/application acceptance remains required as implemented.

## Consequences

Windows can install, lint, typecheck, unit/contract test, build and edit/develop applications
without a local runtime. Running database-backed features still needs reachable services.
GitHub Actions must succeed before container requirements are marked verified. Source,
integration and security job success does not establish coverage of unimplemented APIs.
See `../ci-verification.md` for the evidence and remaining gates.
