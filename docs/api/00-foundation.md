# API 00: Runtime foundation

Implemented in Task 6; SEC-001/003. All routes below are PUBLIC and disclose no identities.

| Method | Path             | Result                                                       |
| ------ | ---------------- | ------------------------------------------------------------ |
| GET    | /v1/health/live  | 200, status alive; downstream outages do not fail liveness   |
| GET    | /v1/health/ready | 200 ready or 503 unavailable, with PostgreSQL/Redis booleans |
| GET    | /v1/docs         | Swagger UI, development/test only                            |
| GET    | /v1/docs-json    | OpenAPI 3.1, development/test only                           |

Request correlation: every request receives a server-generated UUID. Incoming X-Request-Id values are ignored (SEC-003) so client-controlled identity cannot enter correlation logs.
Responses include X-Request-Id; errors retain the v1 traceId field and problem+json contract.
Unexpected failures never include exception messages, SQL, stack traces or configuration.
Zod validation rejects unknown input properties. Body limit defaults to 1 MiB.

CORS uses explicit environment origins; production/staging require HTTPS origins.
Proxy headers are trusted only from explicitly configured trusted proxy IPs.
Redis-backed global IP limits fail closed; health probes remain independent of the limiter.
Startup requires valid configuration and live PostgreSQL/Redis. Shutdown closes dependencies.
See apps/api/README.md and docs/phase-1-remaining.md for commands and verification evidence.

Structured logs retain only server request IDs, registered route patterns, methods, status codes,
response timing and typed error codes. Unknown fields, raw paths/query strings, exception
messages/stacks, format arguments and client identifiers are omitted. Messages use a fixed
allowlist. Logging does not change authorization, response errors or session behavior.
