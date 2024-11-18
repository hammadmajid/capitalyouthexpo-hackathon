# Phase 1 application-container verification

The complete containerized stack must be successfully verified in a compatible
container environment. This may be a developer machine or the project's CI
environment. Docker Desktop specifically is not required.

## Authoritative commands

Use a Linux Docker-compatible environment that supports host networking. Build
from the repository root, then execute the same Turbo task used by GitHub Actions:

```sh
docker build -f infra/containers/ci.Dockerfile -t hsm-phase1-ci:local .
HSM_CI_IMAGE=hsm-phase1-ci:local pnpm turbo run test:containers --filter=@hsm/api --concurrency=1
```

The new **Real API worker and web containers** job builds the exact commit into a
non-root Node image and starts separate API, worker and production Next.js
containers using Testcontainers. There is no host-process fallback. PID 1 checks
prove the actual application entries run inside those containers. Host networking
allows the test driver and application containers to share ephemeral infrastructure
and signed private-storage URLs; this fixture requires a local Linux runtime.
Existing remote-runtime and non-container developer workflows remain available
through the existing commands and fixtures.

Infrastructure is fresh per suite: PostgreSQL 17 with PostGIS 3.5, Redis 7.4,
Mailpit SMTP, a private S3-compatible bucket and ClamAV. Drizzle replays the checked-in
migrations before application startup. Tests exercise real readiness, staged email
registration and worker delivery, absence of a session before permanent password,
one-use setup, private upload scanning and download, and web BFF cookie/CSRF/logout.
Secrets, setup tokens and mail payloads stay in process memory. No container logs,
inspect output, screenshots, traces or environment dumps are uploaded.

## Existing gates retained

- **Real infrastructure integration:** unchanged `pnpm turbo run test:integration
--concurrency=1`, including clean migration replay, extension requirements, seed
  idempotency, constraints, authorization, transaction rollback and concurrency.
- **Real browser and API integration:** production browser checks against the API,
  worker and real infrastructure.
- **Real Android and API integration:** seven native acceptance cases against real
  infrastructure, including SecureStore restart and persisted revocation.
- Quality, coverage, secrets, security audit/backport integrity and static analysis
  remain blocking. This additional job does not replace any existing gate.

Windows without a container runtime can still install, lint, typecheck, run unit,
contract and component tests, build and develop applications. Container-dependent
checks are **NOT RUN LOCALLY** in that environment. A configured job is not **CI
PASS**: report CI PASS only after the actual run succeeds for the relevant commit.
An overall successful run for the exact final SHA is required to close revised
Phase 1; product flows and whole-app coverage must also meet CHG-006 acceptance.

## Browser private uploads

Set the server-only `WEB_UPLOAD_ORIGIN` to the exact HTTP(S) origin serving signed
uploads. Staging/production require HTTPS. The CSP permits this origin without
adding wildcard destinations or copying signed paths/credentials. The private
bucket must permit browser PUT from the exact `WEB_ORIGIN`, with only the
`content-type` request header. Bucket ownership and private ACL remain required.
The browser Testcontainers fixture applies this narrowly scoped CORS policy;
local storage initialization and deployed bucket configuration must also apply it
before browser uploads can work. This configuration is not proof of a completed
real browser/ClamAV acceptance run.

Compose storage initialization now applies `infra/storage/cors.json`: only PUT
with `content-type` from `http://localhost:3000`, with a 300-second preflight cache.
For a different development `WEB_ORIGIN`, provide a JSON policy containing only
that exact origin and set `S3_CORS_CONFIG` to its host path before starting Compose.
The file is mounted read-only. CORS does not grant anonymous access; signed upload
capabilities, private ACLs and API clean-scan/ownership checks remain required.
Do not use wildcard origins or headers for private profile evidence.
