# 02: Architecture

Decision record: `docs/adr/0001-technology-stack.md`. This doc is the working reference.

Current product direction supersedes the initial role split shown below: Mobile and Web eventually provide full business-function parity for Customer, Resident, Owner, Manager and Admin. Both use the same backend/API, database, authorization and business rules; only platform-specific UI differs. This direction is not evidence that every platform screen is implemented. Current approved work is audit remediation and Phase 11 acceptance preparation; use STATUS.md and the active roadmap for scope. Historical diagrams and milestones below are retained.

## System overview (original planning diagram)

```
 ┌──────────────────────┐        ┌───────────────────────────┐
 │ Customer Mobile App  │        │ Management Web App        │
 │ Expo React Native    │        │ Next.js                   │
 │ (Android → iOS)      │        │ Owner · Manager · Admin   │
 │ Guest/Customer/      │        │ + public SSR pages        │
 │ Resident             │        │ (parent share, uni pages) │
 └─────────┬────────────┘        └────────────┬──────────────┘
           │  HTTPS REST (OpenAPI) + WebSocket │
           └───────────────┬───────────────────┘
                   ┌───────▼────────┐        ┌──────────────┐
                   │  NestJS API    │───────▶│ Redis        │
                   │  (Fastify)     │        │ cache/queues │
                   └───┬────────┬───┘        └──────┬───────┘
                       │        │                   │
              ┌────────▼──┐  ┌──▼─────────────┐  ┌──▼──────────────┐
              │PostgreSQL │  │ Object storage │  │ Worker (BullMQ) │
              │ + PostGIS │  │ R2 / Spaces    │  │ invoices, expiry│
              └───────────┘  │ private+signed │  │ reminders, PDFs │
                             └────────────────┘  │ notifications   │
                                                 └───────┬─────────┘
                              Expo Push · Email · SMS/WhatsApp (adapters)
```

## Tech stack

| Layer            | Choice                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language         | TypeScript everywhere                                                                                                                                        |
| Monorepo         | pnpm workspaces + Turborepo                                                                                                                                  |
| Mobile           | Expo (React Native, New Architecture), Expo Router, TanStack Query, NativeWind, react-native-maps (behind an adapter), EAS Build/Submit/Update               |
| Web              | Next.js (App Router), Tailwind + shadcn/ui, TanStack Query + Table, React Hook Form + Zod                                                                    |
| API              | NestJS with Fastify adapter, REST, OpenAPI spec generated from code                                                                                          |
| API client       | Generated from OpenAPI (orval or openapi-typescript), shared by mobile + web                                                                                 |
| Database         | **PostgreSQL 17 + PostGIS**                                                                                                                                  |
| ORM / migrations | Drizzle ORM + drizzle-kit                                                                                                                                    |
| Queue / cache    | Redis + BullMQ                                                                                                                                               |
| Realtime         | Socket.IO gateway + Redis adapter (chat, live boards)                                                                                                        |
| Auth             | Password login (argon2id) + **email OTP** for verification/reset; short-lived JWT access + DB-backed rotating refresh sessions (instant revocation)          |
| Files            | S3-compatible private bucket (Cloudflare R2 or DigitalOcean Spaces), signed URLs                                                                             |
| Notifications    | Expo Push (FCM/APNs); email via **Hostinger SMTP** (Nodemailer) with **React Email** templates (ADR 0002); SMS/WhatsApp **deferred**, adapter interface kept |
| PDF              | HTML → PDF in the worker (Playwright/Chromium) for receipts and reports                                                                                      |
| Payments         | Rent: **none** (manual proof). Subscriptions: **deferred** (CHG-003); system free at launch                                                                  |
| Observability    | Pino logs, Sentry (api/web/mobile), Uptime Kuma                                                                                                              |
| Testing          | Vitest, Testcontainers (real Postgres), Playwright (web), Maestro (mobile)                                                                                   |
| CI/CD            | GitHub Actions → Docker images → GHCR → VPS; EAS for mobile                                                                                                  |

## Planned repo layout

```
hsm/
  AGENTS.md  CLAUDE.md  README.md
  apps/
    mobile/        Expo app: guest, customer, resident portal
    web/           Next.js: owner, manager, platform admin, public share pages
    api/           NestJS: HTTP + WebSocket
    worker/        BullMQ processors (separate process, shares api code)
  packages/
    db/            Drizzle schema, migrations, seeds (cities, sectors, universities)
    contracts/     Zod schemas, enums (seat/booking/invoice states), shared types
    api-client/    Generated OpenAPI client
    emails/        React Email templates (OTP, booking, rent, receipts…)
    notifications/ Transactional fixed notices, outbox producer and in-app publication
    ui/            Shared web components
    design-tokens/ Colours, type, spacing → Tailwind preset + CSS vars (web + NativeWind)
    config/        tsconfig, eslint, prettier presets
  infra/           docker-compose, Caddyfile, backup/restore scripts
  docs/            planning docs, ADRs, SRS text
```

## Backend module map (NestJS modules ↔ SRS sections)

| Module                                                                           | SRS                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `auth`, `users`, `sessions`                                                      | §4–5 (AUTH-C, AUTH-M)                                                              |
| `staff` (manager assignments)                                                    | MGR-*                                                                              |
| `organizations` (owner, brand, branch)                                           | BRN-*                                                                              |
| `geography` (city, area, sub-area, university, workplace)                        | GEO-*                                                                              |
| `property` (building, floor, room, seat, photos, amenities)                      | PROP-_, ROOM-_, SEAT-*                                                             |
| `verification` (listing review)                                                  | TRUST-_, ONB-_                                                                     |
| `marketplace` (search, detail, compare, share)                                   | §6–7                                                                               |
| `bed-board` (assignments, transfers)                                             | BED-*                                                                              |
| `bookings` (requests, reservations, status history)                              | BKG-*                                                                              |
| `visits`, `chat`, `waitlist`                                                     | COMM-_, VISIT-_, WAIT-*                                                            |
| `residents` (stays, walk-ins, documents, agreements)                             | STAY-_, RES-_                                                                      |
| `billing` (invoices, payments, proofs, receipts, deposits, late fees, discounts) | RENT-_, PAY-_, RB-_, FIN-_, COLL-*                                                 |
| `services` (menu, transport)                                                     | SERV-*                                                                             |
| `complaints`                                                                     | CMP-*                                                                              |
| `checkout`                                                                       | OUT-*                                                                              |
| `reviews`                                                                        | REV-*                                                                              |
| `dashboards`, `reports`                                                          | OWN-_, MGRD-_, RPT-*                                                               |
| `subscriptions`                                                                  | SUB-* (**deferred**, CHG-003; only a `plan_status = free` field on Branch for now) |
| `platform-admin` (admins, moderation, support, announcements)                    | ADM-*                                                                              |
| `notifications` (outbox, channels)                                               | NTF-*                                                                              |
| `audit`                                                                          | AUD-*                                                                              |
| `files` (uploads, signed URLs)                                                   | SEC-003                                                                            |

## Engineering rules (mandatory)

1. **Branch scope guard.** Every management route resolves the target resource's `branch_id` server-side and checks Owner ownership or an active Manager assignment. Default deny. Never trust a `branchId` sent by the client without checking it.
2. **Seat integrity.**
   - Partial unique index: one active `bed_assignment` per seat, and one active assignment per customer.
   - Partial unique index: one live reservation per seat.
   - Check-in, checkout, transfer and booking confirmation run in one transaction with `SELECT … FOR UPDATE` on the seat, and revalidate seat state.
3. **Payment approval is atomic and idempotent.** One transaction covers payment status, invoice balance, receipt and the notification outbox row. An idempotency key guarantees one receipt for repeated clicks (PAY-008).
4. **Money** is stored as `bigint` paisa. **Time** is stored as `timestamptz` and displayed in Asia/Karachi.
5. **Immutable IDs** (UUIDv7) internally; human display codes (`RCP-00182`) kept separately.
6. **Archive, don't delete** referenced records (`archived_at`).
7. **Audit log** rows are written in the same transaction as the privileged action. Append-only.
8. **Status history** tables for booking, complaint, verification and subscription.
9. **Outbox pattern.** Domain changes commit, then the worker delivers notifications with retries. A provider failure never rolls back domain state.
10. **Snapshots.** Bookings store the displayed price/deposit/policy version. Receipts store the approved payment snapshot. Price changes are effective-dated.
11. **Files.** Validate MIME, size and extension. Sensitive docs live in a private bucket, served only via short-lived signed URLs after an auth check.
12. **Provider adapters** for SMS, email, maps, push and payments, so they can be swapped without touching domain code.
13. **Rate limits** on login, OTP, proof upload, support and report endpoints.

## Deployment (VPS)

- Ubuntu LTS, Docker Compose, **Caddy** reverse proxy with automatic TLS.
- Containers: `caddy`, `api`, `worker`, `web`, `postgres` (PostGIS image), `redis`.
- Start: one VPS, ~4 vCPU / 8 GB. Later: move Postgres to a dedicated VPS or a managed DB.
- Only ports 80/443 and SSH are public. DB and Redis stay on the internal network.
- Backups: nightly `pg_dump` + WAL archiving (pgBackRest) to off-site object storage. A **restore drill is required before go-live**.
- Environments: `local` (docker compose), `staging`, `production`.
- Secrets live in env files on the server only (never committed); `.env.example` is committed.

Phase 2 business coverage: [ADR 0031](adr/0031-phase-two-business-coverage.md) extends
the exact-revision combined job with separate 90% server-domain floors, preserving
the whole-application 80% denominator and every existing package/infrastructure gate.
