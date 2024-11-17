# Twin Cities Hostel Marketplace & Management System

A verified hostel marketplace (mobile app) connected to branch-scoped hostel operations (web app), for Islamabad and Rawalpindi.

**Repository:** https://github.com/ammad981/hsm (private)

**Status:** Phase 1: Foundations, development started. See [`docs/STATUS.md`](docs/STATUS.md) and the Phase 1 task list in [`docs/05-roadmap.md`](docs/05-roadmap.md).

| Start here                     |                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| New developer / AI agent       | [`AGENTS.md`](AGENTS.md)                                                                                                       |
| Current status & next steps    | [`docs/STATUS.md`](docs/STATUS.md)                                                                                             |
| Product summary                | [`docs/00-project-overview.md`](docs/00-project-overview.md)                                                                   |
| Architecture & stack           | [`docs/02-architecture.md`](docs/02-architecture.md)                                                                           |
| Requirements (source of truth) | `Twin_Cities_Hostel_Marketplace_Management_SRS_v2.0_50_pages.pdf` / [`docs/srs/SRS-v2.0-text.txt`](docs/srs/SRS-v2.0-text.txt) |

## Planned stack

Expo React Native (customer app) · Next.js (management web) · NestJS API · PostgreSQL + PostGIS · Drizzle ORM · Redis/BullMQ · Docker Compose on VPS

## Phase 1 implementation

Source foundations are being implemented. See [the implementation checkpoint](docs/phase-1-implementation.md)
and [STATUS](docs/STATUS.md) for verified work and remaining gates. Application directories
are currently placeholders, not runnable applications. Eventual mobile/web capability parity
uses the same API, authorization and database, per the user's implementation brief.

Use Node 24 LTS, Corepack and the pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test build
```

In a compatible container environment (GitHub Actions Ubuntu or a developer machine):

```sh
pnpm turbo run test:integration
```

Local infrastructure setup is documented in [infra/README.md](infra/README.md).
Real database tests retain Testcontainers and run authoritatively in GitHub Actions Ubuntu.
Windows source/unit work does not require a container runtime. See
[CI verification](docs/ci-verification.md) for commands and LOCAL PASS / CI PASS /
NOT RUN LOCALLY evidence. Git hooks also require gitleaks on PATH and a real Git
checkout. This supplied folder has no Git metadata; attach it to the existing repository
before committing or opening PRs. No new repository history is created automatically.
