# ADR 0023: A separate gate verifies actual application containers

- **Status:** Accepted
- **Date:** 2026-10-11
- **Requirements:** CHG-006, SEC-001, SEC-003, ACC-001..006

## Context

Existing real integration, browser and native suites run infrastructure in
Testcontainers while launching application processes on the runner. Revised Phase 1
also requires the API, worker and production web application themselves to execute
inside containers. Windows without a runtime must remain useful for non-container work.

## Decision

Preserve every existing suite and add a blocking Ubuntu application-container job.
Build one non-root production application image for the exact commit, then launch
three independent Testcontainers application containers. Verify their PID 1 entries
and exercise real HTTP, persisted staged registration, SMTP delivery, private S3
upload/ClamAV scan/download and BFF cookie/CSRF/revocation behavior.

Use Linux host networking for application containers, allowing the test driver and
applications to share ephemeral infrastructure endpoints and signed private URLs.
There is no host-process fallback. The fixture accepts a locally built explicit
image tag; CI tags by commit SHA. Existing remote-runtime workflows remain unchanged.
The same Docker build and Turbo test task run in compatible Linux developer and CI
environments. Docker Desktop is not a requirement.

## Consequences

The new gate supplements migration replay, seed, constraints, rollback, concurrency,
browser, native, security and coverage gates. Its first actual successful CI run is
required before reporting CI PASS. Windows reports NOT RUN LOCALLY for this suite.
No raw container logs, inspect data or environments become artifacts. Ephemeral
credentials and email/setup payloads remain in memory; only test-result XML is uploaded.
This gate alone does not close remaining product UX or whole-app coverage acceptance.
