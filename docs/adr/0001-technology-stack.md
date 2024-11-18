# ADR 0001: Technology Stack

- **Status:** Accepted
- **Date:** 2026-10-06
- **Source:** SRS v2.0 (`Twin_Cities_Hostel_Marketplace_Management_SRS_v2.0_50_pages.pdf`)

## Context

- The customer marketplace ships as a **mobile app**: Android first, iOS later.
- The management system (Owner, Branch Manager, Platform Admin) is a **web app**.
- The team works in TypeScript / React / Node.
- Hosting is a VPS.
- The SRS puts data integrity, branch isolation, rent/payment auditability and correct bed booking ahead of visual polish (SRS p.2, p.50).

## Decision

TypeScript everywhere, in one pnpm + Turborepo monorepo.

| Layer         | Choice                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mobile        | React Native + Expo (New Architecture), Expo Router, TanStack Query, NativeWind; EAS Build/Submit/Update            |
| Web           | Next.js (App Router), Tailwind + shadcn/ui, TanStack Query/Table, React Hook Form + Zod                             |
| API           | NestJS (Fastify adapter), REST + OpenAPI; generated typed client shared by mobile and web                           |
| Database      | PostgreSQL 17 + PostGIS                                                                                             |
| ORM           | Drizzle ORM + drizzle-kit migrations                                                                                |
| Jobs / cache  | Redis + BullMQ                                                                                                      |
| Realtime      | Socket.IO gateway (Redis adapter)                                                                                   |
| Auth          | argon2id; short-lived JWT access token + DB-backed rotating refresh sessions                                        |
| Files         | S3-compatible private bucket (Cloudflare R2 / DO Spaces) with signed URLs                                           |
| Notifications | Expo Push, email (Resend/SES), SMS/WhatsApp behind a provider adapter                                               |
| Payments      | Rent: manual proof upload only (no gateway). Subscriptions: manual at launch, `PaymentProvider` interface for later |
| Observability | Pino, Sentry, Uptime Kuma                                                                                           |
| Testing       | Vitest, Testcontainers (Postgres), Playwright, Maestro                                                              |
| Deploy        | Docker Compose + Caddy on Ubuntu LTS VPS; GitHub Actions → GHCR                                                     |

## Rules this stack must enforce

1. **Branch scope guard.** Every management endpoint resolves the resource's branch and checks ownership/assignment on the server. Default deny (SEC-001, ACC-002).
2. **Seat integrity.** Partial unique indexes on active assignments and reservations. Check-in, transfer, checkout and payment approval each run in one transaction with row locks (BED-004, ACC-001, PAY-008).
3. **Money.** PKR is stored as integer paisa, never as a float.
4. **Audit.** Append-only audit logs are written in the same transaction as the action (AUD-001..004).
5. **Status history.** Booking, complaint, verification and subscription state changes are recorded.
6. **Outbox.** Notifications are sent from an outbox, so a provider failure never rolls back domain state.

## Consequences

- One language and shared Zod contracts across all three apps.
- iOS becomes a build target, not a rewrite.
- We operate Postgres/Redis ourselves on the VPS, so backups plus a tested restore are a launch requirement.
- NestJS is heavier than minimal frameworks. We accept that in exchange for structure and guard-based authorisation.
