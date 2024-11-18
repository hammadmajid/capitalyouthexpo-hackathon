# Real application-stack test support

Shared Testcontainers fixture for API and browser integration. Every invocation
starts real PostgreSQL 17/PostGIS, Redis, Mailpit, private S3-compatible storage
and ClamAV, replays the committed Drizzle migrations and launches the compiled API
and worker. The optional web origin configures the API CORS allow-list.

The API integration entry point re-exports this fixture, preserving its existing
test suites. No database, queue, SMTP, storage or scanner mocks are provided.
Container checks must run in a compatible runtime; Ubuntu CI is authoritative
when the developer machine has no runtime. This package is a test dependency,
not part of a deployed application.
