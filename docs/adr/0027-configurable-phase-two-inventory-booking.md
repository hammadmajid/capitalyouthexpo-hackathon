# ADR 0027: Configurable Phase 2 inventory and booking

- Status: Accepted
- Date: 2026-10-14
- Refs: BKG-001..009, ACC-001..003/006, SEC-001/003, CHG-007

## Context

The user approved combining marketplace/inventory/booking with Owner-configurable
policy. The latest answer makes Customer CNIC optional by Owner policy; earlier
mandatory-CNIC answer is superseded. Existing foundations and uncommitted login
work must be preserved. Full Phase 1 acceptance remains unfinished.

## Decision

Adopt SRS v2.2 supplement. Reuse brands as hostels and places as institutions.
Resolve hierarchical policy server-side with separately validated platform limits.
Use immutable quote/policy snapshots. Date intervals are half-open. An allocation
claims a room plus all slots (whole room) or one physical slot (bed); PostgreSQL
GiST exclusion protects overlapping stay/slot ranges. Transactions also lock live
actors and inventory. Owner preferences never weaken security/DB invariants.

## Consequences

Additive Drizzle migrations only; historical SQL remains unchanged. Real concurrency
and constraints must be verified on PostgreSQL, not replaced by unit mocks. New
public DTOs/media publication are separate from private evidence. Revised client
screens preserve session/capability/cookie/CSRF behavior. No financial processing.
