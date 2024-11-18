# ADR 0039: Scoped informational hostel rules

- Status: Implementation in progress; verification pending
- Date: 2026-10-17
- Refs: TRUST-006, ACC-002/004, AUD-001, revised Phase 2

## Context

The approved public detail includes hostel rules and the baseline schema already
plans hostel_rules with branch/body/order/archival. This remaining listing feature
must not become a second executable pricing, authorization, booking or KYC policy.
Existing listing_edit grants, actor locks, audit and idempotency are reused.

## Decision

Add the planned table through a generated additive migration, retaining every old
migration. Internal revision plus opaque version supports optimistic edits; archive
records instead of deleting them. Plain text is bounded at 4000 characters per rule.
Order uses nonnegative integer plus UUID tie-breaker. Private active/archive pages
and public active pages use explicit continuation, default 20/max 100 per page,
not a hidden total count cap. Current branch/object scope and listing-edit authority
must be checked again before replay. Audit mutations in the same transaction.

Public reads require existing approved/unhidden/active parent visibility and contain
only id/body/order. They never expose actor, private identity, internal revision,
archive metadata or audit reason. Rule text is rendered as plain escaped text; it
cannot override closed enforced booking/KYC/financial/security policy or alter
immutable agreed snapshots. No business/default policy change is introduced.

## Current evidence

Generated additive migration `0017_gigantic_sally_floyd.sql`; registered private
transactional and public current-visibility routes; shared typed SDK; web management
and web/native public rules views are authored. Complete backend/DB/contracts static
lint/typecheck/build passed 26 tasks before the new SDK/UI additions. Focused rules
run initially passed 39 and failed seven cases: two genuine continuation-probe
validation defects repaired, five write-queue fixture issues corrected. Rerun is
pending. HTTP, SDK, UI and real Testcontainers cases are authored. Real migration
apply/clean replay, constraints, concurrency, CI, security and aggregate acceptance
remain pending. The older 35-task core pass predates this slice.
