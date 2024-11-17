# HSM API foundation

Task 6 (SEC-001/003): NestJS with Fastify, one shared PostgreSQL database and Redis.
Business endpoints use /v1. Task 7 authentication and subsequent Phase 1 tasks follow
only after this checkpoint is verified.

Copy the root .env.example to an ignored .env, supply DATABASE_URL and REDIS_URL,
and use an explicit CORS_ORIGINS list. APP_ENV is development, test, staging or production.
TRUST_PROXY accepts only comma-separated trusted IP addresses; blank means no proxy trust.
API_HOST defaults to loopback; container deployments explicitly set 0.0.0.0.
Production/staging origins require HTTPS. Documentation is disabled in both deployed modes.

Run from the repository root:

- pnpm install --frozen-lockfile
- pnpm turbo run build --filter=@hsm/api
- pnpm turbo run dev --filter=@hsm/api --env-mode=loose
- pnpm turbo run lint typecheck test build --filter=@hsm/api --concurrency=1
- pnpm turbo run test:integration (compatible container environment)

The runtime reads the ignored root .env through Node's environment loader; production
may supply environment directly. Environment is validated exactly once at startup.
Startup refuses invalid configuration or unavailable required dependencies.
No production in-memory cache/rate-limit fallback exists.

GET /v1/health/live checks the process; GET /v1/health/ready checks PostgreSQL and Redis.
GET /v1/docs and /v1/docs-json expose OpenAPI 3.1 in development/test.
Health probes bypass the Redis rate limiter so outages cannot make liveness fail.
Every other request uses an atomic Redis IP counter. Request IDs are server-generated UUIDs; incoming client correlation values are ignored. Responses and problem responses include correlation IDs.
Request logging retains registered route patterns, method/status/timing and typed error codes. Unknown fields, raw paths/queries, bodies/headers, exception text and formatting arguments are omitted. Client exceptions never receive SQL, stacks or dependency diagnostics.

Local HTTP tests use a real Nest/Fastify application with dependency adapters.
Real PostgreSQL/PostGIS and Redis tests are additional mandatory Testcontainers tests
discovered by the existing Ubuntu CI task; they are NOT RUN LOCALLY without a runtime.
Neither test family substitutes for the other. SIGTERM/SIGINT close HTTP, DB and Redis.

Task 13 API telemetry is optional. Set SENTRY_DSN to a public Sentry project DSN;
leave it blank to disable reporting. Deployed environments require HTTPS, and
local HTTP collectors are restricted to loopback in development/test. DSNs cannot
contain passwords, query parameters or fragments. No upload/authentication token
is required or exposed to clients.

The SDK sends only fixed application-failure markers, service/environment and a
fresh event identifier. The final envelope guard removes request/user context,
exception text, stacks, attachments and SDK metadata, including internal paths
that bypass beforeSend. Automatic integrations, tracing and data collection are
disabled. Provider rejection or network loss does not change API responses,
authorization or database transactions. Hosted project delivery is a separate
operational check; loopback transport tests do not establish hosted receipt.

The root OpenTelemetry API peer version is pinned so Drizzle consumers resolve a
single compatible ORM instance. After dependency changes, run the frozen workspace
install before typechecking; strict ORM types must not be bypassed with casts.
