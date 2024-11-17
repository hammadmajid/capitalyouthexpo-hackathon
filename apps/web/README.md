# HSM web foundation

Next.js foundation for Customer, Resident, Owner, Manager and Admin contexts.
Backend capabilities control entry. Resident entry remains unavailable until
active-stay authorization is implemented in its scheduled phase.

Use the workspace-pinned pnpm and Node versions. From the repository root:

- `pnpm install --frozen-lockfile`
- `pnpm turbo run dev --filter=@hsm/web`
- `pnpm turbo run lint typecheck test build --filter=@hsm/web`

Development uses http://localhost:3000. Configure server-only API_ORIGIN
(default http://127.0.0.1:4000), WEB_ORIGIN and APP_ENV. Staging and production
require HTTPS origins. The same-origin /api/v1 route preserves HttpOnly cookies,
requires the exact mutation origin, and forwards the readable CSRF token.
The API validates all permissions and CSRF binding.

The standalone build includes static assets, the self-hosted font and its license.
Start the production server with the web package's start task and matching origin
environment. Do not put backend secrets in NEXT_PUBLIC variables.

Real browser verification requires a compatible container runtime:
`pnpm turbo run test:e2e --filter=@hsm/web --concurrency=1`.
Ubuntu CI installs Chromium and runs this identical command. It starts the actual
compiled web, API and worker with PostgreSQL 17/PostGIS, Redis, Mailpit, private
S3-compatible storage and ClamAV through Testcontainers. Screenshots, traces and
videos are disabled so entered authentication and identity data are not archived.

This is Phase 1 only. No property onboarding, marketplace, booking, rent or
resident management workflows are implemented.

Task 13 telemetry uses optional server SENTRY_DSN and public
NEXT_PUBLIC_SENTRY_DSN values. A DSN identifies a public collector project; never
supply a Sentry authentication/upload token. Leave values blank to disable the
corresponding reporter. Four APP_ENV values are supported. The browser environment
is embedded from APP_ENV at build time; build and runtime environments must match.

Server initialization validates both DSNs. Deployed collectors require HTTPS;
local HTTP collectors are accepted only on loopback in development/test. CSP
permits only the validated public collector origin and never includes DSN userinfo.
Reporting sends fresh fixed error events; original exceptions, identity, request
context, breadcrumbs, attachments, traces and SDK metadata are omitted. Automatic
SDK integrations, source upload and data collection are disabled. Page and root
error boundaries retain generic text and retry controls during provider failure.
Hosted Sentry receipt requires a separate operational check; local SDK transport
verification does not establish hosted delivery.

The browser collector transport explicitly omits credentials and referrers, even
when the collector shares the application origin. Real transport checks verify
those Fetch controls and confirm that logs, metrics and transactions are dropped.

Browser CI artifacts use a closed Playwright reporter. It records only fixed
scenario labels, actual outcomes and generic failure metadata in browser.xml.
Unknown, skipped, unreached and infrastructure failures fail the command. Raw
errors, assertions, entered values and attachments are omitted. CI uploads only
this XML; the real browser/API tests and their existing deadlines remain intact.

## Authentication return paths

Protected guest entry preserves only a canonical path in returnTo. Login accepts
existing public/account destinations and checks live capabilities before entering
an experience. Absolute URLs, encoded paths, queries, fragments, duplicate values
and unsupported paths fall back to the account entry page. Return state never
grants backend permission. The real browser/API lifecycle tests return to account
security after authentication. Registration continuation remains part of the
unfinished revised email-first flow.
