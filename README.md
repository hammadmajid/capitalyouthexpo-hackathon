# Twin Cities Hostel Marketplace & Management System

Verified hostels, real available seats and real prices for students and young professionals in
Islamabad and Rawalpindi, connected directly to the tools hostel owners use to run their
branches.

## The problem

Finding a hostel in the twin cities means scrolling Facebook groups, calling numbers that
don't pick up, and visiting places whose photos, prices and "available seats" turn out to be
wrong. Hostel owners, meanwhile, track beds, rent and complaints in registers and WhatsApp.

## What we built

| Pillar                  | Platform                       | What it does                                                                                                        |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Customer marketplace    | Mobile app (Expo React Native) | Search verified hostels by area and nearby university, see seat-level availability and price, book, then live there |
| Resident portal         | Mobile app                     | Pay rent with proof upload, get receipts, raise complaints, see the menu and transport, check out                   |
| Hostel management       | Web app (Next.js)              | Owners and Branch Managers run beds, bookings, residents, rent, staff and transport across branches                 |
| Platform administration | Web app                        | Hostel verification, moderation, support and audit                                                                  |

**Core principle:** marketplace availability comes from real branch operations (the Bed Board),
never from a separately edited marketing number.

## Architecture

```
apps/
  mobile   Expo React Native customer + resident app
  web      Next.js management and admin web app
  api      NestJS REST API (one API for both apps)
  worker   BullMQ background jobs (billing, notifications, file scanning)
packages/
  db         Drizzle ORM schema + migrations (PostgreSQL 17 + PostGIS)
  contracts  Shared Zod schemas, money and date helpers
  api-client Generated typed API client
  ui, security, files, notifications, emails, observability, config, test-support
```

Stack: TypeScript everywhere · pnpm + Turborepo · PostgreSQL/PostGIS · Redis/BullMQ ·
S3-compatible storage · Docker Compose.

## Engineering highlights

- **Branch-scoped authorisation:** every management request resolves the branch server-side; a
  manager can never reach another branch through the UI, URL or API.
- **No double booking:** seat changes run in row-locked transactions with concurrency tests.
- **Money is exact:** integer paisa (`bigint`) end to end, never floating point.
- **Audited:** every privileged action writes an audit log in the same transaction.
- **Private by default:** CNIC, documents and payment proofs are masked, served through
  short-lived signed URLs and access-logged.
- 1,000+ test files (unit, integration on real Postgres via Testcontainers, API, authorisation
  matrix, concurrency, Playwright and Maestro E2E).

## Run it locally

Requires Node 24, Corepack and Docker (Compose v2).

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env            # then fill in local values
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm turbo run db:migrate db:seed
pnpm dev
```

Checks: `pnpm turbo run lint typecheck test build` and `pnpm turbo run test:integration`.
See [infra/README.md](infra/README.md) for the local services.

## Documentation

- [Product overview](docs/00-project-overview.md) · [Roles & permissions](docs/01-roles-and-permissions.md)
- [Architecture](docs/02-architecture.md) · [Domain model](docs/03-domain-model.md)
- [Database schema](docs/06-database-schema.md) · [API contract](docs/07-api-contract.md)
- [Screens](docs/08-screens.md) · [Design system](docs/09-design-system.md)
- [Architecture decision records](docs/adr/) · [Requirements (SRS)](docs/srs/)
